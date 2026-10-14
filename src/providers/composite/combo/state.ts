import { getCapabilitiesForModel } from "../../../core/capabilities/index.js";
import { HARD_CAPS } from "../../../core/router/capacityAdapter.js";
import type { RotationState } from "./types.js";

export const comboRotationState = new Map<string, RotationState>();

export interface ModelStats {
  total: number;
  failures: number;
  emaLatencyMs: number;
}

export const modelRuntimeStats = new Map<string, ModelStats>();
export const lkgpState = new Map<string, string>(); // comboName -> modelStr

export function normalizeStickyLimit(stickyLimit?: number | string): number {
  const parsed = Number.parseInt(String(stickyLimit), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
}

export function rotateModelsFromIndex(models: string[], currentIndex: number): string[] {
  const rotated = [...models];
  for (let i = 0; i < currentIndex; i++) {
    const moved = rotated.shift();
    if (moved) rotated.push(moved);
  }
  return rotated;
}

export function getRotatedModels(
  models: string[],
  comboName: string,
  strategy: string,
  stickyLimit: number | string = 1
): string[] {
  if (!models || models.length <= 1 || strategy !== "round-robin") {
    return models;
  }

  const rotationKey = comboName || "__default__";
  const normalizedStickyLimit = normalizeStickyLimit(stickyLimit);
  const existingState = comboRotationState.get(rotationKey);
  const state = existingState || { index: 0, consecutiveUseCount: 0 };

  const currentIndex = state.index % models.length;
  const rotated = rotateModelsFromIndex(models, currentIndex);
  const nextUseCount = state.consecutiveUseCount + 1;

  if (nextUseCount >= normalizedStickyLimit) {
    comboRotationState.set(rotationKey, {
      index: (currentIndex + 1) % models.length,
      consecutiveUseCount: 0,
    });
  } else {
    comboRotationState.set(rotationKey, {
      index: currentIndex,
      consecutiveUseCount: nextUseCount,
    });
  }

  return rotated;
}

export function resetComboRotation(comboName?: string): void {
  if (comboName) comboRotationState.delete(comboName);
  else comboRotationState.clear();
}

export function resetComboState(comboName?: string): void {
  if (comboName) {
    comboRotationState.delete(comboName);
    lkgpState.delete(comboName);
  } else {
    comboRotationState.clear();
    lkgpState.clear();
    modelRuntimeStats.clear();
  }
}

export function recordComboModelResult(modelStr: string, success: boolean, durationMs: number): void {
  const current = modelRuntimeStats.get(modelStr) || { total: 0, failures: 0, emaLatencyMs: 500 };
  current.total = Math.min(current.total + 1, 100);
  if (!success) {
    current.failures = Math.min(current.failures + 1, 100);
  } else {
    current.failures = Math.max(0, current.failures - 1); // Success decay
  }
  const safeDuration = Math.max(0, durationMs);
  current.emaLatencyMs = Math.round(current.emaLatencyMs * 0.8 + safeDuration * 0.2);
  modelRuntimeStats.set(modelStr, current);
}

export function getComboModelScore(modelStr: string): number {
  const stat = modelRuntimeStats.get(modelStr);
  const errorRate = stat && stat.total > 0 ? stat.failures / stat.total : 0;
  const avgLatencyMs = stat ? Math.max(10, stat.emaLatencyMs) : 500;
  return (1 - errorRate) * 0.6 + (1 / Math.log10(avgLatencyMs + 10)) * 0.4;
}

export function recordComboSuccess(comboName: string, modelStr: string): void {
  if (comboName) lkgpState.set(comboName, modelStr);
}

export function getLkgpModel(comboName: string): string | undefined {
  return lkgpState.get(comboName);
}

export function getModelCapabilityTier(m: string, required: Set<string>): number {
  if (!required || required.size === 0) return 0;
  const hard = [...required].filter((c) => HARD_CAPS.has(c));
  const soft = [...required].filter((c) => !HARD_CAPS.has(c));
  const slash = typeof m === "string" ? m.indexOf("/") : -1;
  const provider = slash > 0 ? m.slice(0, slash) : "";
  const model = slash > 0 ? m.slice(slash + 1) : m;
  const caps = getCapabilitiesForModel(provider, model);
  if (!hard.every((c) => caps[c] === true)) return 2;
  return soft.every((c) => caps[c] === true) ? 0 : 1;
}

export function reorderByCapabilities(models: string[], required: Set<string>): string[] {
  if (!required || required.size === 0 || !Array.isArray(models) || models.length <= 1) {
    return models;
  }
  return models
    .map((m, i) => ({ m, i, t: getModelCapabilityTier(m, required) }))
    .sort((a, b) => a.t - b.t || a.i - b.i)
    .map((x) => x.m);
}
