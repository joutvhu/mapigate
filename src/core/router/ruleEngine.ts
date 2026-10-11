import type { ModelMappingRule } from "../../shared/types/index.js";

const CONTEXT_MARKER = /\[1m\]$/i;

export interface ModelMarkerResult {
  model?: string;
  contextMarker: string | null;
  is1mContext: boolean;
}

/**
 * Strips [1m] context marker from model name.
 * Handles both plain models ('claude-3-7-sonnet[1m]') and provider-prefixed models ('anthropic/claude-3-7-sonnet[1m]').
 */
export function stripModelContextMarker(modelStr?: string): ModelMarkerResult {
  if (typeof modelStr !== "string") {
    return { model: modelStr, contextMarker: null, is1mContext: false };
  }
  const trimmed = modelStr.trim();
  const match = trimmed.match(CONTEXT_MARKER);
  if (!match) {
    return { model: modelStr, contextMarker: null, is1mContext: false };
  }
  const cleanModel = trimmed.slice(0, -match[0].length);
  const marker = match[0].slice(1, -1).toLowerCase();
  return {
    model: cleanModel,
    contextMarker: marker,
    is1mContext: marker === "1m",
  };
}

export class RuleEngine {
  private rules: Map<string, ModelMappingRule> = new Map();

  constructor(initialRules: ModelMappingRule[] = []) {
    for (const rule of initialRules) {
      this.rules.set(rule.alias, rule);
    }
  }

  /**
   * Resolves incoming model name (stripping context tags like [1m])
   */
  public resolveModel(rawModel: string): { model: string; rule?: ModelMappingRule; is1mContext: boolean } {
    const { model: strippedModel, is1mContext } = stripModelContextMarker(rawModel);
    const cleanModel = (strippedModel || rawModel).replace(/\[\d+[mk]?\]$/i, "").trim();
    const rule = this.rules.get(cleanModel);

    return {
      model: rule ? rule.targetModel : cleanModel,
      rule,
      is1mContext: is1mContext || /\[1m\]$/i.test(rawModel),
    };
  }
}
