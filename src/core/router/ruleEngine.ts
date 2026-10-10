import type { ModelMappingRule } from "../../shared/types/index.js";

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
  public resolveModel(rawModel: string): { model: string; rule?: ModelMappingRule } {
    const cleanModel = rawModel.replace(/\[\d+[mk]?\]$/i, "").trim();
    const rule = this.rules.get(cleanModel);

    return {
      model: rule ? rule.targetModel : cleanModel,
      rule,
    };
  }
}
