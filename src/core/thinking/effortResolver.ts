import type { ModelCapabilities } from "../capabilities/types.js";
import type { ProviderRegistryItem } from "../../providers/core/types.js";
import { getCapabilitiesForModel } from "../capabilities/index.js";
import { getRegistryProvider } from "../../providers/core/metadataRegistry.js";
import { stripModelContextMarker } from "../router/ruleEngine.js";

const EFFORT_SUFFIX_RE = /^(.*?)\(([a-z][a-z0-9_-]*)\)$/i;
const VARIANT_EFFORT_SUFFIX_RE = /^(.*?)-(disabled|none|minimal|extra-low|low|medium|high|xhigh|max|ultra|thinking)$/i;
const DISABLE_EFFORTS = new Set(["none", "off", "disabled", "disable"]);

const EFFORT_SCORE_HINTS: Record<string, number> = {
  none: 0,
  off: 0,
  disabled: 0,
  disable: 0,
  minimal: 0.15,
  "extra-low": 0.15,
  extra_low: 0.15,
  light: 0.15,
  low: 0.3,
  medium: 0.55,
  mid: 0.55,
  balanced: 0.55,
  thinking: 0.65,
  high: 0.78,
  xhigh: 0.88,
  extra: 0.88,
  "extra-high": 0.88,
  extra_high: 0.88,
  max: 0.95,
  ultra: 1.0,
};

function getEffortScore(effort: string): number | undefined {
  return EFFORT_SCORE_HINTS[effort.trim().toLowerCase()];
}

export function isDisableEffort(effort: string): boolean {
  return DISABLE_EFFORTS.has(effort.trim().toLowerCase());
}

/**
 * Strips trailing `(<effort>)` suffix from a model string while preserving `[1m]` context markers.
 */
export function stripModelEffortSuffix(modelStr?: string): {
  model: string;
  effort?: string;
} {
  if (typeof modelStr !== "string") {
    return { model: "" };
  }
  const trimmed = modelStr.trim();
  if (!trimmed) return { model: "" };

  const ctx = stripModelContextMarker(trimmed);
  const withoutCtx = (ctx.model || trimmed).trim();
  const match = withoutCtx.match(EFFORT_SUFFIX_RE);
  if (!match) {
    return { model: trimmed };
  }

  const base = match[1].trim();
  const effort = match[2].trim().toLowerCase();
  const restored = ctx.contextMarker ? `${base}[${ctx.contextMarker}]` : base;
  return { model: restored, effort };
}

/**
 * Extracts explicit reasoning effort from an incoming client request body.
 */
export function extractClientEffort(body?: any): string | undefined {
  if (!body || typeof body !== "object") return undefined;
  const raw =
    (typeof body.reasoning?.effort === "string" && body.reasoning.effort) ||
    (typeof body.reasoning_effort === "string" && body.reasoning_effort) ||
    (typeof body.output_config?.effort === "string" && body.output_config.effort) ||
    "";
  const normalized = raw.trim().toLowerCase();
  return normalized || undefined;
}

/**
 * Resolves the requested effort intent with priority:
 * 1. Explicit target suffix (e.g. `model(ultra)`) or fixed variant ID
 * 2. Explicit client request effort (`reasoning.effort` / `reasoning_effort` / `output_config.effort`)
 * 3. Provider-level `thinkingMode` (when !== "auto")
 */
export function resolveEffectiveEffort(options: {
  targetEffort?: string;
  body?: any;
  providerThinkingMode?: string;
  hasFixedVariant?: boolean;
}): string | undefined {
  if (options.hasFixedVariant) {
    return undefined;
  }
  if (options.targetEffort && options.targetEffort.trim()) {
    return options.targetEffort.trim().toLowerCase();
  }
  const clientEffort = extractClientEffort(options.body);
  if (clientEffort) {
    return clientEffort;
  }
  const mode =
    typeof options.providerThinkingMode === "string"
      ? options.providerThinkingMode.trim().toLowerCase()
      : "";
  if (mode && mode !== "auto") {
    return mode;
  }
  return undefined;
}

/**
 * Resolves the list of effort values supported by a specific `(providerId, modelId)` pair.
 * Returns `undefined` when neither model nor provider declares a fixed set (passthrough).
 */
export function getSupportedEffortsForTarget(
  providerId: string | undefined,
  modelId: string,
  caps: ModelCapabilities,
  regProv?: ProviderRegistryItem
): string[] | undefined {
  if (Array.isArray(caps?.supportedEfforts) && caps.supportedEfforts.length > 0) {
    return caps.supportedEfforts;
  }

  const resolvedReg = regProv || (providerId ? getRegistryProvider(providerId) : undefined);
  if (resolvedReg?.models) {
    const cleanModel = modelId.includes("/") ? modelId.split("/").pop()! : modelId;
    const match = resolvedReg.models.find(
      (m) =>
        m.id === modelId ||
        m.id === cleanModel ||
        m.upstreamModelId === modelId ||
        m.upstreamModelId === cleanModel
    );
    if (Array.isArray(match?.supportedEfforts) && match.supportedEfforts.length > 0) {
      return match.supportedEfforts;
    }
  }

  if (Array.isArray(resolvedReg?.thinkingOptions) && resolvedReg.thinkingOptions.length > 0) {
    const opts = resolvedReg.thinkingOptions.filter((o) => o.toLowerCase() !== "auto");
    if (opts.length > 0) return opts;
  }

  return undefined;
}

/**
 * Maps or clamps a requested effort to the target model's supported effort set.
 * - Returns `undefined` when no effort was requested.
 * - Returns `null` when effort fields must be omitted/stripped (e.g. non-reasoning model, or disable when not allowed).
 * - Returns the matched/closest effort string otherwise.
 */
export function resolveEffortForTarget(
  requestedEffort: string | undefined,
  supportedEfforts: string[] | undefined,
  caps: Partial<ModelCapabilities>
): string | null | undefined {
  if (!requestedEffort || !requestedEffort.trim()) {
    return undefined;
  }

  if (caps.reasoning === false) {
    return null;
  }

  const req = requestedEffort.trim().toLowerCase();

  if (isDisableEffort(req)) {
    if (caps.thinkingCanDisable === false) {
      return null;
    }
    if (!supportedEfforts || supportedEfforts.length === 0) {
      return req;
    }
    const disableMatch = supportedEfforts.find((e) => isDisableEffort(e));
    return disableMatch ?? null;
  }

  if (!supportedEfforts || supportedEfforts.length === 0) {
    return req;
  }

  const exact = supportedEfforts.find((e) => e.toLowerCase() === req);
  if (exact) {
    return exact;
  }

  const activeEntries = supportedEfforts.filter((e) => !isDisableEffort(e));
  if (activeEntries.length === 0) {
    return null;
  }
  if (activeEntries.length === 1) {
    return activeEntries[0];
  }

  const reqScore = getEffortScore(req);
  if (reqScore === undefined) {
    return activeEntries[Math.floor(activeEntries.length / 2)];
  }
  if (reqScore >= 0.9) {
    return activeEntries[activeEntries.length - 1];
  }

  let best = activeEntries[0];
  let bestDiff = Infinity;
  for (let i = 0; i < activeEntries.length; i++) {
    const entry = activeEntries[i];
    const score = getEffortScore(entry) ?? (activeEntries.length > 1 ? i / (activeEntries.length - 1) : 0.5);
    const diff = Math.abs(score - reqScore);
    if (diff < bestDiff) {
      bestDiff = diff;
      best = entry;
    }
  }
  return best;
}

/**
 * Checks whether a model ID already carries a concrete effort/thinking variant suffix
 * (e.g. `gemini-4-neon-high`, `claude-opus-4-6-thinking`).
 */
export function isFixedVariantModel(modelId: string, availableModels: string[]): boolean {
  const clean = modelId.trim();
  const match = clean.match(VARIANT_EFFORT_SUFFIX_RE);
  if (!match) return false;
  if (availableModels.length === 0) return true;
  return availableModels.some((m) => m.toLowerCase() === clean.toLowerCase());
}

/**
 * Resolves a base model + effort into a concrete variant ID for suffix-based providers (e.g. Antigravity).
 */
export function resolveVariantModelForEffort(
  baseModel: string,
  requestedEffort: string | undefined,
  availableModels: string[]
): { model: string; isFixedVariant: boolean; matchedVariant: boolean } {
  const clean = baseModel.trim();
  if (isFixedVariantModel(clean, availableModels)) {
    return { model: clean, isFixedVariant: true, matchedVariant: false };
  }

  if (!requestedEffort || availableModels.length === 0) {
    return { model: clean, isFixedVariant: false, matchedVariant: false };
  }

  const prefixLower = `${clean.toLowerCase()}-`;
  const suffixMap = new Map<string, string>();

  for (const cand of availableModels) {
    const cTrim = cand.trim();
    if (!cTrim.toLowerCase().startsWith(prefixLower)) continue;
    const rawSuffix = cTrim.slice(prefixLower.length);
    if (!rawSuffix) continue;
    const match = cTrim.match(VARIANT_EFFORT_SUFFIX_RE);
    if (match && match[1].toLowerCase() === clean.toLowerCase()) {
      suffixMap.set(rawSuffix.toLowerCase(), cTrim);
    }
  }

  if (suffixMap.size === 0) {
    return { model: clean, isFixedVariant: false, matchedVariant: false };
  }

  const orderedSuffixes = Array.from(suffixMap.keys()).sort((a, b) => {
    const sa = getEffortScore(a) ?? 0.5;
    const sb = getEffortScore(b) ?? 0.5;
    return sa - sb;
  });

  const resolvedSuffix = resolveEffortForTarget(requestedEffort, orderedSuffixes, {
    reasoning: true,
    thinkingCanDisable: true,
  });

  if (!resolvedSuffix) {
    return { model: clean, isFixedVariant: false, matchedVariant: false };
  }

  const resolvedModel = suffixMap.get(resolvedSuffix.toLowerCase());
  if (!resolvedModel) {
    return { model: clean, isFixedVariant: false, matchedVariant: false };
  }

  return { model: resolvedModel, isFixedVariant: false, matchedVariant: true };
}

/**
 * Convenience resolver for provider transformRequestBody/executor paths.
 * Works both inside the full proxy pipeline and in isolated unit tests.
 */
export function resolveTargetEffortFromContext(options: {
  providerId?: string;
  targetModel: string;
  targetEffort?: string;
  body?: any;
  providerThinkingMode?: string;
  hasFixedVariant?: boolean;
}): {
  cleanModel: string;
  effort: string | null | undefined;
  caps: ModelCapabilities;
} {
  const stripped = stripModelEffortSuffix(options.targetModel);
  const cleanModel = stripped.model || options.targetModel;
  const effectiveTargetEffort = options.targetEffort || stripped.effort;
  const requested = resolveEffectiveEffort({
    targetEffort: effectiveTargetEffort,
    body: options.body,
    providerThinkingMode: options.providerThinkingMode,
    hasFixedVariant: options.hasFixedVariant,
  });

  const caps = getCapabilitiesForModel(options.providerId, cleanModel);
  const regProv = options.providerId ? getRegistryProvider(options.providerId) : undefined;
  const supported = getSupportedEffortsForTarget(options.providerId, cleanModel, caps, regProv);
  const resolved = resolveEffortForTarget(requested, supported, caps);

  return { cleanModel, effort: resolved, caps };
}
