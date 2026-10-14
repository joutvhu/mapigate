import type { ModelCallResult, ExecuteSingleModelOptions, ProviderRequestContext } from "./types.js";
import type { SingleModelHandler } from "../../providers/types.js";
import { LoadBalancer } from "../../core/router/loadBalancer.js";
import {
  getProviderCircuitBreaker,
  recordResilienceSuccess,
  recordResilienceFailure,
} from "../../core/resilience/index.js";
import { ProviderRepository } from "../../storage/repositories/providerRepo.js";
import { SettingsRepository } from "../../storage/repositories/settingsRepo.js";
import { ProviderRegistry } from "../../providers/registry.js";
import { getRegistryProvider } from "../../providers/metadataRegistry.js";
import { getCapabilitiesForModel } from "../../core/capabilities/index.js";
import { stripHistoryForContext } from "../../core/router/capacityAdapter.js";
import { executeUpstreamFetch } from "./proxyDispatcher.js";
import { handleNonStreamingResponse, handleStreamingResponse } from "./responseHandlers.js";
import { logger, LogSymbol, maskKey, tagForSession } from "../../shared/logger.js";
import { sanitizeErrorMessage } from "../../shared/utils/errorSanitizer.js";
import { applyReasoningReplayPolicy } from "../../core/caching/reasoningCache.js";
import { extractConversationPrefixHash } from "../../core/caching/promptCacheAffinity.js";
import { applyCacheControlPolicy } from "../../core/caching/cacheControlPolicy.js";

import { tryFailover, resolveTargetModelAndProvider } from "./executorHelpers.js";

export async function executeSingleModel(options: ExecuteSingleModelOptions): Promise<ModelCallResult> {
  const {
    req, res, body, modelStr, clientFormat, isPanel = false,
    requestId, startTime, clientTool, rawModel, rtkStats,
    is1mContext: optionIs1m,
    reqTag = options.req.reqTag || tagForSession(options.requestId),
  } = options;

  const resolved = resolveTargetModelAndProvider(modelStr);
  let targetModel = resolved.targetModel;
  const providerId = resolved.providerId;
  const is1mContext = Boolean(optionIs1m || resolved.is1mContext);

  if (!providerId) {
    logger.errorLine(reqTag, LogSymbol.ERROR, `No active provider configured for model '${modelStr}'`);
    return { ok: false, status: 503, error: `No active provider configured for model '${modelStr}'.` };
  }

  const regProv = getRegistryProvider(providerId);
  const cid = regProv?.id || providerId;
  const providerConfig =
    ProviderRepository.getProviderWithDefaults(cid) ||
    ProviderRepository.getProviderById(cid) ||
    ProviderRepository.getProviderWithDefaults(providerId) ||
    ProviderRepository.getProviderById(providerId);

  if (!providerConfig) {
    logger.errorLine(reqTag, LogSymbol.ERROR, `Provider '${providerId}' not found`);
    return { ok: false, status: 502, error: `Provider '${providerId}' not found.` };
  }

  // Layer 1: Circuit breaker fast-fail if whole provider is OPEN
  const cb = getProviderCircuitBreaker(providerConfig.id);
  if (!cb.canExecute()) {
    const retrySec = Math.ceil(cb.getRetryAfterMs() / 1000) || 30;
    logger.errorLine(
      reqTag,
      LogSymbol.WARN,
      `Provider '${providerConfig.name}' circuit breaker is OPEN (fast-fail, retry-after: ${retrySec}s)`
    );
    return {
      ok: false,
      status: 503,
      error: `Provider '${providerConfig.name}' circuit breaker is OPEN. Upstream service is temporarily unavailable.`,
    };
  }

  const provider = ProviderRegistry.get(providerConfig.id);
  const { contextWindow } = getCapabilitiesForModel(providerConfig.id, targetModel);
  const adjustedBody = stripHistoryForContext(body, contextWindow);
  const prefixHash = extractConversationPrefixHash(adjustedBody);

  let targetFormat = providerConfig.format || provider.defaultFormat || "openai";
  if (provider.id === "opencode" || provider.id === "oc") {
    targetFormat = targetModel.includes("union-alpha") ? "claude" : "openai";
  }

  const triedAccountIds = new Set<string>();
  let lastFailureResult: ModelCallResult | undefined;

  while (true) {
    const account = LoadBalancer.pickAccount(provider.id, {
      excludeAccountIds: triedAccountIds,
      targetModel,
      prefixHash: prefixHash || undefined,
    });
    const hasCustomHeaders = Boolean(
      providerConfig.customHeaders && Object.keys(providerConfig.customHeaders).length > 0
    );
    const requiresAccount = provider.requiresAccount ?? true;
    const isNoAuthOrProfile =
      provider.id.startsWith("bedrock") ||
      provider.id === "ollama-local" ||
      provider.id === "ollama" ||
      provider.id === "opencode" ||
      provider.id === "oc" ||
      Boolean((providerConfig as any).noAuth) ||
      Boolean(regProv?.noAuth);

    if ((!account || !account.rawApiKey) && !hasCustomHeaders && requiresAccount && !isNoAuthOrProfile) {
      if (triedAccountIds.size > 0 && lastFailureResult) return lastFailureResult;
      logger.errorLine(reqTag, LogSymbol.ERROR, `No active API key account found for provider '${providerConfig.name}'`);
      return { ok: false, status: 503, error: `No active API key account found for provider '${providerConfig.name}'.` };
    }

    if (account) triedAccountIds.add(account.id);

    const context: ProviderRequestContext = {
      req, res, targetModel, clientFormat, targetFormat,
      body: adjustedBody, provider: providerConfig, account,
      isPanel, is1mContext, reqTag, requestId, startTime,
      clientTool, rawModel, rtkStats,
    };

    if (provider.execute && provider.id !== "combo") {
      const dispatchSingleModel: SingleModelHandler = async (mBody: any, mStr: string, isP: boolean = false) => {
        return executeSingleModel({ ...options, body: mBody, modelStr: mStr, isPanel: isP });
      };
      const customResult = await provider.execute(context, dispatchSingleModel);
      if (customResult.ok) {
        recordResilienceSuccess({ providerId: provider.id, accountId: account?.id, model: targetModel });
        return customResult;
      }

      const errText = customResult.text || customResult.error || "";
      const cleanErrText = sanitizeErrorMessage(errText);
      const resFailure = recordResilienceFailure({
        providerId: provider.id, accountId: account?.id, model: targetModel,
        status: customResult.status, errorText: cleanErrText,
      });

      if (resFailure.rateLimited && account) {
        const cdMs = resFailure.cooldownMs || 60_000;
        if (tryFailover(provider.id, account, customResult.status, cdMs, triedAccountIds, targetModel, reqTag, true, prefixHash || undefined)) {
          lastFailureResult = { ...customResult, error: cleanErrText, text: cleanErrText };
          continue;
        }
      }
      return { ...customResult, error: cleanErrText, text: cleanErrText };
    }

    let upstreamBody = provider.transformRequestBody(context);
    if (upstreamBody) {
      applyCacheControlPolicy(upstreamBody, provider.id, targetModel, targetFormat);
    }
    if (upstreamBody && Array.isArray(upstreamBody.messages)) {
      applyReasoningReplayPolicy(upstreamBody.messages, provider.id, targetModel);
    }
    if (!isPanel) {
      if (targetFormat === "openai" && upstreamBody && upstreamBody.stream !== false) {
        upstreamBody.stream_options = { ...(upstreamBody.stream_options || {}), include_usage: true };
      }
    } else {
      upstreamBody.stream = false;
      delete upstreamBody.tools;
      delete upstreamBody.tool_choice;
      delete upstreamBody.stream_options;
    }
    context.body = upstreamBody;

    const upstreamUrl = provider.buildUrl(context);
    const outgoingHeaders = await provider.buildHeaders(context);

    const globalSettings = SettingsRepository.getEndpointSettings();
    if (globalSettings.customHeaders) {
      for (const [k, v] of Object.entries(globalSettings.customHeaders)) {
        if (!outgoingHeaders[k]) outgoingHeaders[k] = v;
      }
    }

    const effectiveProxy = (providerConfig.proxyUrl && providerConfig.proxyUrl.trim()) ||
      (globalSettings.proxyUrl && globalSettings.proxyUrl.trim()) || "";

    const fetchOptions: any = {
      method: "POST",
      headers: outgoingHeaders,
      body: JSON.stringify(upstreamBody),
    };

    let upstreamRes: any;
    try {
      upstreamRes = await executeUpstreamFetch(upstreamUrl, fetchOptions, effectiveProxy);

      if (!upstreamRes.ok && upstreamRes.status === 401 && provider.handleAuthRefresh) {
        const refreshed = await provider.handleAuthRefresh(context, upstreamRes.status);
        if (refreshed) {
          fetchOptions.headers = await provider.buildHeaders(context);
          upstreamRes = await executeUpstreamFetch(upstreamUrl, fetchOptions, effectiveProxy);
        }
      }
    } catch (fetchErr: any) {
      const errMsg = fetchErr?.message || String(fetchErr);
      const cleanErrText = sanitizeErrorMessage(errMsg);
      recordResilienceFailure({
        providerId: provider.id,
        accountId: account?.id,
        model: targetModel,
        status: 502,
        errorText: cleanErrText,
      });

      const durationMs = Date.now() - startTime;
      logger.errorLine(
        reqTag,
        LogSymbol.ERROR,
        `FETCH ERROR · ${provider.id}/${targetModel} · ${durationMs}ms\n    ${cleanErrText}`
      );
      return { ok: false, status: 502, text: cleanErrText, error: cleanErrText };
    }

    if (!upstreamRes.ok) {
      const errText = await upstreamRes.text();
      const cleanErrText = sanitizeErrorMessage(errText);
      const resFailure = recordResilienceFailure({
        providerId: provider.id, accountId: account?.id, model: targetModel,
        status: upstreamRes.status, errorText: cleanErrText, headers: upstreamRes.headers,
      });

      if (resFailure.rateLimited && account) {
        const cdMs = resFailure.cooldownMs || 60_000;
        if (tryFailover(provider.id, account, upstreamRes.status, cdMs, triedAccountIds, targetModel, reqTag, false, prefixHash || undefined)) {
          lastFailureResult = { ok: false, status: upstreamRes.status, text: cleanErrText, error: cleanErrText };
          continue;
        }
      }

      const durationMs = Date.now() - startTime;
      const sanitizedErr = cleanErrText.slice(0, 500);
      logger.errorLine(reqTag, LogSymbol.ERROR, `ERROR ${upstreamRes.status} · ${provider.id}/${targetModel} · ${durationMs}ms\n    ${sanitizedErr}`);
      return { ok: false, status: upstreamRes.status, text: cleanErrText, error: cleanErrText };
    }

    recordResilienceSuccess({ providerId: provider.id, accountId: account?.id, model: targetModel });

    if (isPanel) {
      try {
        const json = await upstreamRes.json();
        return { ok: true, status: 200, json, modelUsed: targetModel };
      } catch {
        const text = await upstreamRes.text();
        return { ok: true, status: 200, text, modelUsed: targetModel };
      }
    }

    if (upstreamBody.stream === false) {
      return await handleNonStreamingResponse(upstreamRes, res, context, provider, {
        upstreamUrl, outgoingHeaders, upstreamBody,
      });
    }

    return await handleStreamingResponse(upstreamRes, res, context, provider, {
      upstreamUrl, outgoingHeaders, upstreamBody,
    });
  }
}
