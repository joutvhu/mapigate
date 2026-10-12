import { detectRequiredCapabilities } from "../../core/router/capacityAdapter.js";
import { logger } from "../../shared/logger.js";
import { getRotatedModels, reorderByCapabilities } from "./state.js";
import type { ModelCallResult, FallbackChatOptions } from "./types.js";

const defaultComboLogger = {
  info: (msg: string, ...args: any[]) => logger.info("COMBO", msg, ...args),
  warn: (msg: string, ...args: any[]) => logger.warn("COMBO", msg, ...args),
};

export function checkFallbackError(
  status: number,
  errorText?: string
): { shouldFallback: boolean; cooldownMs?: number } {
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
    lower.includes("overloaded") ||
    lower.includes("capacity") ||
    lower.includes("resource_exhausted");

  if (isQuotaOrLimit) {
    return { shouldFallback: true, cooldownMs: 1000 };
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

  if (autoSwitch) {
    const required = detectRequiredCapabilities(body);
    if (required.size > 0) {
      candidateModels = reorderByCapabilities(candidateModels, required);
    }
  }

  let lastStatus = 503;
  let lastError = "All combo models failed";

  for (let i = 0; i < candidateModels.length; i++) {
    const modelStr = candidateModels[i];
    log.info(`[COMBO:Fallback] Trying model ${i + 1}/${candidateModels.length}: ${modelStr}`);

    try {
      const res = await handleSingleModel(body, modelStr, false);

      if (res.ok) {
        log.info(`[COMBO:Fallback] Model ${modelStr} succeeded`);
        return { ...res, modelUsed: modelStr };
      }

      const errText = res.error || res.text || String(res.status);
      const { shouldFallback, cooldownMs } = checkFallbackError(res.status, errText);

      lastStatus = res.status;
      lastError = errText;

      if (!shouldFallback) {
        log.warn(`[COMBO:Fallback] Model ${modelStr} failed with unretryable error ${res.status}: ${errText}`);
        return { ...res, modelUsed: modelStr };
      }

      if (cooldownMs && cooldownMs > 0 && cooldownMs <= 3000 && i < candidateModels.length - 1) {
        await new Promise((r) => setTimeout(r, cooldownMs));
      }
    } catch (err: any) {
      lastStatus = 500;
      lastError = err.message || String(err);
      log.warn(`[COMBO:Fallback] Model ${modelStr} threw exception: ${lastError}`);
    }
  }

  return {
    ok: false,
    status: lastStatus,
    error: lastError,
  };
}
