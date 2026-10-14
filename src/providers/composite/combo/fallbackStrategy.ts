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

  for (let i = 0; i < candidateModels.length; i++) {
    const modelStr = candidateModels[i];
    log.info(`[COMBO:Fallback] Trying model ${i + 1}/${candidateModels.length}: ${modelStr}`);

    const startTime = Date.now();
    try {
      const res = await handleSingleModel(body, modelStr, false);
      const durationMs = Date.now() - startTime;
      recordComboModelResult(modelStr, res.ok, durationMs);

      if (res.ok) {
        log.info(`[COMBO:Fallback] Model ${modelStr} succeeded`);
        recordComboSuccess(comboName, modelStr);
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
      const durationMs = Date.now() - startTime;
      recordComboModelResult(modelStr, false, durationMs);
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
