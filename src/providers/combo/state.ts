import { getCapabilitiesForModel } from "../../core/capabilities/index.js";
import { HARD_CAPS } from "../../core/router/capacityAdapter.js";
import type { RotationState } from "./types.js";

export const comboRotationState = new Map<string, RotationState>();

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

export function reorderByCapabilities(models: string[], required: Set<string>): string[] {
  if (!required || required.size === 0 || !Array.isArray(models) || models.length <= 1) {
    return models;
  }
  const hard = [...required].filter((c) => HARD_CAPS.has(c));
  const soft = [...required].filter((c) => !HARD_CAPS.has(c));

  const tierOf = (m: string) => {
    const slash = typeof m === "string" ? m.indexOf("/") : -1;
    const provider = slash > 0 ? m.slice(0, slash) : "";
    const model = slash > 0 ? m.slice(slash + 1) : m;
    const caps = getCapabilitiesForModel(provider, model);
    if (!hard.every((c) => caps[c] === true)) return 2;
    return soft.every((c) => caps[c] === true) ? 0 : 1;
  };

  return models
    .map((m, i) => ({ m, i, t: tierOf(m) }))
    .sort((a, b) => a.t - b.t || a.i - b.i)
    .map((x) => x.m);
}
