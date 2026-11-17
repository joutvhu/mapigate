import { detectRequiredCapabilities } from "../../../core/router/capacityAdapter.js";
import { logger } from "../../../shared/logger.js";
import {
  getRotatedModels,
  reorderByCapabilities,
  getLkgpModel,
  recordComboSuccess,
  getComboModelScore,
  recordComboModelResult,
  getModelCapabilityTier,
} from "./state.js";
import type { ModelCallResult, FallbackChatOptions } from "./types.js";

const defaultComboLogger = {
  info: (msg: string, ...args: any[]) => logger.info("COMBO", msg, ...args),
  warn: (msg: string, ...args: any[]) => logger.warn("COMBO", msg, ...args),
};

export interface FallbackDecision {
  shouldFallback: boolean;
  cooldownMs?: number;
  requestScoped?: boolean;
}

function hasNonEmptyString(val: unknown): boolean {
  return typeof val === "string" && val.trim().length > 0;
}

/**
 * Detects HTTP 200 responses that carry zero usable content across OpenAI Chat,
 * Anthropic Messages, Gemini/Antigravity, OpenAI Responses, and bare `{"text":""}`.
 * Reasoning/thinking blocks count as content. `content_filter` / safety refusals
 * are treated as non-retryable (returns false).
 */
export function isZeroContentResponse(payload: any): boolean {
  if (payload == null) return true;

  if (typeof payload === "string") {
    const trimmed = payload.trim();
    if (!trimmed) return true;
    try {
      const parsed = JSON.parse(trimmed);
      if (parsed && typeof parsed === "object") {
        return isZeroContentResponse(parsed);
      }
      return false;
    } catch {
      return false;
    }
  }

  if (typeof payload !== "object") return false;
  if (Array.isArray(payload)) return payload.length === 0;

  // Respect content_filter / safety refusals as non-retryable
  if (
    payload.choices?.[0]?.finish_reason === "content_filter" ||
    payload.stop_reason === "content_filter" ||
    payload.stop_reason === "refusal" ||
    payload.candidates?.[0]?.finishReason === "SAFETY" ||
    payload.candidates?.[0]?.finishReason === "RECITATION" ||
    payload.candidates?.[0]?.finishReason === "PROHIBITED_CONTENT" ||
    (payload.status === "incomplete" && payload.incomplete_details?.reason === "content_filter")
  ) {
    return false;
  }

  // 1. OpenAI Chat Completions
  if (Array.isArray(payload.choices)) {
    if (payload.choices.length === 0) return true;
    const hasAnyContent = payload.choices.some((choice: any) => {
      const msg = choice?.message || choice?.delta || {};
      const hasText =
        hasNonEmptyString(msg.content) ||
        (Array.isArray(msg.content) && msg.content.length > 0);
      const hasReasoning =
        hasNonEmptyString(msg.reasoning_content) ||
        hasNonEmptyString(msg.reasoning) ||
        hasNonEmptyString(msg.thought);
      const hasTools =
        (Array.isArray(msg.tool_calls) && msg.tool_calls.length > 0) ||
        Boolean(msg.function_call);
      return hasText || hasReasoning || hasTools;
    });
    return !hasAnyContent;
  }

  // 2. Anthropic Messages
  if (payload.type === "message" || Array.isArray(payload.content)) {
    if (!Array.isArray(payload.content) || payload.content.length === 0) return true;
    const hasAnyBlock = payload.content.some((block: any) => {
      if (!block || typeof block !== "object") return false;
      if (block.type === "text") return hasNonEmptyString(block.text);
      if (block.type === "thinking") return hasNonEmptyString(block.thinking);
      if (block.type === "redacted_thinking") return Boolean(block.data);
      if (
        block.type === "tool_use" ||
        block.type === "server_tool_use" ||
        block.type === "web_search_tool_result"
      ) {
        return true;
      }
      return false;
    });
    return !hasAnyBlock;
  }

  // 3. Gemini / Antigravity
  const candidates = Array.isArray(payload.candidates)
    ? payload.candidates
    : Array.isArray(payload.response?.candidates)
    ? payload.response.candidates
    : null;
  if (candidates) {
    if (candidates.length === 0) return true;
    const hasAnyPart = candidates.some((cand: any) => {
      const parts = cand?.content?.parts;
      if (!Array.isArray(parts) || parts.length === 0) return false;
      return parts.some(
        (p: any) =>
          p &&
          (hasNonEmptyString(p.text) ||
            Boolean(p.functionCall) ||
            Boolean(p.inlineData) ||
            Boolean(p.fileData))
      );
    });
    return !hasAnyPart;
  }

  // 4. OpenAI Responses API
  if (payload.object === "response" || Array.isArray(payload.output)) {
    if (!Array.isArray(payload.output) || payload.output.length === 0) return true;
    const hasAnyOutput = payload.output.some((item: any) => {
      if (!item || typeof item !== "object") return false;
      if (item.type === "function_call") return true;
      if (item.type === "reasoning") {
        return (
          (Array.isArray(item.summary) && item.summary.length > 0) ||
          (Array.isArray(item.content) && item.content.length > 0)
        );
      }
      if (item.type === "message" && Array.isArray(item.content)) {
        return item.content.some(
          (c: any) => c && (hasNonEmptyString(c.text) || hasNonEmptyString(c.output_text))
        );
      }
      return false;
    });
    return !hasAnyOutput;
  }

  // 5. Empty object `{}` or bare `{"text": ""}`
  const keys = Object.keys(payload);
  if (keys.length === 0) return true;
  if ("text" in payload && keys.length <= 2 && typeof payload.text === "string") {
    return payload.text.trim().length === 0;
  }

  return false;
}

export function checkFallbackError(
  status: number,
  errorText?: string
): FallbackDecision {
  if (status === 499) {
    return { shouldFallback: false, cooldownMs: 0, requestScoped: false };
  }
  if (status === 429) {
    return { shouldFallback: true, cooldownMs: 1500 };
  }
  if (status === 502 || status === 503 || status === 504) {
    return { shouldFallback: true, cooldownMs: 1000 };
  }
  if (status >= 500) {
    return { shouldFallback: true, cooldownMs: 500 };
  }

  const lower = (errorText || "").toLowerCase();
  const isQuotaOrLimit =
    lower.includes("quota") ||
    lower.includes("rate limit") ||
    lower.includes("insufficient") ||
    lower.includes("balance") ||
    lower.includes("credit") ||
    lower.includes("overloaded") ||
    lower.includes("capacity") ||
    lower.includes("resource_exhausted");

  if (isQuotaOrLimit) {
    return { shouldFallback: true, cooldownMs: 1000 };
  }

  // Request-scoped 4xx (validation failure, unsupported parameter, context overflow).
  // Statuses 401, 402, 403, 404 are credential/account-scoped.
  if (status >= 400 && status < 500 && status !== 401 && status !== 402 && status !== 403 && status !== 404) {
    return { shouldFallback: false, cooldownMs: 0, requestScoped: true };
  }

  return { shouldFallback: false };
}

export async function handleFallbackChat(options: FallbackChatOptions): Promise<ModelCallResult> {
  const {
    body,
    models,
    handleSingleModel,
    log = defaultComboLogger,
    comboName = "",
    comboStrategy = "fallback",
    comboStickyLimit = 1,
    autoSwitch = true,
  } = options;

  let candidateModels = getRotatedModels(models, comboName, comboStrategy, comboStickyLimit);

  let requiredCaps = new Set<string>();
  if (autoSwitch) {
    requiredCaps = detectRequiredCapabilities(body);
    if (requiredCaps.size > 0) {
      candidateModels = reorderByCapabilities(candidateModels, requiredCaps);
    }
  }

  // LKGP Strategy: Promote last known good model to index 0 if valid and capable
  if (comboStrategy === "lkgp" && candidateModels.length > 1) {
    const lkgpModel = getLkgpModel(comboName);
    if (lkgpModel && candidateModels.includes(lkgpModel)) {
      const canPromote =
        !autoSwitch ||
        requiredCaps.size === 0 ||
        getModelCapabilityTier(lkgpModel, requiredCaps) < 2;
      if (canPromote) {
        candidateModels = [lkgpModel, ...candidateModels.filter((m) => m !== lkgpModel)];
      }
    }
  }

  // P2C Strategy: Power of Two Choices with EMA scoring
  if (comboStrategy === "p2c" && candidateModels.length >= 2) {
    const idx1 = Math.floor(Math.random() * candidateModels.length);
    let idx2 = Math.floor(Math.random() * (candidateModels.length - 1));
    if (idx2 >= idx1) idx2++;

    const model1 = candidateModels[idx1];
    const model2 = candidateModels[idx2];
    const score1 = getComboModelScore(model1);
    const score2 = getComboModelScore(model2);

    const [firstIdx, secondIdx] = score1 >= score2 ? [idx1, idx2] : [idx2, idx1];
    const rest = candidateModels.filter((_, idx) => idx !== firstIdx && idx !== secondIdx);
    candidateModels = [candidateModels[firstIdx], candidateModels[secondIdx], ...rest];
  }

  let lastStatus = 503;
  let lastError = "All combo models failed";
  let firstRequestScopedResult: ModelCallResult | null = null;
  let lastAttemptedModel = candidateModels[0] || "";

  for (let i = 0; i < candidateModels.length; i++) {
    const modelStr = candidateModels[i];
    lastAttemptedModel = modelStr;
    log.info(`[COMBO:Fallback] Trying model ${i + 1}/${candidateModels.length}: ${modelStr}`);

    const startTime = Date.now();
    try {
      const res = await handleSingleModel(body, modelStr, false);
      const durationMs = Date.now() - startTime;
      recordComboModelResult(modelStr, res.ok, durationMs);

      if (res.ok) {
        const bodyToCheck =
          res.json !== undefined ? res.json : res.data !== undefined ? res.data : res.text;
        if (!res.isStream && bodyToCheck !== undefined && isZeroContentResponse(bodyToCheck)) {
          log.warn(`[COMBO:Fallback] Model ${modelStr} returned HTTP 200 with zero content, failing over`);
          recordComboModelResult(modelStr, false, durationMs);
          lastStatus = 502;
          lastError = "Upstream returned HTTP 200 with empty content";
          continue;
        }
        log.info(`[COMBO:Fallback] Model ${modelStr} succeeded`);
        recordComboSuccess(comboName, modelStr);
        return { ...res, modelUsed: modelStr };
      }

      const errText = res.error || res.text || String(res.status);
      const { shouldFallback, cooldownMs, requestScoped } = checkFallbackError(res.status, errText);

      lastStatus = res.status;
      lastError = errText;

      // A request-scoped 4xx (validation, unsupported parameter, context overflow) means
      // this member cannot serve THIS request — but a later member might. Advance without cooldown.
      if (requestScoped) {
        log.warn(`[COMBO:Fallback] Model ${modelStr} rejected request (${res.status}): ${errText}, trying next model`);
        if (!firstRequestScopedResult) {
          firstRequestScopedResult = { ...res, modelUsed: modelStr };
        }
        continue;
      }

      if (!shouldFallback) {
        log.warn(`[COMBO:Fallback] Model ${modelStr} failed with unretryable error ${res.status}: ${errText}`);
        return { ...res, modelUsed: modelStr };
      }

      if (cooldownMs && cooldownMs > 0 && cooldownMs <= 3000 && i < candidateModels.length - 1) {
        await new Promise((r) => setTimeout(r, cooldownMs));
      }
    } catch (err: any) {
      const durationMs = Date.now() - startTime;
      recordComboModelResult(modelStr, false, durationMs);
      lastStatus = 500;
      lastError = err.message || String(err);
      log.warn(`[COMBO:Fallback] Model ${modelStr} threw exception: ${lastError}`);
    }
  }

  if (firstRequestScopedResult) {
    log.warn(`[COMBO:Fallback] All combo models failed; returning first request-scoped error (${firstRequestScopedResult.status})`);
    return firstRequestScopedResult;
  }

  return {
    ok: false,
    status: lastStatus,
    error: lastError,
    modelUsed: lastAttemptedModel,
  };
}
