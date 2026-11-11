import type { Request, Response } from "express";
import { SettingsRepository } from "../../storage/repositories/settingsRepo.js";
import { ToolMappingRepository } from "../../storage/repositories/toolMappingRepo.js";
import { ComboRepository } from "../../storage/repositories/comboRepo.js";
import { LoadBalancer } from "../../core/router/loadBalancer.js";
import { stripModelContextMarker } from "../../core/router/ruleEngine.js";
import { resolveTargetModelAndProvider } from "./executorHelpers.js";
import { executeUpstreamFetch } from "./proxyDispatcher.js";
import { logger, LogSymbol, tagForSession } from "../../shared/logger.js";
import crypto from "node:crypto";

/**
 * Heuristic token estimator for Anthropic / OpenAI coding models
 */
export function estimateTokens(text: string): number {
  if (!text || typeof text !== "string") return 0;
  let asciiCount = 0;
  let nonAsciiCount = 0;
  for (let i = 0; i < text.length; i++) {
    if (text.charCodeAt(i) < 128) {
      asciiCount++;
    } else {
      nonAsciiCount++;
    }
  }
  return Math.ceil(asciiCount / 3.8 + nonAsciiCount / 1.8);
}

/**
 * Calculates total input tokens for Anthropic Messages payload
 */
export function calculateAnthropicInputTokens(body: any): number {
  if (!body || typeof body !== "object") return 0;

  // Baseline prompt framing tokens
  let total = 3;

  // 1. System prompt
  if (typeof body.system === "string") {
    total += estimateTokens(body.system) + 4;
  } else if (Array.isArray(body.system)) {
    for (const part of body.system) {
      if (part && typeof part.text === "string") {
        total += estimateTokens(part.text) + 2;
      }
    }
    total += 4;
  }

  // 2. Messages
  if (Array.isArray(body.messages)) {
    for (const msg of body.messages) {
      if (!msg) continue;
      total += 4; // per-message framing tokens
      if (typeof msg.role === "string") {
        total += estimateTokens(msg.role);
      }

      if (typeof msg.content === "string") {
        total += estimateTokens(msg.content);
      } else if (Array.isArray(msg.content)) {
        for (const block of msg.content) {
          if (!block || typeof block !== "object") continue;
          if (block.type === "text" && typeof block.text === "string") {
            total += estimateTokens(block.text);
          } else if (block.type === "tool_use") {
            total += estimateTokens(block.name || "") + estimateTokens(JSON.stringify(block.input || {})) + 4;
          } else if (block.type === "tool_result") {
            total += 4;
            if (typeof block.content === "string") {
              total += estimateTokens(block.content);
            } else if (Array.isArray(block.content)) {
              for (const c of block.content) {
                if (c && typeof c.text === "string") total += estimateTokens(c.text);
              }
            }
          } else if (block.type === "image") {
            total += 800; // Average vision tile estimation
          } else if (block.type === "thinking" && typeof block.thinking === "string") {
            total += estimateTokens(block.thinking) + 4;
          }
        }
      }
    }
  }

  // 3. Tools definitions
  if (Array.isArray(body.tools)) {
    for (const tool of body.tools) {
      if (!tool || typeof tool !== "object") continue;
      total += estimateTokens(tool.name || "") +
        estimateTokens(tool.description || "") +
        estimateTokens(JSON.stringify(tool.input_schema || {})) + 12;
    }
  }

  return Math.max(1, total);
}

/**
 * Handles POST /v1/messages/count_tokens for Claude Code and Anthropic clients
 */
export async function handleCountTokens(req: Request, res: Response): Promise<void> {
  const endpointSettings = SettingsRepository.getEndpointSettings();
  const allKeys = SettingsRepository.getGatewayApiKeys();

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

  const matchedKey = providedKey ? allKeys.find((k) => k.key === providedKey) : undefined;
  if (endpointSettings.requireApiKey) {
    const activeKeys = allKeys.filter((k) => k.isActive);
    if (activeKeys.length === 0 || !matchedKey || !matchedKey.isActive) {
      res.status(401).json({
        type: "error",
        error: {
          type: "authentication_error",
          message: "Unauthorized: Invalid or missing gateway API key.",
        },
      });
      return;
    }
  }

  const body = req.body || {};
  if (!body.messages || !Array.isArray(body.messages)) {
    res.status(400).json({
      type: "error",
      error: {
        type: "invalid_request_error",
        message: "messages: Field required",
      },
    });
    return;
  }

  const rawModel = body.model || "default";
  const { model: strippedModel } = stripModelContextMarker(rawModel);
  const cleanModel = strippedModel || rawModel;

  // Resolve tool mapping
  const clientTool = (req.headers["x-client-tool"] as string) || (req.headers["user-agent"] as string) || "";
  let resolvedModel = cleanModel;
  const toolId = clientTool.toLowerCase().includes("claude") ? "claude" : "";
  if (toolId) {
    const mapped = ToolMappingRepository.resolveModelMapping(toolId, cleanModel);
    if (mapped) resolvedModel = mapped;
  }

  // Resolve combo if target is combo
  const allCombos = ComboRepository.getAllCombos();
  const comboLookup = resolvedModel.startsWith("combo/") ? resolvedModel.slice(6) : resolvedModel;
  const activeCombo = allCombos.find(
    (c) => c.isActive && (c.name.toLowerCase() === comboLookup.toLowerCase() || c.id.toLowerCase() === comboLookup.toLowerCase())
  );

  const candidateModel = activeCombo && activeCombo.models[0] ? activeCombo.models[0] : resolvedModel;
  const resolved = resolveTargetModelAndProvider(candidateModel);
  const providerId = resolved.providerId || "claude";

  // If resolved provider is native Claude, try calling upstream Anthropic count_tokens
  if (providerId === "claude") {
    const account = LoadBalancer.pickAccount("claude", { targetModel: resolved.targetModel });
    if (account && account.rawApiKey) {
      try {
        const upstreamUrl = "https://api.anthropic.com/v1/messages/count_tokens";
        const upstreamRes = await executeUpstreamFetch(
          upstreamUrl,
          {
            method: "POST",
            headers: {
              "x-api-key": account.rawApiKey,
              "anthropic-version": "2023-06-01",
              "anthropic-beta": "token-counting-2024-11-01",
              "content-type": "application/json",
            },
            body: JSON.stringify(body),
          },
          ""
        );

        if (upstreamRes.ok) {
          const data: any = await upstreamRes.json();
          if (data && typeof data.input_tokens === "number") {
            res.json(data);
            return;
          }
        }
      } catch {
        // Fallback to local calculation
      }
    }
  }

  // Local calculation fallback
  const input_tokens = calculateAnthropicInputTokens(body);
  const reqTag = tagForSession(req.reqId || crypto.randomUUID());
  logger.line(reqTag, LogSymbol.SAVER, `COUNT_TOKENS: estimated ${input_tokens} tokens for model '${cleanModel}'`);
  res.json({ input_tokens });
}
