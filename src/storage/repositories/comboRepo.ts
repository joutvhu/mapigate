import { getDatabase } from "../database.js";
import { buildClaudePresetItems } from "../../core/router/comboPresets.js";
import type { ComboStrategy } from "../../providers/composite/combo/types.js";
import { resetComboState } from "../../providers/composite/combo/state.js";

export interface ComboRecord {
  id: string;
  name: string;
  models: string[];
  strategy: ComboStrategy;
  isActive: boolean;
  createdAt: number;
  updatedAt: number;
}

export type ComboConfig = ComboRecord;

export const VALID_NAME_REGEX = /^[a-zA-Z0-9_.-]+$/;

function mapRowToCombo(r: any): ComboRecord {
  return {
    id: r.id,
    name: r.name,
    models: typeof r.models === "string" ? JSON.parse(r.models || "[]") : (r.models || []),
    strategy: (r.strategy as ComboStrategy) || "round-robin",
    isActive: Boolean(r.is_active),
    createdAt: Number(r.created_at),
    updatedAt: Number(r.updated_at),
  };
}

export class ComboRepository {
  public static seedInitialPresets(): void {
    const db = getDatabase();
    const countRow = db.get<{ count: number }>("SELECT COUNT(*) as count FROM combos");
    if (countRow && countRow.count > 0) {
      return;
    }

    const presets = buildClaudePresetItems();
    const now = Date.now();
    for (const item of presets) {
      const id = item.name.toLowerCase().replace(/[^a-z0-9_.-]/g, "-");
      db.run(
        `INSERT INTO combos (id, name, models, strategy, is_active, created_at, updated_at)
         VALUES (?, ?, ?, 'round-robin', 1, ?, ?)
         ON CONFLICT(name) DO NOTHING`,
        id,
        item.name,
        JSON.stringify(item.models),
        now,
        now
      );
    }
  }

  public static getAllCombos(): ComboRecord[] {
    const db = getDatabase();
    const rows = db.all<any>("SELECT * FROM combos ORDER BY created_at ASC");
    return rows.map(mapRowToCombo);
  }

  public static getComboById(id: string): ComboRecord | undefined {
    const db = getDatabase();
    const row = db.get<any>("SELECT * FROM combos WHERE id = ?", id);
    if (!row) return undefined;
    return mapRowToCombo(row);
  }

  public static getComboByName(name: string): ComboRecord | undefined {
    const db = getDatabase();
    const row = db.get<any>("SELECT * FROM combos WHERE name = ?", name);
    if (!row) return undefined;
    return mapRowToCombo(row);
  }

  public static saveCombo(combo: {
    id?: string;
    name: string;
    models: string[];
    strategy?: ComboStrategy;
    isActive?: boolean;
  }): ComboRecord {
    if (!combo.name || typeof combo.name !== "string" || combo.name.trim().length === 0) {
      throw new Error("Combo name is required.");
    }

    const trimmedName = combo.name.trim();
    if (!VALID_NAME_REGEX.test(trimmedName)) {
      throw new Error("Name can only contain letters, numbers, -, _ and .");
    }

    const db = getDatabase();
    const now = Date.now();
    const id = combo.id || trimmedName.toLowerCase().replace(/[^a-z0-9_.-]/g, "-");
    const strategy = combo.strategy || "round-robin";
    const isActive = combo.isActive !== false ? 1 : 0;
    const models = Array.isArray(combo.models) ? combo.models : [];

    db.run(
      `INSERT INTO combos (id, name, models, strategy, is_active, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(name) DO UPDATE SET
         models = excluded.models,
         strategy = excluded.strategy,
         is_active = excluded.is_active,
         updated_at = excluded.updated_at`,
      id,
      trimmedName,
      JSON.stringify(models),
      strategy,
      isActive,
      now,
      now
    );

    return {
      id,
      name: trimmedName,
      models,
      strategy,
      isActive: Boolean(isActive),
      createdAt: now,
      updatedAt: now,
    };
  }

  public static updateCombo(
    id: string,
    updates: Partial<{
      name: string;
      models: string[];
      strategy: ComboStrategy;
      isActive: boolean;
    }>
  ): ComboRecord | undefined {
    const existing = this.getComboById(id);
    if (!existing) return undefined;

    let newName = existing.name;
    if (updates.name !== undefined) {
      const trimmedName = updates.name.trim();
      if (!VALID_NAME_REGEX.test(trimmedName)) {
        throw new Error("Name can only contain letters, numbers, -, _ and .");
      }
      const existingByName = this.getComboByName(trimmedName);
      if (existingByName && existingByName.id !== id) {
        throw new Error("Combo name already exists.");
      }
      if (trimmedName !== existing.name) {
        resetComboState(existing.name);
      }
      newName = trimmedName;
    }

    const newModels = Array.isArray(updates.models) ? updates.models : existing.models;
    const newStrategy = updates.strategy ?? existing.strategy;
    const newIsActive = updates.isActive !== undefined ? (updates.isActive ? 1 : 0) : (existing.isActive ? 1 : 0);
    const now = Date.now();

    const db = getDatabase();
    db.run(
      `UPDATE combos
       SET name = ?, models = ?, strategy = ?, is_active = ?, updated_at = ?
       WHERE id = ?`,
      newName,
      JSON.stringify(newModels),
      newStrategy,
      newIsActive,
      now,
      id
    );

    return {
      id,
      name: newName,
      models: newModels,
      strategy: newStrategy,
      isActive: Boolean(newIsActive),
      createdAt: existing.createdAt,
      updatedAt: now,
    };
  }

  public static deleteCombo(id: string): boolean {
    const existing = this.getComboById(id) || this.getComboByName(id);
    const db = getDatabase();
    const result = db.run("DELETE FROM combos WHERE id = ? OR name = ?", id, id);
    if (result.changes > 0) {
      if (existing) {
        resetComboState(existing.name);
      }
      resetComboState(id);
      return true;
    }
    return false;
  }

  public static toggleCombo(id: string): ComboRecord | undefined {
    const existing = this.getComboById(id) || this.getComboByName(id);
    if (!existing) return undefined;

    const newActive = !existing.isActive;
    const now = Date.now();
    const db = getDatabase();
    db.run(
      `UPDATE combos SET is_active = ?, updated_at = ? WHERE id = ?`,
      newActive ? 1 : 0,
      now,
      existing.id
    );

    return {
      ...existing,
      isActive: newActive,
      updatedAt: now,
    };
  }
}
