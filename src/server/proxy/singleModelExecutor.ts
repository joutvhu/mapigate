import type { ModelCallResult, ExecuteSingleModelOptions, ProviderRequestContext } from "./types.js";
import type { SingleModelHandler } from "../../providers/core/types.js";
import { LoadBalancer } from "../../core/router/loadBalancer.js";
import {
  getProviderCircuitBreaker,
  recordResilienceSuccess,
  recordResilienceFailure,
} from "../../core/resilience/index.js";
import { ProviderRepository } from "../../storage/repositories/providerRepo.js";
import { UsageRepository } from "../../storage/repositories/usageRepo.js";
import { SettingsRepository } from "../../storage/repositories/settingsRepo.js";
import { ProviderRegistry } from "../../providers/core/registry.js";
import { getRegistryProvider } from "../../providers/core/metadataRegistry.js";
import { getCapabilitiesForModel } from "../../core/capabilities/index.js";
import { stripHistoryForContext } from "../../core/router/capacityAdapter.js";
import { executeUpstreamFetch } from "./proxyDispatcher.js";
import { handleNonStreamingResponse, handleStreamingResponse } from "./responseHandlers.js";
import { logger, LogSymbol, maskKey, tagForSession } from "../../shared/logger.js";
import { appendStructuredLog } from "../utils/consoleLogBuffer.js";
import { sanitizeErrorMessage, sanitizeHeaders } from "../../shared/utils/errorSanitizer.js";
import { applyReasoningReplayPolicy } from "../../core/caching/reasoningCache.js";
import { extractConversationPrefixHash } from "../../core/caching/promptCacheAffinity.js";
import { applyCacheControlPolicy } from "../../core/caching/cacheControlPolicy.js";
import { normalizeToolsToOpenAi } from "../../core/adapters/helpers/toolSchemaNormalize.js";

import fs from "node:fs";
import path from "node:path";
import { getDefaultDataDir } from "../../shared/constants/index.js";
import { tryFailover, resolveTargetModelAndProvider, extractSessionId } from "./executorHelpers.js";

/**
 * Safely clones upstream request body, including messages and their content blocks,
 * to prevent in-place mutation of the original context.body / req.body
 * when cache control stripping or reasoning replay runs.
 */
function cloneBodyForUpstream(body: any): any {
  if (!body || typeof body !== "object") return body;
  try {
    return structuredClone(body);
  } catch {
    const cloned = { ...body };
    if (Array.isArray(body.messages)) {
      cloned.messages = body.messages.map((m: any) => {
        if (!m || typeof m !== "object") return m;
        const msg = { ...m };
        if (Array.isArray(msg.content)) {
          msg.content = msg.content.map((c: any) => (c && typeof c === "object" ? { ...c } : c));
        }
        return msg;
      });
    }
    if (Array.isArray(body.tools)) {
      cloned.tools = body.tools.map((t: any) => (t && typeof t === "object" ? { ...t } : t));
    }
    if (Array.isArray(body.system)) {
      cloned.system = body.system.map((s: any) => (s && typeof s === "object" ? { ...s } : s));
    }
    return cloned;
  }
}

export async function executeSingleModel(options: ExecuteSingleModelOptions): Promise<ModelCallResult> {
  const {
    req, res, body, modelStr, clientFormat, isPanel = false,
    requestId, startTime, clientTool, rawModel, rtkStats,
    is1mContext: optionIs1m,
    reqTag = options.req.reqTag || tagForSession(options.requestId),
    apiKeyId,
    apiKeyName,
  } = options;

  const resolved = resolveTargetModelAndProvider(modelStr);
  let targetModel = resolved.targetModel;
  const providerId = resolved.providerId;
  const targetTag = resolved.targetTag;
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
  const adjustedBody = body;
  const prefixHash = extractConversationPrefixHash(adjustedBody);

  let targetFormat =
    provider.resolveTargetFormat?.(targetModel, clientFormat) ||
    providerConfig.format ||
    provider.defaultFormat ||
    "openai";
  if (provider.id === "opencode" || provider.id === "oc") {
    targetFormat = targetModel.includes("union-alpha") ? "claude" : "openai";
  }

  const triedAccountIds = new Set<string>();
  let lastFailureResult: ModelCallResult | undefined;
  let forceFreshNextAttempt = false;

  const targetProviderId = providerConfig.id || provider.id;
  const sessionId = extractSessionId(req, body);

  while (true) {
    const account = LoadBalancer.pickAccount(targetProviderId, {
      excludeAccountIds: triedAccountIds,
      targetModel,
      targetTag,
      prefixHash: prefixHash || undefined,
      sessionId,
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
      Boolean((providerConfig as any).requiresApiKey === false) ||
      Boolean((providerConfig as any).authType === "none") ||
      Boolean((providerConfig as any).isLocal) ||
      Boolean(regProv?.noAuth) ||
      Boolean(regProv?.requiresApiKey === false) ||
      Boolean(regProv?.authType === "none") ||
      Boolean(regProv?.isLocal) ||
      provider.requiresApiKey === false ||
      provider.isLocal === true;

    if (account && (account as any).apiKeyEncrypted && !account.rawApiKey) {
      logger.errorLine(
        reqTag,
        LogSymbol.ERROR,
        `Account '${account.name || account.id}' has an encrypted API key that failed to decrypt. Re-enter the API key in Settings/Providers.`
      );
    }

    if ((!account || !account.rawApiKey) && !hasCustomHeaders && requiresAccount && !isNoAuthOrProfile) {
      cb.releaseProbe();
      if (triedAccountIds.size > 0 && lastFailureResult) return lastFailureResult;
      logger.errorLine(reqTag, LogSymbol.ERROR, `No active API key account found for provider '${providerConfig.name}'`);
      return { ok: false, status: 503, error: `No active API key account found for provider '${providerConfig.name}'.` };
    }

    if (account) triedAccountIds.add(account.id);

    if (!isPanel) {
      UsageRepository.updatePendingRequest({
        id: requestId,
        model: targetModel,
        provider: targetProviderId,
        account: account?.name || account?.id,
      });
    }

    const context: ProviderRequestContext = {
      req, res, targetModel, clientFormat, targetFormat,
      body: cloneBodyForUpstream(adjustedBody), provider: providerConfig, account,
      isPanel, is1mContext, reqTag, requestId, startTime,
      clientTool, rawModel, rtkStats,
      apiKeyId, apiKeyName,
    };

    if (provider.execute && provider.id !== "combo") {
      const dispatchSingleModel: SingleModelHandler = async (mBody: any, mStr: string, isP: boolean = false) => {
        return executeSingleModel({ ...options, body: mBody, modelStr: mStr, isPanel: isP });
      };
      const customResult = await provider.execute(context, dispatchSingleModel);
      if (customResult.ok) {
        recordResilienceSuccess({ providerId: targetProviderId, accountId: account?.id, model: targetModel });
        return customResult;
      }

      const errText = customResult.text || customResult.error || "";
      const cleanErrText = sanitizeErrorMessage(errText);
      const resFailure = recordResilienceFailure({
        providerId: targetProviderId, accountId: account?.id, model: targetModel,
        status: customResult.status, errorText: cleanErrText,
      });

      if (resFailure.rateLimited && account) {
        const cdMs = resFailure.cooldownMs || 60_000;
        if (tryFailover(targetProviderId, account, customResult.status, cdMs, triedAccountIds, targetModel, reqTag, true, prefixHash || undefined, sessionId)) {
          lastFailureResult = { ...customResult, error: cleanErrText, text: cleanErrText };
          continue;
        }
      }
      return { ...customResult, error: cleanErrText, text: cleanErrText };
    }

    let upstreamBody = provider.transformRequestBody(context);
    if (upstreamBody) {
      upstreamBody = cloneBodyForUpstream(upstreamBody);
      applyCacheControlPolicy(upstreamBody, provider.id, targetModel, targetFormat);
      if ("client_metadata" in upstreamBody) {
        delete upstreamBody.client_metadata;
      }
    }
    if (upstreamBody && Array.isArray(upstreamBody.messages)) {
      applyReasoningReplayPolicy(upstreamBody.messages, provider.id, targetModel);
    }
    if (upstreamBody && Array.isArray(upstreamBody.tools) && targetFormat === "openai") {
      try {
        const normalizedTools = normalizeToolsToOpenAi(upstreamBody.tools);
        if (normalizedTools && normalizedTools.length > 0) {
          upstreamBody.tools = normalizedTools;
        }
      } catch {
        // Fail-open: preserve original tools
      }
    }
    if (!isPanel) {
      if (targetFormat === "openai" && upstreamBody && upstreamBody.stream !== false) {
        upstreamBody.stream_options = { ...(upstreamBody.stream_options || {}), include_usage: true };
      } else if (upstreamBody && upstreamBody.stream === false) {
        delete upstreamBody.stream_options;
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

    const abortController = new AbortController();
    context.abortController = abortController;
    const onClientClose = () => {
      abortController.abort();
    };
    if (typeof res?.once === "function") {
      res.once("close", onClientClose);
    }

    const upstreamTimeoutMs = Number(process.env.MAPIGATE_UPSTREAM_TIMEOUT_MS) || 180_000;
    const isStreaming = upstreamBody?.stream !== false && !isPanel;
    // Streaming generations with large contexts (e.g. 100k+ tokens) can take many minutes.
    // Use a generous ceiling (30 minutes) for streaming so active token streams aren't aborted mid-sentence at 180s.
    const effectiveTimeoutMs = isStreaming
      ? Math.max(upstreamTimeoutMs, 1_800_000)
      : upstreamTimeoutMs;
    const timeoutSignal = AbortSignal.timeout(effectiveTimeoutMs);
    const combinedSignal = (AbortSignal as any).any
      ? (AbortSignal as any).any([abortController.signal, timeoutSignal])
      : abortController.signal;

    const fetchOptions: any = {
      method: "POST",
      headers: outgoingHeaders,
      body: JSON.stringify(upstreamBody),
      signal: combinedSignal,
      ...(forceFreshNextAttempt ? { forceFreshSocket: true } : {}),
    };
    forceFreshNextAttempt = false;

    if (logger.isDebugEnabled()) {
      const accLabel = account?.name || account?.id ? `account: '${account?.name || account?.id}'` : "no account";
      logger.debug(
        "UPSTREAM",
        `[${reqTag}] Dispatching to ${providerConfig.name} (${targetProviderId}/${targetModel}) · ${accLabel} · stream: ${upstreamBody?.stream !== false}`
      );
    }
    if (logger.isTraceEnabled()) {
      logger.trace("UPSTREAM", `[${reqTag}] URL: ${upstreamUrl}`);
      logger.trace("UPSTREAM", `[${reqTag}] Headers: ${JSON.stringify(logger.sanitize(outgoingHeaders))}`);
    }

    let upstreamRes: any;
    try {
      if (res?.writableEnded || res?.destroyed) {
        cb.releaseProbe();
        return {
          ok: false,
          status: 499,
          error: "Client closed connection before upstream dispatch",
        };
      }

      upstreamRes = await executeUpstreamFetch(upstreamUrl, fetchOptions, effectiveProxy);

      if (!upstreamRes.ok && upstreamRes.status === 401 && provider.handleAuthRefresh) {
        const refreshed = await provider.handleAuthRefresh(context, upstreamRes.status);
        if (refreshed) {
          fetchOptions.headers = await provider.buildHeaders(context);
          upstreamRes = await executeUpstreamFetch(upstreamUrl, fetchOptions, effectiveProxy);
        }
      }
    } catch (fetchErr: any) {
      if (timeoutSignal.aborted) {
        cb.releaseProbe();
        return {
          ok: false,
          status: 504,
          error: `Upstream gateway timeout after ${upstreamTimeoutMs / 1000}s`,
        };
      }
      if (abortController.signal.aborted) {
        cb.releaseProbe();
        return {
          ok: false,
          status: 499,
          error: "Client aborted request",
        };
      }

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
        `FETCH FAILED · ${provider.id}/${targetModel} · ${durationMs}ms [req: ${requestId}]\n    ${cleanErrText}`
      );
      appendStructuredLog({
        id: requestId,
        timestamp: Date.now(),
        level: "error",
        category: "proxy",
        message: `Network fetch failed (${provider.id}/${targetModel}): ${cleanErrText.slice(0, 150)}`,
        requestId,
        reqTag,
        gateway: {
          clientTool,
          route: req.path,
          method: req.method,
          requestedModel: rawModel,
          actualModel: targetModel,
          providerId: targetProviderId,
          accountId: account?.id,
          accountName: account?.name,
          upstreamUrl,
          statusCode: 502,
          durationMs,
        },
        error: {
          status: 502,
          message: cleanErrText,
        },
        rawText: `[${reqTag}] ❌ FETCH FAILED · ${provider.id}/${targetModel} · ${durationMs}ms\n    ${cleanErrText}`,
      });

      // Attempt intra-provider failover on network / connection failure (RES-02)
      if (account) {
        const cdMs = 5000;
        if (
          tryFailover(
            targetProviderId,
            account,
            502,
            cdMs,
            triedAccountIds,
            targetModel,
            reqTag,
            false,
            prefixHash || undefined,
            sessionId
          )
        ) {
          lastFailureResult = { ok: false, status: 502, text: cleanErrText, error: cleanErrText };
          continue;
        }
      }

      return { ok: false, status: 502, text: cleanErrText, error: cleanErrText };
    } finally {
      const willStream = upstreamRes?.ok && upstreamBody?.stream !== false && !isPanel;
      if (!willStream && typeof res?.removeListener === "function") {
        res.removeListener("close", onClientClose);
      }
    }

    if (!upstreamRes.ok) {
      const errText = await upstreamRes.text();
      const cleanErrText = sanitizeErrorMessage(errText);
      try {
        const obsMode = SettingsRepository.getObservabilityMode();
        if (obsMode !== "off") {
          const debugFile = path.join(getDefaultDataDir(), "debug_failed_request.json");
          fs.writeFileSync(
            debugFile,
            JSON.stringify(
              {
                timestamp: new Date().toISOString(),
                url: upstreamUrl,
                status: upstreamRes.status,
                error: cleanErrText,
                headers: sanitizeHeaders(outgoingHeaders),
                body: obsMode === "all" ? upstreamBody : undefined,
              },
              null,
              2
            ),
            { encoding: "utf8", mode: 0o600 }
          );
        }
      } catch {}
      const resFailure = recordResilienceFailure({
        providerId: targetProviderId, accountId: account?.id, model: targetModel,
        status: upstreamRes.status, errorText: cleanErrText, headers: upstreamRes.headers,
      });

      const shouldFailover =
        resFailure.rateLimited ||
        upstreamRes.status >= 500 ||
        upstreamRes.status === 401 ||
        upstreamRes.status === 403 ||
        upstreamRes.status === 404;

      if (shouldFailover && account) {
        if (upstreamRes.status === 502) {
          forceFreshNextAttempt = true;
        }
        const cdMs = resFailure.cooldownMs || (resFailure.rateLimited ? 60_000 : 5000);
        if (tryFailover(targetProviderId, account, upstreamRes.status, cdMs, triedAccountIds, targetModel, reqTag, false, prefixHash || undefined, sessionId)) {
          lastFailureResult = { ok: false, status: upstreamRes.status, text: cleanErrText, error: cleanErrText };
          continue;
        }
      }

      let parsedErrObj: any = null;
      try {
        parsedErrObj = JSON.parse(errText);
      } catch {}
      const errorType = parsedErrObj?.error?.type || parsedErrObj?.type;
      const errorCode = parsedErrObj?.error?.code || parsedErrObj?.code;
      const errDetails = [
        errorType ? `type: ${errorType}` : "",
        errorCode ? `code: ${errorCode}` : "",
        account?.name ? `account: '${account.name}'` : "",
      ].filter(Boolean).join(" · ");
      const detailSuffix = errDetails ? ` (${errDetails})` : "";

      const durationMs = Date.now() - startTime;
      const sanitizedErr = cleanErrText.slice(0, 500);
      logger.errorLine(
        reqTag,
        LogSymbol.ERROR,
        `UPSTREAM ERROR ${upstreamRes.status} · ${targetProviderId}/${targetModel}${detailSuffix} · ${durationMs}ms [req: ${requestId}]\n    ${sanitizedErr}`
      );

      if (logger.isDebugEnabled()) {
        const respHeaders = Object.fromEntries(upstreamRes.headers.entries());
        const diagHeaders: Record<string, string> = {};
        for (const [k, v] of Object.entries(respHeaders)) {
          const lk = k.toLowerCase();
          if (lk.includes("ratelimit") || lk.includes("retry") || lk.includes("ray") || lk.includes("request-id")) {
            diagHeaders[k] = v;
          }
        }
        if (Object.keys(diagHeaders).length > 0) {
          logger.debug("UPSTREAM", `[${reqTag}] Diagnostic headers: ${JSON.stringify(diagHeaders)}`);
        }
      }

      appendStructuredLog({
        id: requestId,
        timestamp: Date.now(),
        level: upstreamRes.status === 429 ? "warn" : "error",
        category: "proxy",
        message: `Upstream error ${upstreamRes.status} on ${targetProviderId}/${targetModel}: ${sanitizedErr.slice(0, 150)}`,
        requestId,
        reqTag,
        gateway: {
          clientTool,
          route: req.path,
          method: req.method,
          requestedModel: rawModel,
          actualModel: targetModel,
          providerId: targetProviderId,
          accountId: account?.id,
          accountName: account?.name,
          upstreamUrl,
          statusCode: upstreamRes.status,
          durationMs,
        },
        error: {
          status: upstreamRes.status,
          code: errorCode,
          message: cleanErrText,
        },
        rawText: `[${reqTag}] ❌ UPSTREAM ERROR ${upstreamRes.status} · ${targetProviderId}/${targetModel}${detailSuffix} · ${durationMs}ms\n    ${sanitizedErr}`,
      });

      return { ok: false, status: upstreamRes.status, text: cleanErrText, error: cleanErrText };
    }

    recordResilienceSuccess({ providerId: targetProviderId, accountId: account?.id, model: targetModel });

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
