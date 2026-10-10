import type { Request, Response } from "express";
import { RuleEngine } from "../../core/router/ruleEngine.js";
import { LoadBalancer } from "../../core/router/loadBalancer.js";
import { RtkCompressor } from "../../core/rtk/compressor.js";
import { AnthropicAdapter } from "../../core/adapters/anthropicAdapter.js";
import { OpenAiAdapter } from "../../core/adapters/openAiAdapter.js";
import { ProviderRepository } from "../../storage/repositories/providerRepo.js";
import { ModelRepository } from "../../storage/repositories/modelRepo.js";
import { LogRepository } from "../../storage/repositories/logRepo.js";
import { refreshGoogleOAuthToken } from "../routes/apiOAuth.js";
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

export async function handleProxyRequest(
  req: Request,
  res: Response,
  clientFormat: "openai" | "anthropic"
): Promise<void> {
  const startTime = Date.now();
  const requestId = crypto.randomUUID();
  const body = req.body || {};

  const rawModel = body.model || "default";
  const rules = ModelRepository.getAllRules();
  const ruleEngine = new RuleEngine(rules);

  const { model: targetModel, rule } = ruleEngine.resolveModel(rawModel);

  // Determine provider
  let providerId = rule?.targetProviderId;
  if (!providerId) {
    const allProviders = ProviderRepository.getAllProviders();
    const activeProvider = allProviders.find((p) => p.isActive);
    providerId = activeProvider?.id;
  }

  if (!providerId) {
    res.status(503).json({
      error: {
        message: "No active provider configured in Routen. Please add a provider in dashboard.",
        type: "service_unavailable",
      },
    });
    return;
  }

  const provider =
    ProviderRepository.getProviderWithDefaults(providerId) ||
    ProviderRepository.getProviderById(providerId);
  if (!provider) {
    res.status(502).json({
      error: {
        message: `Provider '${providerId}' not found.`,
        type: "bad_gateway",
      },
    });
    return;
  }

  // 1. In-place RTK compression
  const rtkStats = RtkCompressor.compressPayloadInPlace(body);

  // 2. Select account
  const account = LoadBalancer.pickAccount(provider.id);
  const hasCustomHeaders = Boolean(
    provider.customHeaders && Object.keys(provider.customHeaders).length > 0
  );
  if ((!account || !account.rawApiKey) && !hasCustomHeaders) {
    res.status(503).json({
      error: {
        message: `No active API key account found for provider '${provider.name}'.`,
        type: "service_unavailable",
      },
    });
    return;
  }

  // 3. Prepare payload for upstream
  let upstreamBody: any;
  let upstreamPath = "/v1/chat/completions";

  if (clientFormat === "anthropic" && provider.format === "openai") {
    upstreamBody = AnthropicAdapter.anthropicToOpenAi(body);
    upstreamBody.model = targetModel;
  } else {
    upstreamBody = OpenAiAdapter.normalizeRequest(body, targetModel);
  }

  let upstreamUrl = `${provider.baseUrl.replace(/\/+$/, "")}${upstreamPath}`;

  try {
    let bearerToken = account?.rawApiKey || "";
    const psd = account?.providerSpecificData || {};

    // 3a. Handle Google OAuth token parsing & auto-refresh before upstream call
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

    // 3b. Provider-specific URL & headers transformations
    if (provider.id === "azure" || provider.baseUrl.includes("azure.com")) {
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

    // On 401, attempt Google OAuth token refresh retry if refresh token is available
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
      res.status(upstreamRes.status).send(errText);

      LogRepository.saveLog({
        id: requestId,
        timestamp: startTime,
        clientTool: (req.headers["user-agent"] as string) || "unknown",
        requestedModel: rawModel,
        actualModel: targetModel,
        providerId: provider.id,
        promptTokens: 0,
        completionTokens: 0,
        tokensSavedByRtk: rtkStats.tokensSaved,
        durationMs: Date.now() - startTime,
        status: upstreamRes.status === 429 ? "rate_limited" : "error",
        errorMessage: errText.slice(0, 500),
      });
      return;
    }

    // Set SSE streaming headers
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");

    if (clientFormat === "anthropic") {
      // Send initial Anthropic frame
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

    const reader = upstreamRes.body?.getReader();
    if (!reader) {
      res.end();
      return;
    }

    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";

      for (const line of lines) {
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
          if (clientFormat === "anthropic") {
            const anthropicEvents = AnthropicAdapter.openAiChunkToAnthropicEvent(jsonChunk, requestId);
            for (const ev of anthropicEvents) {
              res.write(ev);
            }
          } else {
            res.write(line + "\n\n");
          }
        } catch {
          // Pass-through raw line if parsing fails
          res.write(line + "\n\n");
        }
      }
    }

    res.end();

    // Record success log
    LogRepository.saveLog({
      id: requestId,
      timestamp: startTime,
      clientTool: (req.headers["user-agent"] as string) || "unknown",
      requestedModel: rawModel,
      actualModel: targetModel,
      providerId: provider.id,
      promptTokens: rtkStats.compressedTokens,
      completionTokens: 0,
      tokensSavedByRtk: rtkStats.tokensSaved,
      durationMs: Date.now() - startTime,
      status: "success",
    });
  } catch (err: any) {
    res.status(500).json({ error: { message: err.message || "Upstream request failed" } });
  }
}
