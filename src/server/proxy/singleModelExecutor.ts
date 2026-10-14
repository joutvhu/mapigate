import type { ModelCallResult, ExecuteSingleModelOptions, ProviderRequestContext } from "./types.js";
import type { SingleModelHandler } from "../../providers/types.js";
import { stripModelContextMarker, RuleEngine } from "../../core/router/ruleEngine.js";
import { LoadBalancer } from "../../core/router/loadBalancer.js";
import {
  getProviderCircuitBreaker,
  recordResilienceSuccess,
  recordResilienceFailure,
} from "../../core/resilience/index.js";
import { ProviderRepository } from "../../storage/repositories/providerRepo.js";
import { ModelRepository } from "../../storage/repositories/modelRepo.js";
import { SettingsRepository } from "../../storage/repositories/settingsRepo.js";
import { ProviderRegistry } from "../../providers/registry.js";
import { getRegistryProvider } from "../../providers/metadataRegistry.js";
import { getCapabilitiesForModel } from "../../core/capabilities/index.js";
import { stripHistoryForContext } from "../../core/router/capacityAdapter.js";
import { executeUpstreamFetch } from "./proxyDispatcher.js";
import { handleNonStreamingResponse, handleStreamingResponse } from "./responseHandlers.js";
import { logger, LogSymbol, maskKey, tagForSession } from "../../shared/logger.js";
import { applyReasoningReplayPolicy } from "../../core/caching/reasoningCache.js";

function tryFailover(
  providerId: string,
  account: any,
  status: number,
  cooldownMs: number,
  triedAccountIds: Set<string>,
  targetModel: string,
  reqTag: string,
  isCustom = false
): boolean {
  const next = LoadBalancer.pickAccount(providerId, { excludeAccountIds: triedAccountIds, targetModel });
  if (next) {
    const suffix = isCustom ? " in custom provider" : "";
    logger.line(
      reqTag,
      LogSymbol.FAILOVER,
      `Account '${account.name || account.id}' hit ${status} (rate-limit/quota)${suffix} · failing over to '${next.name || next.id}' (cooldown: ${cooldownMs}ms)`
    );
    return true;
  }
  return false;
}

export async function executeSingleModel(options: ExecuteSingleModelOptions): Promise<ModelCallResult> {
  const {
    req, res, body, modelStr, clientFormat, isPanel = false,
    requestId, startTime, clientTool, rawModel, rtkStats,
    is1mContext: optionIs1m,
    reqTag = options.req.reqTag || tagForSession(options.requestId),
  } = options;

  let targetModel = modelStr;
  let providerId: string | undefined;

  const { model: cleanModelStr, is1mContext: modelIs1m } = stripModelContextMarker(modelStr);
  const effectiveModelStr = cleanModelStr || modelStr;
  const is1mContext = Boolean(optionIs1m || modelIs1m);

  if (effectiveModelStr.includes("/")) {
    const slash = effectiveModelStr.indexOf("/");
    providerId = effectiveModelStr.slice(0, slash);
    targetModel = effectiveModelStr.slice(slash + 1);
  } else {
    const rules = ModelRepository.getAllRules();
    const resolved = new RuleEngine(rules).resolveModel(effectiveModelStr);
    targetModel = resolved.model;
    providerId = resolved.rule?.targetProviderId;
  }

  const { model: cleanTargetModel } = stripModelContextMarker(targetModel);
  if (cleanTargetModel) targetModel = cleanTargetModel;

  if (!providerId) {
    providerId = ProviderRepository.getAllProviders().find((p) => p.isActive)?.id;
  }
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

  let targetFormat = providerConfig.format || provider.defaultFormat || "openai";
  if (provider.id === "opencode" || provider.id === "oc") {
    targetFormat = targetModel.includes("union-alpha") ? "claude" : "openai";
  }

  const triedAccountIds = new Set<string>();
  let lastFailureResult: ModelCallResult | undefined;

  while (true) {
    const account = LoadBalancer.pickAccount(provider.id, { excludeAccountIds: triedAccountIds, targetModel });
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
      const resFailure = recordResilienceFailure({
        providerId: provider.id, accountId: account?.id, model: targetModel,
        status: customResult.status, errorText: errText,
      });

      if (resFailure.rateLimited && account) {
        const cdMs = resFailure.cooldownMs || 60_000;
        if (tryFailover(provider.id, account, customResult.status, cdMs, triedAccountIds, targetModel, reqTag, true)) {
          lastFailureResult = customResult;
          continue;
        }
      }
      return customResult;
    }

    let upstreamBody = provider.transformRequestBody(context);
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

    let upstreamRes = await executeUpstreamFetch(upstreamUrl, fetchOptions, effectiveProxy);

    if (!upstreamRes.ok && upstreamRes.status === 401 && provider.handleAuthRefresh) {
      const refreshed = await provider.handleAuthRefresh(context, upstreamRes.status);
      if (refreshed) {
        fetchOptions.headers = await provider.buildHeaders(context);
        upstreamRes = await executeUpstreamFetch(upstreamUrl, fetchOptions, effectiveProxy);
      }
    }

    if (!upstreamRes.ok) {
      const errText = await upstreamRes.text();
      const resFailure = recordResilienceFailure({
        providerId: provider.id, accountId: account?.id, model: targetModel,
        status: upstreamRes.status, errorText: errText, headers: upstreamRes.headers,
      });

      if (resFailure.rateLimited && account) {
        const cdMs = resFailure.cooldownMs || 60_000;
        if (tryFailover(provider.id, account, upstreamRes.status, cdMs, triedAccountIds, targetModel, reqTag, false)) {
          lastFailureResult = { ok: false, status: upstreamRes.status, text: errText, error: errText };
          continue;
        }
      }

      const durationMs = Date.now() - startTime;
      const sanitizedErr = errText.slice(0, 500).replace(/sk-[a-zA-Z0-9_-]{20,}/g, (m) => maskKey(m));
      logger.errorLine(reqTag, LogSymbol.ERROR, `ERROR ${upstreamRes.status} · ${provider.id}/${targetModel} · ${durationMs}ms\n    ${sanitizedErr}`);
      return { ok: false, status: upstreamRes.status, text: errText, error: errText };
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
