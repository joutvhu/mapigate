import { getDatabase } from "../database.js";

export interface ComboRecord {
  id: string;
  name: string;
  models: string[];
  strategy: "round-robin" | "fallback" | "fusion";
  isActive: boolean;
  createdAt: number;
  updatedAt: number;
}

export class ComboRepository {
  public static getAllCombos(): ComboRecord[] {
    const db = getDatabase();
    const rows = db.all<any>("SELECT * FROM combos ORDER BY created_at ASC");
    return rows.map((r) => ({
      id: r.id,
      name: r.name,
      models: JSON.parse(r.models || "[]"),
      strategy: r.strategy,
      isActive: Boolean(r.is_active),
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    }));
  }

  public static saveCombo(combo: {
    id?: string;
    name: string;
    models: string[];
    strategy: "round-robin" | "fallback" | "fusion";
  }): ComboRecord {
    const db = getDatabase();
    const now = Date.now();
    const id = combo.id || combo.name.toLowerCase().replace(/[^a-z0-9_-]/g, "-");

    db.run(
      `INSERT INTO combos (id, name, models, strategy, is_active, created_at, updated_at)
       VALUES (?, ?, ?, ?, 1, ?, ?)
       ON CONFLICT(name) DO UPDATE SET
         models = excluded.models,
         strategy = excluded.strategy,
         updated_at = excluded.updated_at`,
      id,
      combo.name,
      JSON.stringify(combo.models),
      combo.strategy,
      now,
      now
    );

    return {
      id,
      name: combo.name,
      models: combo.models,
      strategy: combo.strategy,
      isActive: true,
      createdAt: now,
      updatedAt: now,
    };
  }

  public static deleteCombo(id: string): void {
    const db = getDatabase();
    db.run("DELETE FROM combos WHERE id = ? OR name = ?", id, id);
  }
}
