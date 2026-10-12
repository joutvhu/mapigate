/**
 * Model Capabilities Catalog
 * 
 * Maps models to their input/output modalities and runtime features.
 * Order of resolution (first match wins):
 *   1. Provider Metadata Registry (src/providers/metadataRegistry.ts - Primary SSOT)
 *   2. PROVIDER_CAPABILITIES[provider][model] (provider-specific override)
 *   3. MODEL_CAPABILITIES[model]              (canonical exact id fallback)
 *   4. PATTERN_CAPABILITIES                    (glob pattern match)
 *   5. DEFAULT_CAPABILITIES                    (safe floor)
 */

import type { ModelCapabilities } from "./types.js";
import {
  DEFAULT_CAPABILITIES,
  PROVIDER_CAPABILITIES,
  MODEL_CAPABILITIES,
} from "./constants.js";
import {
  looksLikeVisionModel,
  matchPattern,
  PATTERN_CAPABILITIES,
} from "./patterns.js";
import {
  getRegistryProvider,
  getAllRegistryProviders,
} from "../../providers/metadataRegistry.js";

export * from "./types.js";
export * from "./constants.js";
export * from "./patterns.js";

function normalizeModelCapabilities(
  caps?: Partial<ModelCapabilities> | string[] | null
): Partial<ModelCapabilities> | undefined {
  if (!caps) return undefined;
  if (Array.isArray(caps)) {
    const res: Partial<ModelCapabilities> = {};
    for (const c of caps) {
      if (typeof c === "string") {
        (res as Record<string, any>)[c] = true;
      }
    }
    return res;
  }
  return caps;
}

/**
 * Resolve capabilities for a given provider/model.
 */
export function getCapabilitiesForModel(provider?: string | null, model?: string): ModelCapabilities {
  if (!model) return { ...DEFAULT_CAPABILITIES };

  const baseModel = model.includes("/") ? model.split("/").pop()! : model;
  const inferredProvider = (!provider && model.includes("/")) ? model.split("/")[0] : provider;

  // 1. Primary Source of Truth: Provider Metadata Registry
  if (inferredProvider) {
    const regProvider = getRegistryProvider(inferredProvider);
    if (regProvider?.models) {
      const match = regProvider.models.find(
        (m) =>
          m.id === model ||
          m.id === baseModel ||
          (m.upstreamModelId && (m.upstreamModelId === model || m.upstreamModelId === baseModel))
      );
      if (match?.capabilities) {
        const normalized = normalizeModelCapabilities(match.capabilities);
        if (normalized) {
          const res = { ...DEFAULT_CAPABILITIES, ...normalized };
          if (!res.vision && looksLikeVisionModel(model)) res.vision = true;
          return res;
        }
      }
    }
  } else {
    // If no provider specified, search across all providers in metadata registry
    for (const regProvider of getAllRegistryProviders()) {
      if (!regProvider.models) continue;
      const match = regProvider.models.find(
        (m) =>
          m.id === model ||
          m.id === baseModel ||
          (m.upstreamModelId && (m.upstreamModelId === model || m.upstreamModelId === baseModel))
      );
      if (match?.capabilities) {
        const normalized = normalizeModelCapabilities(match.capabilities);
        if (normalized) {
          const res = { ...DEFAULT_CAPABILITIES, ...normalized };
          if (!res.vision && looksLikeVisionModel(model)) res.vision = true;
          return res;
        }
      }
    }
  }

  // 2. Provider-specific runtime override
  if (inferredProvider && PROVIDER_CAPABILITIES[inferredProvider]) {
    const pCaps = PROVIDER_CAPABILITIES[inferredProvider];
    if (pCaps[model]) return { ...DEFAULT_CAPABILITIES, ...pCaps[model] };
    if (pCaps[baseModel]) return { ...DEFAULT_CAPABILITIES, ...pCaps[baseModel] };
  }

  // 3. Canonical exact model match fallback
  if (MODEL_CAPABILITIES[baseModel]) {
    const res = { ...DEFAULT_CAPABILITIES, ...MODEL_CAPABILITIES[baseModel] };
    if (!res.vision && looksLikeVisionModel(model)) res.vision = true;
    return res;
  }
  if (MODEL_CAPABILITIES[model]) {
    const res = { ...DEFAULT_CAPABILITIES, ...MODEL_CAPABILITIES[model] };
    if (!res.vision && looksLikeVisionModel(model)) res.vision = true;
    return res;
  }

  // 4. Glob Pattern match
  for (const { pattern, caps } of PATTERN_CAPABILITIES) {
    if (matchPattern(pattern, baseModel) || matchPattern(pattern, model)) {
      const res = { ...DEFAULT_CAPABILITIES, ...caps };
      if (!res.vision && looksLikeVisionModel(model)) res.vision = true;
      return res;
    }
  }

  // 5. Fallback floor + name heuristic
  const res = { ...DEFAULT_CAPABILITIES };
  if (!res.vision && looksLikeVisionModel(model)) res.vision = true;
  return res;
}

/**
 * Aggregate capabilities across a combo list of model strings.
 * Union: vision, pdf, audioInput, videoInput, imageOutput, audioOutput, search.
 * Intersection: tools.
 * Primary (first model): reasoning, thinking fields.
 * Conservative: contextWindow = min, maxOutput = max.
 */
export function aggregateComboCapabilities(
  comboModels: string[],
  comboLookup?: Record<string, string[]> | null,
  _depth = 0
): ModelCapabilities | null {
  if (!comboModels || comboModels.length === 0 || _depth > 6) return null;

  const allCaps: ModelCapabilities[] = comboModels.map((fullId) => {
    // Nested combo support: if bare name without slash is in comboLookup, recurse
    if (!fullId.includes("/") && comboLookup?.[fullId]) {
      const nested = aggregateComboCapabilities(comboLookup[fullId], comboLookup, _depth + 1);
      if (nested) return nested;
    }

    const slash = fullId.indexOf("/");
    const provider = slash === -1 ? null : fullId.slice(0, slash);
    const model = slash === -1 ? fullId : fullId.slice(slash + 1);
    return getCapabilitiesForModel(provider, model);
  });

  const first = allCaps[0];

  return {
    vision: allCaps.some((c) => c.vision),
    pdf: allCaps.some((c) => c.pdf),
    audioInput: allCaps.some((c) => c.audioInput),
    videoInput: allCaps.some((c) => c.videoInput),
    imageOutput: allCaps.some((c) => c.imageOutput),
    audioOutput: allCaps.some((c) => c.audioOutput),
    search: allCaps.some((c) => c.search),
    tools: allCaps.every((c) => c.tools),
    reasoning: first.reasoning,
    thinkingFormat: first.thinkingFormat,
    thinkingCanDisable: first.thinkingCanDisable,
    thinkingRange: first.thinkingRange,
    thinkingEffortSupported: first.thinkingEffortSupported,
    contextWindow: Math.min(...allCaps.map((c) => c.contextWindow)),
    maxOutput: Math.max(...allCaps.map((c) => c.maxOutput)),
  };
}
