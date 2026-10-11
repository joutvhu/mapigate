import type { Request, Response } from "express";
import { RuleEngine, stripModelContextMarker } from "../../core/router/ruleEngine.js";
import { LoadBalancer, isRateLimitOrQuotaError } from "../../core/router/loadBalancer.js";
import { RtkCompressor } from "../../core/rtk/compressor.js";
import { AnthropicAdapter } from "../../core/adapters/anthropicAdapter.js";
import { OpenAiAdapter } from "../../core/adapters/openAiAdapter.js";
import { signAwsSigv4Request } from "../../core/auth/awsSigv4.js";
import { decodeEventStreamChunk } from "../../core/adapters/awsEventStream.js";
import { ProviderRepository } from "../../storage/repositories/providerRepo.js";
import { ModelRepository } from "../../storage/repositories/modelRepo.js";
import { ComboRepository } from "../../storage/repositories/comboRepo.js";
import { SettingsRepository } from "../../storage/repositories/settingsRepo.js";
import { LogRepository } from "../../storage/repositories/logRepo.js";
import { UsageRepository } from "../../storage/repositories/usageRepo.js";
import { RequestDetailsRepository } from "../../storage/repositories/requestDetailsRepo.js";
import { calculateCostFromTokens } from "../../core/usage/pricing.js";
import { refreshGoogleOAuthToken } from "../routes/apiOAuth.js";
import { ensureFreshCopilotCredentials } from "../../core/auth/copilotToken.js";
import { getCapabilitiesForModel } from "../../core/capabilities/index.js";
import {
  detectRequiredCapabilities,
  augmentModelsWithCapacityAdapter,
  stripHistoryForContext,
} from "../../core/router/capacityAdapter.js";
import {
  handleFallbackChat,
  handleFusionChat,
  type ModelCallResult,
  type SingleModelHandler,
} from "../../core/router/comboEngine.js";
import { getRegistryProvider } from "../../shared/constants/providerRegistry.js";
import {
  buildOpenCodeUrl,
  buildOpenCodeHeaders,
  applyFingerprintTools,
  restoreToolNames,
  isMessagesModel,
} from "../../core/adapters/openCodeAdapter.js";
import crypto from "node:crypto";
import { fetch as undiciFetch, ProxyAgent } from "undici";
import { logger, tagForSession, LogSymbol, formatDoneLine, maskKey } from "../../shared/logger.js";

const MAX_PROXY_DISPATCHERS = 50;
const proxyDispatchers = new Map<string, ProxyAgent>();

function getProxyDispatcher(proxyUrl: string): ProxyAgent {
  let dispatcher = proxyDispatchers.get(proxyUrl);
  if (!dispatcher) {
    if (proxyDispatchers.size >= MAX_PROXY_DISPATCHERS) {
      const oldestKey = proxyDispatchers.keys().next().value;
      if (oldestKey) {
        proxyDispatchers.delete(oldestKey);
      }
    }
    dispatcher = new ProxyAgent(proxyUrl);
    proxyDispatchers.set(proxyUrl, dispatcher);
  } else {
    // Refresh LRU order
    proxyDispatchers.delete(proxyUrl);
    proxyDispatchers.set(proxyUrl, dispatcher);
  }
  return dispatcher;
}

export function extractHeader(req: Request, headerName: string): string | undefined {
  const val = req.headers[headerName.toLowerCase()];
  if (!val) return undefined;
  if (Array.isArray(val)) return val.join(",");
  return String(val);
}

export function mergeAnthropicBeta(...values: (string | undefined | null)[]): string {
  const flags = values
    .flatMap((v) => (typeof v === "string" ? v.split(",") : []))
    .map((f) => f.trim())
    .filter(Boolean);
  return [...new Set(flags)].join(",");
}

interface ExecuteSingleModelOptions {
  req: Request;
  res: Response;
  body: any;
  modelStr: string;
  clientFormat: "openai" | "anthropic";
  isPanel: boolean;
  requestId: string;
  startTime: number;
  clientTool: string;
  rawModel: string;
  rtkStats: { compressedTokens: number; tokensSaved: number };
  is1mContext?: boolean;
  reqTag?: string;
}

async function executeSingleModel(options: ExecuteSingleModelOptions): Promise<ModelCallResult> {
  const {
    req,
    res,
    body,
    modelStr,
    clientFormat,
    isPanel,
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

  // Strip [1m] context marker before splitting provider/model
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

  // Ensure targetModel also has any [1m] marker stripped
  const { model: cleanTargetModel } = stripModelContextMarker(targetModel);
  if (cleanTargetModel) {
    targetModel = cleanTargetModel;
  }

  if (!providerId) {
    const allProviders = ProviderRepository.getAllProviders();
    const activeProvider = allProviders.find((p) => p.isActive);
    providerId = activeProvider?.id;
  }

  if (!providerId) {
    logger.errorLine(reqTag, LogSymbol.ERROR, `No active provider configured for model '${modelStr}'`);
    return {
      ok: false,
      status: 503,
      error: `No active provider configured for model '${modelStr}'.`,
    };
  }

  const regProv = providerId ? getRegistryProvider(providerId) : undefined;
  const canonicalProviderId = regProv?.id || providerId;

  const provider =
    (canonicalProviderId ? ProviderRepository.getProviderWithDefaults(canonicalProviderId) : undefined) ||
    (canonicalProviderId ? ProviderRepository.getProviderById(canonicalProviderId) : undefined) ||
    (providerId ? ProviderRepository.getProviderWithDefaults(providerId) : undefined) ||
    (providerId ? ProviderRepository.getProviderById(providerId) : undefined);

  if (!provider) {
    logger.errorLine(reqTag, LogSymbol.ERROR, `Provider '${providerId}' not found`);
    return {
      ok: false,
      status: 502,
      error: `Provider '${providerId}' not found.`,
    };
  }

  // Capability context window guard
  const { contextWindow } = getCapabilitiesForModel(provider.id, targetModel);
  const adjustedBody = stripHistoryForContext(body, contextWindow);

  const isOpenCodeFree = provider.id === "opencode" || provider.id === "oc";
  let targetFormat = provider.format || "openai";
  if (isOpenCodeFree) {
    if (isMessagesModel(targetModel)) {
      targetFormat = "claude";
    } else {
      targetFormat = "openai";
    }
  }
  const isBedrock = provider.id.startsWith("bedrock") || provider.credentialForm === "aws";

  // Bidirectional request payload conversion
  let baseUpstreamBody: any;
  if (clientFormat === "anthropic" && targetFormat === "openai") {
    baseUpstreamBody = AnthropicAdapter.anthropicToOpenAi(adjustedBody);
    baseUpstreamBody.model = targetModel;
  } else if (clientFormat === "openai" && (targetFormat === "claude" || isBedrock)) {
    baseUpstreamBody = AnthropicAdapter.openAiToAnthropic(adjustedBody);
    baseUpstreamBody.model = targetModel;
  } else if (clientFormat === "anthropic") {
    baseUpstreamBody = { ...adjustedBody, model: targetModel };
  } else {
    baseUpstreamBody = OpenAiAdapter.normalizeRequest(adjustedBody, targetModel);
  }

  if (isPanel) {
    baseUpstreamBody.stream = false;
    delete baseUpstreamBody.tools;
    delete baseUpstreamBody.tool_choice;
    delete baseUpstreamBody.stream_options;
  } else {
    if (targetFormat === "openai" && baseUpstreamBody && baseUpstreamBody.stream !== false) {
      baseUpstreamBody.stream_options = {
        ...(baseUpstreamBody.stream_options || {}),
        include_usage: true,
      };
    }
  }

  // Upstream BaseUrl Deduplication
  let defaultUpstreamUrl: string;
  if (isOpenCodeFree) {
    defaultUpstreamUrl = buildOpenCodeUrl(targetModel, provider.baseUrl);
  } else {
    const rawBase = (provider.baseUrl || "").trim();
    const hasTerminalPath =
      rawBase.includes("/chat/completions") ||
      rawBase.includes("/messages") ||
      rawBase.includes("/responses") ||
      rawBase.includes("/generateAssistantResponse");

    if (hasTerminalPath) {
      defaultUpstreamUrl = rawBase;
    } else {
      const cleanBase = rawBase.replace(/\/+$/, "");
      if (targetFormat === "claude") {
        defaultUpstreamUrl = cleanBase.endsWith("/v1") ? `${cleanBase}/messages` : `${cleanBase}/v1/messages`;
      } else {
        defaultUpstreamUrl = cleanBase.endsWith("/v1") ? `${cleanBase}/chat/completions` : `${cleanBase}/v1/chat/completions`;
      }
    }
  }

  const triedAccountIds = new Set<string>();
  let lastFailureResult: ModelCallResult | undefined;

  while (true) {
    // Account resolution with exclusion of already-tried accounts (intra-provider failover)
    const account = LoadBalancer.pickAccount(provider.id, triedAccountIds);
    const hasCustomHeaders = Boolean(
      provider.customHeaders && Object.keys(provider.customHeaders).length > 0
    );
    const reg = getRegistryProvider(provider.id);
    const isNoAuthOrProfile =
      provider.id.startsWith("bedrock") ||
      provider.id === "ollama-local" ||
      provider.id === "devin-cli" ||
      isOpenCodeFree ||
      Boolean((provider as any).noAuth) ||
      Boolean(reg?.noAuth);

    if ((!account || !account.rawApiKey) && !hasCustomHeaders && !isNoAuthOrProfile) {
      if (triedAccountIds.size > 0 && lastFailureResult) {
        return lastFailureResult;
      }
      logger.errorLine(
        reqTag,
        LogSymbol.ERROR,
        `No active API key account found for provider '${provider.name}'`
      );
      return {
        ok: false,
        status: 503,
        error: `No active API key account found for provider '${provider.name}'.`,
      };
    }

    if (account) {
      triedAccountIds.add(account.id);
    }

    const msgN = Array.isArray(baseUpstreamBody?.messages)
      ? baseUpstreamBody.messages.length
      : Array.isArray(baseUpstreamBody?.contents)
      ? baseUpstreamBody.contents.length
      : 0;
    const toolN = Array.isArray(baseUpstreamBody?.tools)
      ? baseUpstreamBody.tools.length
      : 0;
    const isStreamingReq = baseUpstreamBody?.stream !== false;
    const accName = account?.name || (account?.id ? account.id.slice(0, 8) : "-");
    const dispatchParts = [
      `POST ${rawModel} → ${provider.id}/${targetModel}`,
      `FMT: ${clientFormat}→${targetFormat}`,
      isStreamingReq ? "STREAM" : "JSON",
      `${msgN} MSG`,
    ];
    if (toolN) dispatchParts.push(`${toolN} TOOL`);
    dispatchParts.push(`ACC:${accName}`);
    logger.line(reqTag, LogSymbol.DISPATCH, dispatchParts.join(" · "));

    let promptTokens = rtkStats.compressedTokens || 0;
    let completionTokens = 0;
    let cachedTokens = 0;
    let cacheCreationTokens = 0;
    let reasoningTokens = 0;
    let ttftMs: number | undefined = undefined;
    let capturedResponseText = "";

    // Clone upstreamBody for each account attempt in case of provider-specific mutations
    const upstreamBody = JSON.parse(JSON.stringify(baseUpstreamBody));
    let upstreamUrl = defaultUpstreamUrl;

    try {
    let bearerToken = account?.rawApiKey || "";
    const psd = account?.providerSpecificData || {};

    // Google OAuth auto-refresh
    let oauthJson: any = null;
    if (bearerToken.startsWith("{") && bearerToken.includes("accessToken")) {
      try {
        oauthJson = JSON.parse(bearerToken);
        bearerToken = oauthJson.accessToken || bearerToken;
      } catch {}
    } else if (psd.refreshToken) {
      oauthJson = {
        accessToken: bearerToken,
        refreshToken: psd.refreshToken,
        expiresAt: psd.expiresAt,
      };
    }

    if (oauthJson?.refreshToken && (provider.id === "antigravity" || oauthJson.expiresAt)) {
      const now = Date.now();
      const isExpiring = !oauthJson.expiresAt || oauthJson.expiresAt < now + 60_000;
      if (isExpiring) {
        try {
          const refreshed = await refreshGoogleOAuthToken(oauthJson.refreshToken);
          if (refreshed?.accessToken) {
            logger.line(reqTag, LogSymbol.KEY, `Google OAuth token refreshed · ${provider.id}/${targetModel}`);
            bearerToken = refreshed.accessToken;
            oauthJson.accessToken = refreshed.accessToken;
            if (refreshed.refreshToken) oauthJson.refreshToken = refreshed.refreshToken;
            oauthJson.expiresAt = now + (refreshed.expiresIn || 3600) * 1000;
            if (account) {
              ProviderRepository.updateAccount(account.id, {
                rawApiKey: JSON.stringify(oauthJson),
                providerSpecificData: {
                  ...psd,
                  refreshToken: oauthJson.refreshToken,
                  expiresAt: oauthJson.expiresAt,
                },
              });
            }
          }
        } catch (refreshErr) {
          console.warn("Failed automatic token refresh:", refreshErr);
        }
      } else {
        bearerToken = oauthJson.accessToken || bearerToken;
      }
    }

    const outgoingHeaders: Record<string, string> = {
      "Content-Type": "application/json",
      ...(bearerToken ? { Authorization: `Bearer ${bearerToken}` } : {}),
      ...(provider.customHeaders || {}),
    };

    // Forward Anthropic client headers (anthropic-beta and anthropic-version)
    const incomingBeta = extractHeader(req, "anthropic-beta");
    const incomingVersion = extractHeader(req, "anthropic-version");

    if (incomingBeta) {
      const existingBetaKey = Object.keys(outgoingHeaders).find(
        (k) => k.toLowerCase() === "anthropic-beta"
      );
      if (existingBetaKey) {
        const merged = mergeAnthropicBeta(outgoingHeaders[existingBetaKey], incomingBeta);
        delete outgoingHeaders[existingBetaKey];
        outgoingHeaders["anthropic-beta"] = merged;
      } else {
        outgoingHeaders["anthropic-beta"] = incomingBeta;
      }
    }

    if (is1mContext && (targetFormat === "claude" || provider.id === "anthropic" || provider.id === "claude")) {
      const existingBeta = outgoingHeaders["anthropic-beta"] || outgoingHeaders["Anthropic-Beta"];
      outgoingHeaders["anthropic-beta"] = mergeAnthropicBeta(existingBeta, "context-1m-2025-08-07");
      delete outgoingHeaders["Anthropic-Beta"];
    }

    if (incomingVersion) {
      const existingVersionKey = Object.keys(outgoingHeaders).find(
        (k) => k.toLowerCase() === "anthropic-version"
      );
      if (existingVersionKey) {
        delete outgoingHeaders[existingVersionKey];
      }
      outgoingHeaders["anthropic-version"] = incomingVersion;
    }

    let openCodeToolMap = new Map<string, string>();
    if (isOpenCodeFree) {
      upstreamUrl = buildOpenCodeUrl(targetModel, provider.baseUrl);
      upstreamBody.stream = true;
      const fingerprintFormat = targetFormat === "claude" ? "claude" : false;
      openCodeToolMap = applyFingerprintTools(upstreamBody, fingerprintFormat);
      const openCodeHeaders = buildOpenCodeHeaders(
        req.headers as Record<string, string>,
        account?.id,
        undefined,
        upstreamUrl
      );
      Object.assign(outgoingHeaders, openCodeHeaders);
    } else if (provider.id === "xiaomi-tokenplan") {
      const region = psd.region || "sgp";
      upstreamUrl = `https://token-plan-${region}.xiaomimimo.com/v1/chat/completions`;
    } else if (provider.id === "azure" || provider.baseUrl.includes("azure.com")) {
      const endpoint = (psd.azureEndpoint || provider.baseUrl).replace(/\/+$/, "");
      const deployment = psd.deployment || targetModel || "gpt-4";
      const apiVersion = psd.apiVersion || "2024-10-01-preview";
      upstreamUrl = `${endpoint}/openai/deployments/${deployment}/chat/completions?api-version=${apiVersion}`;
      outgoingHeaders["api-key"] = bearerToken;
      delete outgoingHeaders["Authorization"];
      if (psd.organization) {
        outgoingHeaders["OpenAI-Organization"] = psd.organization;
      }
    } else if (provider.id === "cloudflare-ai") {
      const accountId = psd.accountId || "";
      if (accountId) {
        upstreamUrl = `https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/v1/chat/completions`;
      }
    } else if (provider.id === "ollama-local" || provider.id.includes("ollama")) {
      const host = (psd.baseUrl || provider.baseUrl || "http://127.0.0.1:11434").replace(/\/+$/, "");
      upstreamUrl = `${host}/v1/chat/completions`;
      if (!bearerToken) {
        delete outgoingHeaders["Authorization"];
      }
    } else if (
      provider.format === "grok-web" ||
      provider.id === "grok-web" ||
      provider.id === "iflow" ||
      provider.id === "perplexity-web" ||
      (provider as any).category === "webCookie"
    ) {
      delete outgoingHeaders["Authorization"];
      outgoingHeaders["Cookie"] = bearerToken;
    } else if (isBedrock) {
      const isStreaming = upstreamBody.stream !== false && !isPanel;
      const bedrockAction = isStreaming ? "invoke-with-response-stream" : "invoke";
      const region = psd.region || "us-east-1";
      upstreamUrl = `https://bedrock-runtime.${region}.amazonaws.com/model/${encodeURIComponent(targetModel)}/${bedrockAction}`;
      delete outgoingHeaders["Authorization"];

      delete upstreamBody.model;
      delete upstreamBody.stream;
      upstreamBody.anthropic_version = "bedrock-2023-05-31";

      const signedHeaders = signAwsSigv4Request({
        method: "POST",
        url: upstreamUrl,
        region,
        service: "bedrock",
        accessKeyId: psd.accessKeyId || "",
        secretAccessKey: bearerToken,
        sessionToken: psd.sessionToken,
        headers: outgoingHeaders,
        body: JSON.stringify(upstreamBody),
      });
      Object.assign(outgoingHeaders, signedHeaders);
      if (isStreaming) {
        outgoingHeaders["Accept"] = "application/vnd.amazon.eventstream";
      }
    } else if (provider.id === "github") {
      if (account) {
        try {
          const fresh = await ensureFreshCopilotCredentials(account);
          if (fresh?.copilotToken) {
            bearerToken = fresh.copilotToken;
            psd.copilotToken = fresh.copilotToken;
            psd.copilotTokenExpiresAt = fresh.copilotTokenExpiresAt;
          }
        } catch (err) {
          console.warn("[chatProxy] Failed to ensure fresh Copilot credentials:", err);
        }
      } else if (psd.copilotToken) {
        bearerToken = psd.copilotToken;
      }
      if (bearerToken) {
        outgoingHeaders["Authorization"] = `Bearer ${bearerToken}`;
      }
      outgoingHeaders["Editor-Version"] = "vscode/1.100.0";
      outgoingHeaders["Editor-Plugin-Version"] = "copilot-chat/0.26.7";
    }

    const globalSettings = SettingsRepository.getEndpointSettings();
    if (globalSettings.customHeaders) {
      for (const [k, v] of Object.entries(globalSettings.customHeaders)) {
        if (!outgoingHeaders[k]) {
          outgoingHeaders[k] = v;
        }
      }
    }

    const effectiveProxy =
      (provider.proxyUrl && provider.proxyUrl.trim()) ||
      (globalSettings.proxyUrl && globalSettings.proxyUrl.trim()) ||
      "";
    const hasProxy = Boolean(effectiveProxy);
    const fetchFn = hasProxy ? undiciFetch : globalThis.fetch;
    const fetchOptions: any = {
      method: "POST",
      headers: outgoingHeaders,
      body: JSON.stringify(upstreamBody),
    };
    if (hasProxy) {
      fetchOptions.dispatcher = getProxyDispatcher(effectiveProxy);
    }

    let upstreamRes = await (fetchFn as typeof fetch)(upstreamUrl, fetchOptions);

    if (!upstreamRes.ok && upstreamRes.status === 401) {
      if (oauthJson?.refreshToken) {
        try {
          const refreshed = await refreshGoogleOAuthToken(oauthJson.refreshToken);
          if (refreshed?.accessToken) {
            logger.line(reqTag, LogSymbol.KEY, `Google OAuth token refreshed on 401 retry · ${provider.id}/${targetModel}`);
            bearerToken = refreshed.accessToken;
            outgoingHeaders["Authorization"] = `Bearer ${bearerToken}`;
            fetchOptions.headers = outgoingHeaders;
            oauthJson.accessToken = refreshed.accessToken;
            if (refreshed.refreshToken) oauthJson.refreshToken = refreshed.refreshToken;
            oauthJson.expiresAt = Date.now() + (refreshed.expiresIn || 3600) * 1000;
            if (account) {
              ProviderRepository.updateAccount(account.id, {
                rawApiKey: JSON.stringify(oauthJson),
                providerSpecificData: {
                  ...psd,
                  refreshToken: oauthJson.refreshToken,
                  expiresAt: oauthJson.expiresAt,
                },
              });
            }
            upstreamRes = await (fetchFn as typeof fetch)(upstreamUrl, fetchOptions);
          }
        } catch {}
      } else if (provider.id === "github" && account) {
        try {
          const fresh = await ensureFreshCopilotCredentials(account, { force: true });
          if (fresh?.copilotToken) {
            logger.line(reqTag, LogSymbol.KEY, `GitHub Copilot token refreshed on 401 retry · ${provider.id}/${targetModel}`);
            bearerToken = fresh.copilotToken;
            outgoingHeaders["Authorization"] = `Bearer ${bearerToken}`;
            fetchOptions.headers = outgoingHeaders;
            upstreamRes = await (fetchFn as typeof fetch)(upstreamUrl, fetchOptions);
          }
        } catch {}
      }
    }

    if (!upstreamRes.ok) {
      const errText = await upstreamRes.text();
      const isRateLimitOrQuota = isRateLimitOrQuotaError(upstreamRes.status, errText);

      if (isRateLimitOrQuota && account) {
        let cooldownMs = 60_000;
        const retryAfterHeader = upstreamRes.headers?.get?.("retry-after");
        if (retryAfterHeader) {
          const parsedSec = Number.parseInt(retryAfterHeader, 10);
          if (Number.isFinite(parsedSec) && parsedSec > 0) {
            cooldownMs = Math.max(10_000, parsedSec * 1000);
          }
        }
        LoadBalancer.markRateLimited(account.id, cooldownMs, provider.id);

        const nextAccount = LoadBalancer.pickAccount(provider.id, triedAccountIds);
        if (nextAccount) {
          logger.line(
            reqTag,
            LogSymbol.FAILOVER,
            `Account '${account.name || account.id}' hit ${upstreamRes.status} (rate-limit/quota) · failing over to '${nextAccount.name || nextAccount.id}' (cooldown: ${cooldownMs}ms)`
          );
          lastFailureResult = {
            ok: false,
            status: upstreamRes.status,
            text: errText,
            error: errText,
          };
          continue;
        }
      }

      const durationMs = Date.now() - startTime;
      const sanitizedErr = errText.slice(0, 500).replace(/sk-[a-zA-Z0-9_-]{20,}/g, (m) => maskKey(m));
      logger.errorLine(
        reqTag,
        LogSymbol.ERROR,
        `ERROR ${upstreamRes.status} · ${provider.id}/${targetModel} · ${durationMs}ms\n    ${sanitizedErr}`
      );

      return {
        ok: false,
        status: upstreamRes.status,
        text: errText,
        error: errText,
      };
    }

    // Panel fan-out execution
    if (isPanel) {
      try {
        const json = await upstreamRes.json();
        return { ok: true, status: 200, json, modelUsed: targetModel };
      } catch {
        const text = await upstreamRes.text();
        return { ok: true, status: 200, text, modelUsed: targetModel };
      }
    }

    // Direct delivery to client
    const isStreaming = upstreamBody.stream !== false;

    if (!isStreaming) {
      const durationMs = Date.now() - startTime;
      const upstreamResponseHeaders: Record<string, string> = {};
      if (upstreamRes.headers) {
        upstreamRes.headers.forEach((val, key) => {
          upstreamResponseHeaders[key] = val;
        });
      }

      let responseBody: any;
      let isJson = false;
      try {
        const rawText = await upstreamRes.text();
        try {
          responseBody = JSON.parse(rawText);
          isJson = true;
        } catch {
          responseBody = rawText;
        }
      } catch (readErr: any) {
        responseBody = { error: readErr.message || "Failed to read response body" };
      }

      const clientResponseHeaders: Record<string, string> = {
        "content-type": isJson ? "application/json" : "text/plain",
      };

      if (isOpenCodeFree && openCodeToolMap.size > 0 && responseBody) {
        restoreToolNames(responseBody, openCodeToolMap);
      }

      if (isJson) {
        res.status(200).json(responseBody);
      } else {
        res.status(200).send(responseBody);
      }

      const usage = responseBody?.usage || {};
      const finalPromptTokens =
        usage.prompt_tokens ??
        usage.input_tokens ??
        usage.prompt_eval_count ??
        promptTokens;
      const finalCompletionTokens =
        usage.completion_tokens ??
        usage.output_tokens ??
        usage.eval_count ??
        0;
      const finalCachedTokens =
        usage.prompt_tokens_details?.cached_tokens ??
        usage.cache_read_input_tokens ??
        0;
      const finalCacheCreationTokens =
        usage.cache_creation_input_tokens ??
        0;
      const finalReasoningTokens =
        usage.completion_tokens_details?.reasoning_tokens ??
        0;

      const calculatedCost = calculateCostFromTokens(
        {
          promptTokens: finalPromptTokens,
          completionTokens: finalCompletionTokens,
          cachedTokens: finalCachedTokens,
          cacheCreationTokens: finalCacheCreationTokens,
          reasoningTokens: finalReasoningTokens,
        },
        targetModel,
        provider.id
      );

      LogRepository.saveLog({
        id: requestId,
        timestamp: startTime,
        clientTool,
        requestedModel: rawModel,
        actualModel: targetModel,
        providerId: provider.id,
        promptTokens: finalPromptTokens,
        completionTokens: finalCompletionTokens,
        tokensSavedByRtk: rtkStats.tokensSaved,
        cachedTokens: finalCachedTokens,
        cacheCreationTokens: finalCacheCreationTokens,
        cost: calculatedCost,
        accountId: account?.id,
        accountName: account?.name,
        durationMs,
        status: "success",
      });

      RequestDetailsRepository.saveRequestDetail({
        id: requestId,
        timestamp: new Date(startTime).toISOString(),
        provider: provider.id,
        model: targetModel,
        connectionId: account?.id,
        accountName: account?.name,
        clientTool,
        status: 200,
        is1mContext,
        latency: { totalMs: durationMs, ttftMs: durationMs },
        tokens: {
          promptTokens: finalPromptTokens,
          completionTokens: finalCompletionTokens,
          cachedTokens: finalCachedTokens,
          cacheCreationTokens: finalCacheCreationTokens,
          tokensSavedByRtk: rtkStats.tokensSaved,
        },
        cost: calculatedCost,
        request: { headers: req.headers as Record<string, string>, body },
        providerRequest: { url: upstreamUrl, headers: outgoingHeaders, body: upstreamBody },
        providerResponse: {
          status: upstreamRes.status,
          headers: upstreamResponseHeaders,
          body: responseBody,
        },
        response: {
          status: 200,
          headers: clientResponseHeaders,
          body: responseBody,
        },
      });

      UsageRepository.endPendingRequest(requestId, false);

      logger.line(
        reqTag,
        LogSymbol.USAGE,
        formatDoneLine({
          durationMs,
          promptTokens: finalPromptTokens,
          completionTokens: finalCompletionTokens,
          cachedTokens: finalCachedTokens,
          cacheCreationTokens: finalCacheCreationTokens,
          tokensSaved: rtkStats.tokensSaved,
          cost: calculatedCost,
        })
      );

      return { ok: true, status: 200, json: isJson ? responseBody : undefined, text: !isJson ? responseBody : undefined, modelUsed: targetModel };
    }

    // Streaming response dispatch
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");

    const upstreamResponseHeaders: Record<string, string> = {};
    if (upstreamRes.headers) {
      upstreamRes.headers.forEach((val, key) => {
        upstreamResponseHeaders[key] = val;
      });
    }

    const reader = upstreamRes.body?.getReader();
    if (!reader) {
      UsageRepository.endPendingRequest(requestId, false);
      res.end();
      return { ok: true, status: 200, modelUsed: targetModel };
    }

    // Bedrock EventStream
    if (isBedrock && upstreamRes.headers.get("content-type")?.includes("eventstream")) {
      let residualBuffer: any = new Uint8Array(0);
      const bedrockOpenAiState = AnthropicAdapter.createAnthropicToOpenAiState();

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (!value) continue;

        if (!ttftMs) {
          ttftMs = Date.now() - startTime;
          logger.line(reqTag, LogSymbol.STREAM, `TTFT ${ttftMs}ms · streaming chunks...`);
        }

        const { frames, remainder } = decodeEventStreamChunk(value, residualBuffer);
        residualBuffer = remainder;

        for (const frame of frames) {
          if (!frame.payload?.bytes) continue;
          try {
            const rawEventString = Buffer.from(frame.payload.bytes, "base64").toString("utf8");
            const eventObj = JSON.parse(rawEventString);

            if (eventObj.type === "message_start" && eventObj.message?.usage) {
              const u = eventObj.message.usage;
              if (u.input_tokens) promptTokens = u.input_tokens;
              if (u.cache_read_input_tokens) cachedTokens = u.cache_read_input_tokens;
              if (u.cache_creation_input_tokens) cacheCreationTokens = u.cache_creation_input_tokens;
            } else if (eventObj.type === "message_delta" && eventObj.usage) {
              if (eventObj.usage.output_tokens) completionTokens = eventObj.usage.output_tokens;
            }

            if (eventObj.delta?.text) {
              if (capturedResponseText.length < 4000) {
                capturedResponseText += eventObj.delta.text;
              }
            }

            if (clientFormat === "anthropic") {
              res.write(`event: ${eventObj.type || "content_block_delta"}\ndata: ${rawEventString}\n\n`);
            } else {
              const openAiChunks = AnthropicAdapter.anthropicChunkToOpenAiEvent(
                eventObj,
                requestId,
                bedrockOpenAiState
              );
              for (const ch of openAiChunks) {
                res.write(ch);
              }
            }
          } catch {}
        }
      }

      if (clientFormat === "openai") {
        res.write("data: [DONE]\n\n");
      }
      res.end();

      if (completionTokens === 0 && capturedResponseText.length > 0) {
        completionTokens = Math.max(1, Math.round(capturedResponseText.length / 4));
      }

      const calculatedCost = calculateCostFromTokens(
        { promptTokens, completionTokens, cachedTokens, cacheCreationTokens, reasoningTokens },
        targetModel,
        provider.id
      );
      const totalDuration = Date.now() - startTime;

      LogRepository.saveLog({
        id: requestId,
        timestamp: startTime,
        clientTool,
        requestedModel: rawModel,
        actualModel: targetModel,
        providerId: provider.id,
        promptTokens,
        completionTokens,
        tokensSavedByRtk: rtkStats.tokensSaved,
        cachedTokens,
        cacheCreationTokens,
        cost: calculatedCost,
        accountId: account?.id,
        accountName: account?.name,
        durationMs: totalDuration,
        status: "success",
      });

      RequestDetailsRepository.saveRequestDetail({
        id: requestId,
        timestamp: new Date(startTime).toISOString(),
        provider: provider.id,
        model: targetModel,
        connectionId: account?.id,
        accountName: account?.name,
        clientTool,
        status: 200,
        is1mContext,
        latency: { totalMs: totalDuration, ttftMs },
        tokens: {
          promptTokens,
          completionTokens,
          cachedTokens,
          cacheCreationTokens,
          tokensSavedByRtk: rtkStats.tokensSaved,
        },
        cost: calculatedCost,
        request: { headers: req.headers as Record<string, string>, body },
        providerRequest: { url: upstreamUrl, headers: outgoingHeaders, body: upstreamBody },
        providerResponse: {
          status: upstreamRes.status,
          headers: upstreamResponseHeaders,
        },
        response: {
          status: 200,
          headers: { "content-type": "text/event-stream" },
          body: { text: capturedResponseText ? capturedResponseText.slice(0, 2000) : "Stream completed" },
        },
      });

      UsageRepository.endPendingRequest(requestId, false);

      logger.line(
        reqTag,
        LogSymbol.USAGE,
        formatDoneLine({
          durationMs: totalDuration,
          ttftMs,
          promptTokens,
          completionTokens,
          cachedTokens,
          cacheCreationTokens,
          tokensSaved: rtkStats.tokensSaved,
          cost: calculatedCost,
        })
      );

      return { ok: true, status: 200, modelUsed: targetModel };
    }

    // Standard SSE text streams
    const openAiToAnthropicState = AnthropicAdapter.createStreamState(requestId);
    if (clientFormat === "anthropic" && targetFormat === "openai") {
      res.write(
        `event: message_start\ndata: ${JSON.stringify({
          type: "message_start",
          message: {
            id: `msg_${requestId}`,
            type: "message",
            role: "assistant",
            model: targetModel,
            content: [],
          },
        })}\n\n`
      );
      openAiToAnthropicState.messageStartSent = true;
    }
    const claudeToOpenAiState = AnthropicAdapter.createAnthropicToOpenAiState();

    const decoder = new TextDecoder();
    let buffer = "";
    let currentEventName = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      if (!ttftMs) {
        ttftMs = Date.now() - startTime;
        logger.line(reqTag, LogSymbol.STREAM, `TTFT ${ttftMs}ms · streaming chunks...`);
      }

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";

      for (const rawLine of lines) {
        const line = rawLine.trim();
        if (!line) continue;

        if (line.startsWith("event:")) {
          currentEventName = line.slice(6).trim();
          if (clientFormat === "anthropic" && targetFormat === "claude") {
            res.write(rawLine + "\n");
          }
          continue;
        }

        if (!line.startsWith("data:")) continue;
        const dataStr = line.slice(5).trim();

        if (dataStr === "[DONE]") {
          if (clientFormat === "openai") {
            res.write("data: [DONE]\n\n");
          }
          continue;
        }

        try {
          const jsonChunk = JSON.parse(dataStr);

          if (isOpenCodeFree && openCodeToolMap.size > 0) {
            restoreToolNames(jsonChunk, openCodeToolMap);
          }

          if (jsonChunk.usage) {
            if (jsonChunk.usage.prompt_tokens) promptTokens = jsonChunk.usage.prompt_tokens;
            if (jsonChunk.usage.completion_tokens) completionTokens = jsonChunk.usage.completion_tokens;
            if (jsonChunk.usage.prompt_tokens_details?.cached_tokens) {
              cachedTokens = jsonChunk.usage.prompt_tokens_details.cached_tokens;
            }
            if (jsonChunk.usage.completion_tokens_details?.reasoning_tokens) {
              reasoningTokens = jsonChunk.usage.completion_tokens_details.reasoning_tokens;
            }
          }

          if (jsonChunk.type === "message_start" && jsonChunk.message?.usage) {
            const u = jsonChunk.message.usage;
            if (u.input_tokens) promptTokens = u.input_tokens;
            if (u.cache_read_input_tokens) cachedTokens = u.cache_read_input_tokens;
            if (u.cache_creation_input_tokens) cacheCreationTokens = u.cache_creation_input_tokens;
          } else if (jsonChunk.type === "message_delta" && jsonChunk.usage) {
            if (jsonChunk.usage.output_tokens) completionTokens = jsonChunk.usage.output_tokens;
          }

          const deltaText = jsonChunk.choices?.[0]?.delta?.content || jsonChunk.delta?.text || "";
          if (typeof deltaText === "string" && deltaText) {
            if (capturedResponseText.length < 4000) {
              capturedResponseText += deltaText;
            }
          }

          if (clientFormat === "anthropic" && targetFormat === "openai") {
            const anthropicEvents = AnthropicAdapter.openAiChunkToAnthropicEvent(
              jsonChunk,
              requestId,
              openAiToAnthropicState
            );
            for (const ev of anthropicEvents) {
              res.write(ev);
            }
          } else if (clientFormat === "openai" && targetFormat === "claude") {
            const eventPayload = {
              type: currentEventName || jsonChunk.type,
              ...jsonChunk,
            };
            const openAiChunks = AnthropicAdapter.anthropicChunkToOpenAiEvent(
              eventPayload,
              requestId,
              claudeToOpenAiState
            );
            for (const ch of openAiChunks) {
              res.write(ch);
            }
          } else {
            if (currentEventName && clientFormat === "anthropic") {
              res.write(`event: ${currentEventName}\n`);
            }
            if (isOpenCodeFree && openCodeToolMap.size > 0) {
              res.write(`data: ${JSON.stringify(jsonChunk)}\n\n`);
            } else {
              res.write(rawLine + "\n\n");
            }
          }
        } catch {
          res.write(rawLine + "\n\n");
        }
      }
    }

    if (clientFormat === "anthropic" && targetFormat === "openai") {
      const finalEvents = AnthropicAdapter.finalizeStream(openAiToAnthropicState);
      for (const ev of finalEvents) {
        res.write(ev);
      }
    }

    res.end();

    if (completionTokens === 0 && capturedResponseText.length > 0) {
      completionTokens = Math.max(1, Math.round(capturedResponseText.length / 4));
    }

    const calculatedCost = calculateCostFromTokens(
      { promptTokens, completionTokens, cachedTokens, cacheCreationTokens, reasoningTokens },
      targetModel,
      provider.id
    );
    const totalDuration = Date.now() - startTime;

    LogRepository.saveLog({
      id: requestId,
      timestamp: startTime,
      clientTool,
      requestedModel: rawModel,
      actualModel: targetModel,
      providerId: provider.id,
      promptTokens,
      completionTokens,
      tokensSavedByRtk: rtkStats.tokensSaved,
      cachedTokens,
      cacheCreationTokens,
      cost: calculatedCost,
      accountId: account?.id,
      accountName: account?.name,
      durationMs: totalDuration,
      status: "success",
    });

    RequestDetailsRepository.saveRequestDetail({
      id: requestId,
      timestamp: new Date(startTime).toISOString(),
      provider: provider.id,
      model: targetModel,
      connectionId: account?.id,
      accountName: account?.name,
      clientTool,
      status: 200,
      is1mContext,
      latency: { totalMs: totalDuration, ttftMs },
      tokens: {
        promptTokens,
        completionTokens,
        cachedTokens,
        cacheCreationTokens,
        tokensSavedByRtk: rtkStats.tokensSaved,
      },
      cost: calculatedCost,
      request: { headers: req.headers as Record<string, string>, body },
      providerRequest: { url: upstreamUrl, headers: outgoingHeaders, body: upstreamBody },
      providerResponse: {
        status: upstreamRes.status,
        headers: upstreamResponseHeaders,
      },
      response: {
        status: 200,
        headers: { "content-type": "text/event-stream" },
        body: { text: capturedResponseText ? capturedResponseText.slice(0, 2000) : "Stream completed" },
      },
    });

    UsageRepository.endPendingRequest(requestId, false);

    logger.line(
      reqTag,
      LogSymbol.USAGE,
      formatDoneLine({
        durationMs: totalDuration,
        ttftMs,
        promptTokens,
        completionTokens,
        cachedTokens,
        cacheCreationTokens,
        tokensSaved: rtkStats.tokensSaved,
        cost: calculatedCost,
      })
    );

    return { ok: true, status: 200, modelUsed: targetModel };
  } catch (err: any) {
    if (triedAccountIds.size > 0 && lastFailureResult) {
      return lastFailureResult;
    }
    const durationMs = Date.now() - startTime;
    logger.errorLine(
      reqTag,
      LogSymbol.ERROR,
      `ERROR 500 · ${provider?.id || providerId || "unknown"}/${targetModel} · ${durationMs}ms\n    ${err.message || "Upstream request failed"}`
    );
    return {
      ok: false,
      status: 500,
      error: err.message || "Upstream request failed",
    };
  }
} // end while (true)
}

export async function handleProxyRequest(
  req: Request,
  res: Response,
  clientFormat: "openai" | "anthropic"
): Promise<void> {
  const endpointSettings = SettingsRepository.getEndpointSettings();
  if (endpointSettings.requireApiKey) {
    const activeKeys = SettingsRepository.getGatewayApiKeys().filter((k) => k.isActive);
    if (activeKeys.length > 0) {
      const authHeader = (req.headers["authorization"] as string) || "";
      const apiKeyHeader = (req.headers["x-api-key"] as string) || "";
      let providedKey = "";
      if (authHeader.startsWith("Bearer ")) {
        providedKey = authHeader.substring(7).trim();
      } else if (authHeader) {
        providedKey = authHeader.trim();
      } else if (apiKeyHeader) {
        providedKey = apiKeyHeader.trim();
      }

      const isValid = activeKeys.some((k) => k.key === providedKey);
      if (!isValid) {
        res.status(401).json({
          error: {
            message: "Unauthorized: Invalid or missing gateway API key.",
            type: "authentication_error",
            code: "invalid_api_key",
          },
        });
        return;
      }
    }
  }

  const startTime = Date.now();
  const requestId = req.reqId || crypto.randomUUID();
  const reqTag = req.reqTag || tagForSession(requestId);
  req.reqId = requestId;
  req.reqTag = reqTag;
  const body = req.body || {};
  const clientTool = (req.headers["x-client-tool"] as string) || (req.headers["user-agent"] as string) || "unknown";

  const rawModel = body.model || "default";

  // Context Marker [1m] Stripping
  const { model: strippedModel, contextMarker, is1mContext } = stripModelContextMarker(body.model);
  if (contextMarker && strippedModel) {
    body.model = strippedModel;
  }
  const cleanModel = strippedModel || rawModel;

  // 1. RTK compression
  const rtkStats = RtkCompressor.compressPayloadInPlace(body);
  if (rtkStats.tokensSaved > 0) {
    const orig = rtkStats.originalTokens || (rtkStats.compressedTokens + rtkStats.tokensSaved);
    const pct = orig > 0 ? Math.round((rtkStats.tokensSaved / orig) * 100) : 0;
    logger.line(
      reqTag,
      LogSymbol.SAVER,
      `RTK: saved ${rtkStats.tokensSaved} tokens (-${pct}%)`
    );
  }

  // 2. Combo Detection
  const allCombos = ComboRepository.getAllCombos();
  const comboLookup = cleanModel.startsWith("combo/") ? cleanModel.slice(6) : cleanModel;
  const isComboCandidate = !cleanModel.includes("/") || cleanModel.startsWith("combo/");
  const activeCombo = isComboCandidate
    ? allCombos.find(
        (c) =>
          c.isActive &&
          (c.name.toLowerCase() === comboLookup.toLowerCase() || c.id.toLowerCase() === comboLookup.toLowerCase())
      )
    : undefined;

  let candidateModels: string[];
  let comboStrategy: "round-robin" | "fallback" | "fusion" = "fallback";
  let comboName = "";

  if (activeCombo && activeCombo.models.length > 0) {
    candidateModels = [...activeCombo.models];
    comboStrategy = activeCombo.strategy;
    comboName = activeCombo.name;
    logger.line(
      reqTag,
      LogSymbol.COMBO,
      `COMBO "${comboName}" (${comboStrategy}) · candidates: [${candidateModels.join(", ")}]`
    );
  } else {
    candidateModels = [cleanModel];
  }

  // 3. Multimodal Capacity Adapter Augmentation
  const requiredCaps = detectRequiredCapabilities(body);
  if (requiredCaps.size > 0) {
    const adapterSettings = SettingsRepository.getCapacityAdapterSettings();
    candidateModels = augmentModelsWithCapacityAdapter(candidateModels, requiredCaps, adapterSettings);
    logger.line(
      reqTag,
      LogSymbol.COMBO,
      `CAPACITY ADAPTER: required [${[...requiredCaps].join(", ")}] · models: [${candidateModels.join(", ")}]`
    );
  }

  // Track in-flight request
  UsageRepository.startPendingRequest({
    id: requestId,
    model: rawModel,
    provider: comboName ? "combo" : (candidateModels[0]?.split("/")[0] || "unknown"),
  });

  const handleSingleModel: SingleModelHandler = async (modelBody, modelStr, isPanel = false) => {
    return executeSingleModel({
      req,
      res,
      body: modelBody,
      modelStr,
      clientFormat,
      isPanel,
      requestId,
      startTime,
      clientTool,
      rawModel,
      rtkStats,
      is1mContext,
      reqTag,
    });
  };

  try {
    let result: ModelCallResult;

    if (comboStrategy === "fusion" && candidateModels.length > 1) {
      result = await handleFusionChat({
        body,
        models: candidateModels,
        handleSingleModel,
        comboName,
      });
    } else if (comboStrategy === "round-robin") {
      result = await handleFallbackChat({
        body,
        models: candidateModels,
        handleSingleModel,
        comboName,
        comboStrategy: "round-robin",
        comboStickyLimit: 1,
      });
    } else {
      result = await handleFallbackChat({
        body,
        models: candidateModels,
        handleSingleModel,
        comboName,
        comboStrategy: "fallback",
      });
    }

    if (!result.ok && !res.headersSent) {
      const durationMs = Date.now() - startTime;
      const status = result.status || 503;
      const errMsg = result.error || "All combo models failed";

      logger.errorLine(
        reqTag,
        LogSymbol.ERROR,
        `REQUEST FAILED ${status} · ${comboName || candidateModels[0] || rawModel} · ${durationMs}ms\n    ${errMsg}`
      );

      UsageRepository.endPendingRequest(requestId, true);

      LogRepository.saveLog({
        id: requestId,
        timestamp: startTime,
        clientTool,
        requestedModel: rawModel,
        actualModel: candidateModels[0] || rawModel,
        providerId: comboName ? "combo" : "unknown",
        promptTokens: 0,
        completionTokens: 0,
        tokensSavedByRtk: rtkStats.tokensSaved,
        cachedTokens: 0,
        cacheCreationTokens: 0,
        cost: 0,
        durationMs,
        status: status === 429 ? "rate_limited" : "error",
        errorMessage: errMsg.slice(0, 500),
      });

      RequestDetailsRepository.saveRequestDetail({
        id: requestId,
        timestamp: new Date(startTime).toISOString(),
        provider: comboName ? "combo" : null,
        model: rawModel,
        clientTool,
        status,
        is1mContext,
        latency: { totalMs: durationMs },
        tokens: {
          promptTokens: 0,
          completionTokens: 0,
          cachedTokens: 0,
          tokensSavedByRtk: rtkStats.tokensSaved,
        },
        cost: 0,
        request: { headers: req.headers as Record<string, string>, body },
        errorMessage: errMsg.slice(0, 500),
      });

      res.status(status).json({
        error: {
          message: errMsg,
          type: status === 429 ? "rate_limit_error" : "service_unavailable",
        },
      });
    }
  } catch (err: any) {
    const totalDuration = Date.now() - startTime;
    logger.errorLine(
      reqTag,
      LogSymbol.ERROR,
      `REQUEST EXCEPTION · ${rawModel} · ${totalDuration}ms\n    ${err.stack || err.message}`
    );
    UsageRepository.endPendingRequest(requestId, true);

    if (!res.headersSent) {
      res.status(500).json({ error: { message: err.message || "Internal server error" } });
    } else if (!res.writableEnded) {
      res.end();
    }

    LogRepository.saveLog({
      id: requestId,
      timestamp: startTime,
      clientTool,
      requestedModel: rawModel,
      actualModel: rawModel,
      providerId: comboName || "unknown",
      promptTokens: 0,
      completionTokens: 0,
      tokensSavedByRtk: rtkStats.tokensSaved,
      cachedTokens: 0,
      cacheCreationTokens: 0,
      cost: 0,
      durationMs: totalDuration,
      status: "error",
      errorMessage: err.message?.slice(0, 500),
    });
  }
}
