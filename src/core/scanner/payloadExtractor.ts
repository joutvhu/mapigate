import type { ScannedModel } from "../../shared/types/index.js";
import { getCapabilitiesForModel } from "../capabilities/index.js";

/**
 * Normalizes different API response shapes into a uniform array of ScannedModel.
 * Independent utility free from any circular provider imports.
 */
export function extractModelsFromPayload(data: unknown, providerId?: string): ScannedModel[] {
  if (!data || typeof data !== "object") return [];

  let rawList: unknown[] = [];

  if (Array.isArray(data)) {
    rawList = data;
  } else {
    const obj = data as Record<string, unknown>;
    if (obj.defaultModel && typeof obj.defaultModel === "object") {
      rawList.push(obj.defaultModel);
    }
    if (Array.isArray(obj.models)) {
      rawList.push(...obj.models);
    } else if (obj.models && typeof obj.models === "object") {
      rawList.push(...Object.entries(obj.models as Record<string, any>).map(([k, v]) => {
        if (v && typeof v === "object") {
          return { id: k, name: v.displayName || v.name || k, ...v };
        }
        return { id: k, name: k };
      }));
    } else if (Array.isArray(obj.modelSummaries)) {
      rawList.push(...obj.modelSummaries);
    } else if (Array.isArray(obj.data)) {
      rawList = obj.data;
    } else if (Array.isArray(obj.result)) {
      rawList = obj.result;
    } else if (Array.isArray(obj.results)) {
      rawList = obj.results;
    } else if (Array.isArray(obj.items)) {
      rawList = obj.items;
    } else if (Array.isArray(obj.list)) {
      rawList = obj.list;
    } else if (obj.data && typeof obj.data === "object") {
      const nested = obj.data as Record<string, unknown>;
      if (Array.isArray(nested.models)) {
        rawList = nested.models;
      } else if (Array.isArray(nested.list)) {
        rawList = nested.list;
      } else if (Array.isArray(nested.items)) {
        rawList = nested.items;
      } else if (Array.isArray(nested.data)) {
        rawList = nested.data;
      }
    } else if (obj.result && typeof obj.result === "object") {
      const nested = obj.result as Record<string, unknown>;
      if (Array.isArray(nested.models)) {
        rawList = nested.models;
      } else if (Array.isArray(nested.list)) {
        rawList = nested.list;
      } else if (Array.isArray(nested.items)) {
        rawList = nested.items;
      }
    }
  }

  const isOpenCodeFree = providerId === "opencode" || providerId === "oc";
  if (isOpenCodeFree) {
    const DEAD = new Set(["deepseek-v4-flash-free"]);
    const cleaned = (rawList as any[]).filter((m) => {
      const id = typeof m === "string" ? m : m.id || m.model;
      return id && !DEAD.has(id);
    });
    rawList = cleaned;
  }

  const results: ScannedModel[] = [];
  const seenIds = new Set<string>();

  for (const item of rawList) {
    if (!item) continue;

    if (typeof item === "string") {
      const id = item.trim();
      if (id && !seenIds.has(id)) {
        seenIds.add(id);
        const caps = getCapabilitiesForModel(providerId || "openai", id);
        results.push({
          id,
          name: id,
          capabilities: {
            vision: Boolean(caps.vision),
            reasoning: Boolean(caps.reasoning),
            audio: Boolean(caps.audioInput || caps.audioOutput),
          },
          contextLength: caps.contextWindow || undefined,
          raw: item,
        });
      }
      continue;
    }

    if (typeof item === "object") {
      const rec = item as Record<string, unknown>;
      let rawId = rec.id || rec.slug || rec.name || rec.model || rec.model_name || rec.code || rec.modelId;
      if (typeof rawId !== "string" && typeof rawId !== "number") continue;
      let id = String(rawId).trim();
      if (!id) continue;

      // Handle Gemini models/ prefix if present
      if (id.startsWith("models/")) {
        id = id.slice(7);
      }

      if (seenIds.has(id)) continue;
      seenIds.add(id);

      const name = typeof rec.display_name === "string"
        ? rec.display_name
        : typeof rec.displayName === "string"
          ? rec.displayName
          : typeof rec.title === "string"
            ? rec.title
            : typeof rec.modelName === "string"
              ? rec.modelName
              : typeof rec.name === "string" && !rec.name.startsWith("models/")
                ? rec.name
                : id;

      const description = typeof rec.description === "string" ? rec.description : undefined;

      let contextLength: number | undefined;
      const rawCtx =
        rec.context_length ??
        rec.context_window ??
        rec.max_tokens ??
        rec.contextLength ??
        (rec.tokenLimits as any)?.maxInputTokens;
      if (typeof rawCtx === "number" && rawCtx > 0) {
        contextLength = rawCtx;
      }

      const recCaps = rec.capabilities && typeof rec.capabilities === "object" ? (rec.capabilities as any) : undefined;
      const isVisionFromCaps = typeof recCaps?.vision === "boolean" ? recCaps.vision : false;
      const isReasoningFromCaps = typeof recCaps?.reasoning === "boolean" ? recCaps.reasoning : false;

      const isImageSupported =
        isVisionFromCaps ||
        (Array.isArray((rec as any).supportedInputTypes) &&
          (rec as any).supportedInputTypes.includes("IMAGE"));
      const isReasoning =
        isReasoningFromCaps ||
        id.includes("thinking") ||
        id.includes("r1") ||
        id.includes("reasoning") ||
        description?.toLowerCase().includes("reasoning");

      const caps = getCapabilitiesForModel(providerId || "openai", id);
      results.push({
        id,
        name,
        description,
        capabilities: {
          vision: isImageSupported || Boolean(caps.vision),
          reasoning: isReasoning || Boolean(caps.reasoning),
          audio: Boolean(caps.audioInput || caps.audioOutput),
        },
        contextLength: contextLength || caps.contextWindow || undefined,
        raw: item,
      });
    }
  }

  return results;
}
