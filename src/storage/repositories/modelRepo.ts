import { getDatabase } from "../database.js";
import type { ModelMappingRule } from "../../shared/types/index.js";

export class ModelRepository {
  public static getAllRules(): ModelMappingRule[] {
    const db = getDatabase();
    const rows = db.all<any>("SELECT * FROM model_rules ORDER BY is_default DESC, alias ASC");
    return rows.map((r) => ({
      id: r.id,
      alias: r.alias,
      targetModel: r.target_model,
      targetProviderId: r.target_provider_id,
      fallbackRules: JSON.parse(r.fallback_rules || "[]"),
      isDefault: Boolean(r.is_default),
    }));
  }

  public static getRuleByAlias(alias: string): ModelMappingRule | undefined {
    const db = getDatabase();
    const cleanAlias = alias.replace(/\[\d+[mk]?\]$/i, "").trim();
    const r = db.get<any>("SELECT * FROM model_rules WHERE alias = ?", cleanAlias);
    if (!r) return undefined;
    return {
      id: r.id,
      alias: r.alias,
      targetModel: r.target_model,
      targetProviderId: r.target_provider_id,
      fallbackRules: JSON.parse(r.fallback_rules || "[]"),
      isDefault: Boolean(r.is_default),
    };
  }

  public static saveRule(rule: ModelMappingRule): void {
    const db = getDatabase();
    const now = Date.now();
    db.run(
      `INSERT INTO model_rules (id, alias, target_model, target_provider_id, fallback_rules, is_default, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(alias) DO UPDATE SET
         target_model = excluded.target_model,
         target_provider_id = excluded.target_provider_id,
         fallback_rules = excluded.fallback_rules,
         is_default = excluded.is_default`,
      rule.id,
      rule.alias,
      rule.targetModel,
      rule.targetProviderId,
      JSON.stringify(rule.fallbackRules),
      rule.isDefault ? 1 : 0,
      now
    );
  }

  public static deleteRule(id: string): void {
    const db = getDatabase();
    db.run("DELETE FROM model_rules WHERE id = ?", id);
  }
}
