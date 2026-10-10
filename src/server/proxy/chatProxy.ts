import type { Request, Response } from "express";
import { RuleEngine } from "../../core/router/ruleEngine.js";
import { LoadBalancer } from "../../core/router/loadBalancer.js";
import { RtkCompressor } from "../../core/rtk/compressor.js";
import { AnthropicAdapter } from "../../core/adapters/anthropicAdapter.js";
import { OpenAiAdapter } from "../../core/adapters/openAiAdapter.js";
import { ProviderRepository } from "../../storage/repositories/providerRepo.js";
import { ModelRepository } from "../../storage/repositories/modelRepo.js";
import { LogRepository } from "../../storage/repositories/logRepo.js";
import crypto from "node:crypto";
import { fetch as undiciFetch, ProxyAgent } from "undici";

const proxyDispatchers = new Map<string, ProxyAgent>();

function getProxyDispatcher(proxyUrl: string): ProxyAgent {
  let dispatcher = proxyDispatchers.get(proxyUrl);
  if (!dispatcher) {
    dispatcher = new ProxyAgent(proxyUrl);
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
  if (!account || !account.rawApiKey) {
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

  const upstreamUrl = `${provider.baseUrl.replace(/\/+$/, "")}${upstreamPath}`;

  try {
    const outgoingHeaders: Record<string, string> = {
      "Content-Type": "application/json",
      Authorization: `Bearer ${account.rawApiKey}`,
      ...(provider.customHeaders || {}),
    };

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

    const upstreamRes = await (fetchFn as typeof fetch)(upstreamUrl, fetchOptions);

    if (!upstreamRes.ok) {
      if (upstreamRes.status === 429) {
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
