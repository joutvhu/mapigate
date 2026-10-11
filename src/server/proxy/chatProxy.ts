import type { Request, Response } from "express";
import { RuleEngine } from "../../core/router/ruleEngine.js";
import { LoadBalancer } from "../../core/router/loadBalancer.js";
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
import crypto from "node:crypto";
import { fetch as undiciFetch, ProxyAgent } from "undici";

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
  } = options;

  let targetModel = modelStr;
  let providerId: string | undefined;

  if (modelStr.includes("/")) {
    const slash = modelStr.indexOf("/");
    providerId = modelStr.slice(0, slash);
    targetModel = modelStr.slice(slash + 1);
  } else {
    const rules = ModelRepository.getAllRules();
    const ruleEngine = new RuleEngine(rules);
    const resolved = ruleEngine.resolveModel(modelStr);
    targetModel = resolved.model;
    providerId = resolved.rule?.targetProviderId;
  }

  if (!providerId) {
    const allProviders = ProviderRepository.getAllProviders();
    const activeProvider = allProviders.find((p) => p.isActive);
    providerId = activeProvider?.id;
  }

  if (!providerId) {
    return {
      ok: false,
      status: 503,
      error: `No active provider configured for model '${modelStr}'.`,
    };
  }

  const provider =
    ProviderRepository.getProviderWithDefaults(providerId) ||
    ProviderRepository.getProviderById(providerId);

  if (!provider) {
    return {
      ok: false,
      status: 502,
      error: `Provider '${providerId}' not found.`,
    };
  }

  // Account resolution
  const account = LoadBalancer.pickAccount(provider.id);
  const hasCustomHeaders = Boolean(
    provider.customHeaders && Object.keys(provider.customHeaders).length > 0
  );
  const isNoAuthOrProfile =
    provider.id.startsWith("bedrock") ||
    provider.id === "ollama-local" ||
    provider.id === "devin-cli";

  if ((!account || !account.rawApiKey) && !hasCustomHeaders && !isNoAuthOrProfile) {
    return {
      ok: false,
      status: 503,
      error: `No active API key account found for provider '${provider.name}'.`,
    };
  }

  // Capability context window guard
  const { contextWindow } = getCapabilitiesForModel(provider.id, targetModel);
  const adjustedBody = stripHistoryForContext(body, contextWindow);

  let promptTokens = rtkStats.compressedTokens || 0;
  let completionTokens = 0;
  let cachedTokens = 0;
  let cacheCreationTokens = 0;
  let reasoningTokens = 0;
  let ttftMs: number | undefined = undefined;
  let capturedResponseText = "";

  const targetFormat = provider.format || "openai";
  const isBedrock = provider.id.startsWith("bedrock") || provider.credentialForm === "aws";

  // Bidirectional request payload conversion
  let upstreamBody: any;
  if (clientFormat === "anthropic" && targetFormat === "openai") {
    upstreamBody = AnthropicAdapter.anthropicToOpenAi(adjustedBody);
    upstreamBody.model = targetModel;
  } else if (clientFormat === "openai" && (targetFormat === "claude" || isBedrock)) {
    upstreamBody = AnthropicAdapter.openAiToAnthropic(adjustedBody);
    upstreamBody.model = targetModel;
  } else if (clientFormat === "anthropic") {
    upstreamBody = { ...adjustedBody, model: targetModel };
  } else {
    upstreamBody = OpenAiAdapter.normalizeRequest(adjustedBody, targetModel);
  }

  if (isPanel) {
    upstreamBody.stream = false;
    delete upstreamBody.tools;
    delete upstreamBody.tool_choice;
    delete upstreamBody.stream_options;
  } else {
    if (targetFormat === "openai" && upstreamBody && upstreamBody.stream !== false) {
      upstreamBody.stream_options = {
        ...(upstreamBody.stream_options || {}),
        include_usage: true,
      };
    }
  }

  // Upstream BaseUrl Deduplication
  let upstreamUrl: string;
  const rawBase = (provider.baseUrl || "").trim();
  const hasTerminalPath =
    rawBase.includes("/chat/completions") ||
    rawBase.includes("/messages") ||
    rawBase.includes("/responses") ||
    rawBase.includes("/generateAssistantResponse");

  if (hasTerminalPath) {
    upstreamUrl = rawBase;
  } else {
    const cleanBase = rawBase.replace(/\/+$/, "");
    if (targetFormat === "claude") {
      upstreamUrl = cleanBase.endsWith("/v1") ? `${cleanBase}/messages` : `${cleanBase}/v1/messages`;
    } else {
      upstreamUrl = cleanBase.endsWith("/v1") ? `${cleanBase}/chat/completions` : `${cleanBase}/v1/chat/completions`;
    }
  }

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

    if (provider.id === "xiaomi-tokenplan") {
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
      if (psd.copilotToken) {
        bearerToken = psd.copilotToken;
        outgoingHeaders["Authorization"] = `Bearer ${bearerToken}`;
      }
      outgoingHeaders["Editor-Version"] = "vscode/1.100.0";
      outgoingHeaders["Editor-Plugin-Version"] = "copilot-chat/0.26.7";
    }

    const hasProxy = Boolean(provider.proxyUrl && provider.proxyUrl.trim());
    const fetchFn = hasProxy ? undiciFetch : globalThis.fetch;
    const fetchOptions: any = {
      method: "POST",
      headers: outgoingHeaders,
      body: JSON.stringify(upstreamBody),
    };
    if (hasProxy) {
      fetchOptions.dispatcher = getProxyDispatcher(provider.proxyUrl!.trim());
    }

    let upstreamRes = await (fetchFn as typeof fetch)(upstreamUrl, fetchOptions);

    if (!upstreamRes.ok && upstreamRes.status === 401 && oauthJson?.refreshToken) {
      try {
        const refreshed = await refreshGoogleOAuthToken(oauthJson.refreshToken);
        if (refreshed?.accessToken) {
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
    }

    if (!upstreamRes.ok) {
      if (upstreamRes.status === 429 && account) {
        LoadBalancer.markRateLimited(account.id);
      }
      const errText = await upstreamRes.text();
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
      try {
        const json = await upstreamRes.json();
        res.status(200).json(json);

        const durationMs = Date.now() - startTime;
        LogRepository.saveLog({
          id: requestId,
          timestamp: startTime,
          clientTool,
          requestedModel: rawModel,
          actualModel: targetModel,
          providerId: provider.id,
          promptTokens: (json as any)?.usage?.prompt_tokens || promptTokens,
          completionTokens: (json as any)?.usage?.completion_tokens || 0,
          tokensSavedByRtk: rtkStats.tokensSaved,
          cachedTokens: 0,
          cacheCreationTokens: 0,
          cost: 0,
          accountId: account?.id,
          accountName: account?.name,
          durationMs,
          status: "success",
        });

        UsageRepository.endPendingRequest(requestId, false);
        return { ok: true, status: 200, json, modelUsed: targetModel };
      } catch (err: any) {
        const text = await upstreamRes.text();
        res.status(200).send(text);
        UsageRepository.endPendingRequest(requestId, false);
        return { ok: true, status: 200, text, modelUsed: targetModel };
      }
    }

    // Streaming response dispatch
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");

    const reader = upstreamRes.body?.getReader();
    if (!reader) {
      UsageRepository.endPendingRequest(requestId, false);
      res.end();
      return { ok: true, status: 200, modelUsed: targetModel };
    }

    // Bedrock EventStream
    if (isBedrock && upstreamRes.headers.get("content-type")?.includes("eventstream")) {
      let residualBuffer: any = new Uint8Array(0);

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (!value) continue;

        if (!ttftMs) {
          ttftMs = Date.now() - startTime;
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
              const openAiChunks = AnthropicAdapter.anthropicChunkToOpenAiEvent(eventObj, requestId);
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
        response: {
          status: 200,
          body: { text: capturedResponseText ? capturedResponseText.slice(0, 2000) : "Stream completed" },
        },
      });

      UsageRepository.endPendingRequest(requestId, false);
      return { ok: true, status: 200, modelUsed: targetModel };
    }

    // Standard SSE text streams
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
    }

    const decoder = new TextDecoder();
    let buffer = "";
    let currentEventName = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      if (!ttftMs) {
        ttftMs = Date.now() - startTime;
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
            const anthropicEvents = AnthropicAdapter.openAiChunkToAnthropicEvent(jsonChunk, requestId);
            for (const ev of anthropicEvents) {
              res.write(ev);
            }
          } else if (clientFormat === "openai" && targetFormat === "claude") {
            const eventPayload = {
              type: currentEventName || jsonChunk.type,
              ...jsonChunk,
            };
            const openAiChunks = AnthropicAdapter.anthropicChunkToOpenAiEvent(eventPayload, requestId);
            for (const ch of openAiChunks) {
              res.write(ch);
            }
          } else {
            if (currentEventName && clientFormat === "anthropic") {
              res.write(`event: ${currentEventName}\n`);
            }
            res.write(rawLine + "\n\n");
          }
        } catch {
          res.write(rawLine + "\n\n");
        }
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
      response: {
        status: 200,
        body: { text: capturedResponseText ? capturedResponseText.slice(0, 2000) : "Stream completed" },
      },
    });

    UsageRepository.endPendingRequest(requestId, false);
    return { ok: true, status: 200, modelUsed: targetModel };
  } catch (err: any) {
    return {
      ok: false,
      status: 500,
      error: err.message || "Upstream request failed",
    };
  }
}

export async function handleProxyRequest(
  req: Request,
  res: Response,
  clientFormat: "openai" | "anthropic"
): Promise<void> {
  const startTime = Date.now();
  const requestId = crypto.randomUUID();
  const body = req.body || {};
  const clientTool = (req.headers["x-client-tool"] as string) || (req.headers["user-agent"] as string) || "unknown";

  const rawModel = body.model || "default";

  // 1. RTK compression
  const rtkStats = RtkCompressor.compressPayloadInPlace(body);

  // 2. Combo Detection
  const allCombos = ComboRepository.getAllCombos();
  const activeCombo = !rawModel.includes("/")
    ? allCombos.find(
        (c) =>
          c.isActive &&
          (c.name.toLowerCase() === rawModel.toLowerCase() || c.id.toLowerCase() === rawModel.toLowerCase())
      )
    : undefined;

  let candidateModels: string[];
  let comboStrategy: "round-robin" | "fallback" | "fusion" = "fallback";
  let comboName = "";

  if (activeCombo && activeCombo.models.length > 0) {
    candidateModels = [...activeCombo.models];
    comboStrategy = activeCombo.strategy;
    comboName = activeCombo.name;
  } else {
    candidateModels = [rawModel];
  }

  // 3. Multimodal Capacity Adapter Augmentation
  const requiredCaps = detectRequiredCapabilities(body);
  if (requiredCaps.size > 0) {
    const adapterSettings = SettingsRepository.getCapacityAdapterSettings();
    candidateModels = augmentModelsWithCapacityAdapter(candidateModels, requiredCaps, adapterSettings);
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
    UsageRepository.endPendingRequest(requestId, true);

    if (!res.headersSent) {
      res.status(500).json({ error: { message: err.message || "Internal server error" } });
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
