import type { ModelCallResult, ExecuteSingleModelOptions, ProviderRequestContext } from "./types.js";
import { stripModelContextMarker, RuleEngine } from "../../core/router/ruleEngine.js";
import { LoadBalancer, isRateLimitOrQuotaError } from "../../core/router/loadBalancer.js";
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

export async function executeSingleModel(options: ExecuteSingleModelOptions): Promise<ModelCallResult> {
  const {
    req,
    res,
    body,
    modelStr,
    clientFormat,
    isPanel = false,
    requestId,
    startTime,
    clientTool,
    rawModel,
    rtkStats,
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
    const ruleEngine = new RuleEngine(rules);
    const resolved = ruleEngine.resolveModel(effectiveModelStr);
    targetModel = resolved.model;
    providerId = resolved.rule?.targetProviderId;
  }

  const { model: cleanTargetModel } = stripModelContextMarker(targetModel);
  if (cleanTargetModel) targetModel = cleanTargetModel;

  if (!providerId) {
    const activeProvider = ProviderRepository.getAllProviders().find((p) => p.isActive);
    providerId = activeProvider?.id;
  }

  if (!providerId) {
    logger.errorLine(reqTag, LogSymbol.ERROR, `No active provider configured for model '${modelStr}'`);
    return { ok: false, status: 503, error: `No active provider configured for model '${modelStr}'.` };
  }

  const regProv = getRegistryProvider(providerId);
  const canonicalProviderId = regProv?.id || providerId;
  const providerConfig =
    (canonicalProviderId ? ProviderRepository.getProviderWithDefaults(canonicalProviderId) : undefined) ||
    (canonicalProviderId ? ProviderRepository.getProviderById(canonicalProviderId) : undefined) ||
    ProviderRepository.getProviderWithDefaults(providerId) ||
    ProviderRepository.getProviderById(providerId);

  if (!providerConfig) {
    logger.errorLine(reqTag, LogSymbol.ERROR, `Provider '${providerId}' not found`);
    return { ok: false, status: 502, error: `Provider '${providerId}' not found.` };
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
    const account = LoadBalancer.pickAccount(provider.id, triedAccountIds);
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
      req,
      res,
      targetModel,
      clientFormat,
      targetFormat,
      body: adjustedBody,
      provider: providerConfig,
      account,
      isPanel,
      is1mContext,
      reqTag,
      requestId,
      startTime,
      clientTool,
      rawModel,
      rtkStats,
    };

    let upstreamBody = provider.transformRequestBody(context);
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
        const retriedHeaders = await provider.buildHeaders(context);
        fetchOptions.headers = retriedHeaders;
        upstreamRes = await executeUpstreamFetch(upstreamUrl, fetchOptions, effectiveProxy);
      }
    }

    if (!upstreamRes.ok) {
      const errText = await upstreamRes.text();
      const isRateLimit = provider.isRateLimitOrQuotaError
        ? provider.isRateLimitOrQuotaError(upstreamRes.status, errText)
        : isRateLimitOrQuotaError(upstreamRes.status, errText);

      if (isRateLimit && account) {
        let cooldownMs = 60_000;
        const retryAfter = upstreamRes.headers?.get?.("retry-after");
        if (retryAfter) {
          const parsed = Number.parseInt(retryAfter, 10);
          if (Number.isFinite(parsed) && parsed > 0) cooldownMs = Math.max(10_000, parsed * 1000);
        }
        LoadBalancer.markRateLimited(account.id, cooldownMs, provider.id);
        const nextAccount = LoadBalancer.pickAccount(provider.id, triedAccountIds);
        if (nextAccount) {
          logger.line(
            reqTag,
            LogSymbol.FAILOVER,
            `Account '${account.name || account.id}' hit ${upstreamRes.status} (rate-limit/quota) · failing over to '${nextAccount.name || nextAccount.id}' (cooldown: ${cooldownMs}ms)`
          );
          lastFailureResult = { ok: false, status: upstreamRes.status, text: errText, error: errText };
          continue;
        }
      }

      const durationMs = Date.now() - startTime;
      const sanitizedErr = errText.slice(0, 500).replace(/sk-[a-zA-Z0-9_-]{20,}/g, (m) => maskKey(m));
      logger.errorLine(reqTag, LogSymbol.ERROR, `ERROR ${upstreamRes.status} · ${provider.id}/${targetModel} · ${durationMs}ms\n    ${sanitizedErr}`);
      return { ok: false, status: upstreamRes.status, text: errText, error: errText };
    }

    if (isPanel) {
      try {
        const json = await upstreamRes.json();
        return { ok: true, status: 200, json, modelUsed: targetModel };
      } catch {
        const text = await upstreamRes.text();
        return { ok: true, status: 200, text, modelUsed: targetModel };
      }
    }

    const isStreaming = upstreamBody.stream !== false;
    if (!isStreaming) {
      return await handleNonStreamingResponse(upstreamRes, res, context, provider, {
        upstreamUrl,
        outgoingHeaders,
        upstreamBody,
      });
    }

    return await handleStreamingResponse(upstreamRes, res, context, provider, {
      upstreamUrl,
      outgoingHeaders,
      upstreamBody,
    });
  }
}
