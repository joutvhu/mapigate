import { getDatabase, type DatabaseDriver } from "../database.js";
import {
  TOOL_HOSTS,
  MITM_TOOLS,
  formatToolDefaultHosts,
  invalidateCustomMitmHostsCache,
  registerCustomHostsProvider,
  parseHostnamesFromHostsEntries,
  type MitmToolId,
} from "../../shared/constants/mitmToolHosts.js";

export interface MitmMapping {
  ide: string;
  sourceModel: string;
  targetModel: string;
}

import {
  TOOL_DEFAULT_HOSTS,
  getDefaultMappings,
} from "../../mitm/toolsHelper.js";

export { TOOL_DEFAULT_HOSTS, getDefaultMappings };

export const DEFAULT_HOSTS_ENTRIES = Object.values(TOOL_DEFAULT_HOSTS).join("\n");

export const DEFAULT_KIRO_MAPPINGS: MitmMapping[] = getDefaultMappings("kiro");
export const DEFAULT_ANTIGRAVITY_MAPPINGS: MitmMapping[] = getDefaultMappings("antigravity");
export const DEFAULT_COPILOT_MAPPINGS: MitmMapping[] = getDefaultMappings("copilot");
export const DEFAULT_CURSOR_MAPPINGS: MitmMapping[] = getDefaultMappings("cursor");

export const LEGACY_KIRO_DISPLAY_TO_SLUG: Record<string, string> = {
  "auto (kiro agent)": "auto",
  "auto": "auto",
  "simple-task": "simple-task",
  "claude sonnet 5": "claude-sonnet-5",
  "claude sonnet 4.5": "claude-sonnet-4.5",
  "claude sonnet 4": "claude-sonnet-4",
  "claude haiku 4.5": "claude-haiku-4.5",
  "deepseek 3.2": "deepseek-3.2",
  "minimax m2.5": "minimax-m2.5",
  "minimax m2.1": "minimax-m2.1",
  "gpt 5.6 sol": "gpt-5.6-sol",
  "gpt 5.6 terra": "gpt-5.6-terra",
  "gpt 5.6 luna": "gpt-5.6-luna",
  "glm 5": "glm-5",
  "qwen3 coder next": "qwen3-coder-next",
};

export class MitmRepository {
  public static getToolDnsStatus(tool: string): boolean {
    const db = getDatabase();
    const key = `mitm_dns_${tool.toLowerCase()}`;
    const row = db.get<any>("SELECT value FROM settings WHERE key = ?", key);
    if (!row) {
      return false;
    }
    return row.value === "true" || row.value === "1";
  }

  public static getAllToolDnsStatus(): Record<string, boolean> {
    const tools: MitmToolId[] = ["antigravity", "kiro", "copilot", "cursor"];
    const result: Record<string, boolean> = {};
    for (const tool of tools) {
      result[tool] = this.getToolDnsStatus(tool);
    }
    return result;
  }

  public static setToolDnsStatus(tool: string, active: boolean): void {
    const db = getDatabase();
    const key = `mitm_dns_${tool.toLowerCase()}`;
    db.run(
      `INSERT INTO settings (key, value) VALUES (?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
      key,
      active ? "true" : "false"
    );
  }

  public static getMitmServerRunning(): boolean {
    const db = getDatabase();
    const row = db.get<any>("SELECT value FROM settings WHERE key = 'mitm_server_running'");
    if (!row) return true;
    return row.value === "true" || row.value === "1";
  }

  public static setMitmServerRunning(running: boolean): void {
    const db = getDatabase();
    db.run(
      `INSERT INTO settings (key, value) VALUES ('mitm_server_running', ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
      running ? "true" : "false"
    );
  }

  public static getToolHosts(tool: string): string {
    const db = getDatabase();
    const row = db.get<any>("SELECT value FROM settings WHERE key = ?", `mitm_hosts_${tool}`);
    return row?.value || TOOL_DEFAULT_HOSTS[tool] || "";
  }

  public static saveToolHosts(tool: string, entries: string): void {
    const db = getDatabase();
    db.run(
      `INSERT INTO settings (key, value) VALUES (?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
      `mitm_hosts_${tool}`,
      entries
    );
    try {
      invalidateCustomMitmHostsCache();
    } catch {}
  }

  public static resetToolHosts(tool: string): string {
    const defaultEntries = TOOL_DEFAULT_HOSTS[tool] || "";
    this.saveToolHosts(tool, defaultEntries);
    return defaultEntries;
  }

  // Backward compatibility methods for global hosts
  public static getHostsEntries(): string {
    const db = getDatabase();
    const row = db.get<any>("SELECT value FROM settings WHERE key = 'mitm_hosts'");
    return row?.value || DEFAULT_HOSTS_ENTRIES;
  }

  public static saveHostsEntries(entries: string): void {
    const db = getDatabase();
    db.run(
      `INSERT INTO settings (key, value) VALUES ('mitm_hosts', ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
      entries
    );
    try {
      invalidateCustomMitmHostsCache();
    } catch {}
  }

  public static resetHostsEntries(): string {
    this.saveHostsEntries(DEFAULT_HOSTS_ENTRIES);
    return DEFAULT_HOSTS_ENTRIES;
  }

  public static sortMappingsCanonical(ide: string, mappings: MitmMapping[]): MitmMapping[] {
    return [...mappings].sort((a, b) => {
      const isAutoA = a.sourceModel.toLowerCase() === "auto";
      const isAutoB = b.sourceModel.toLowerCase() === "auto";
      if (isAutoA && !isAutoB) return -1;
      if (!isAutoA && isAutoB) return 1;

      return a.sourceModel.localeCompare(b.sourceModel, undefined, {
        numeric: true,
        sensitivity: "base",
      });
    });
  }

  public static migrateToolDisplayMappings(db: DatabaseDriver, ide: string): void {
    const rows = db.all<any>("SELECT source_model, target_model FROM mitm_mappings WHERE ide = ?", ide);
    if (rows.length === 0) return;

    const hasLegacy = rows.some((r: any) => {
      const lower = String(r.source_model || "").toLowerCase();
      return (
        (ide === "kiro" && LEGACY_KIRO_DISPLAY_TO_SLUG[lower] !== undefined) ||
        /[A-Z\s()]/.test(r.source_model)
      );
    });

    if (!hasLegacy) return;

    const targetMap = new Map<string, string>();
    const customModels = new Set<string>();
    const defaults = getDefaultMappings(ide);

    for (const r of rows) {
      const raw = String(r.source_model || "").trim();
      const lower = raw.toLowerCase();
      const canonical =
        (ide === "kiro" && LEGACY_KIRO_DISPLAY_TO_SLUG[lower]) ||
        lower
          .replace(/[\s_]+/g, "-")
          .replace(/[()]/g, "")
          .replace(/\//g, "-")
          .replace(/-+/g, "-");

      const target = (r.target_model || "").trim();
      if (target) {
        if (!targetMap.has(canonical) || !targetMap.get(canonical)) {
          targetMap.set(canonical, target);
        }
      } else if (!targetMap.has(canonical)) {
        targetMap.set(canonical, "");
      }

      const isDefault = defaults.some((m) => m.sourceModel === canonical);
      if (!isDefault) {
        customModels.add(canonical);
      }
    }

    db.run("DELETE FROM mitm_mappings WHERE ide = ?", ide);

    for (const def of defaults) {
      const tgt = targetMap.get(def.sourceModel) || "";
      db.run(
        "INSERT INTO mitm_mappings (ide, source_model, target_model) VALUES (?, ?, ?)",
        ide,
        def.sourceModel,
        tgt
      );
    }

    for (const cust of customModels) {
      const tgt = targetMap.get(cust) || "";
      db.run(
        "INSERT INTO mitm_mappings (ide, source_model, target_model) VALUES (?, ?, ?)",
        ide,
        cust,
        tgt
      );
    }
  }

  public static migrateKiroMappings(db: DatabaseDriver): void {
    this.migrateToolDisplayMappings(db, "kiro");
  }

  public static getMappings(ide: string): MitmMapping[] {
    const db = getDatabase();
    this.migrateToolDisplayMappings(db, ide.toLowerCase());
    const rows = db.all<any>("SELECT * FROM mitm_mappings WHERE ide = ?", ide);
    if (rows.length === 0) {
      const defaults = getDefaultMappings(ide);
      this.initDefaultMappings(ide, defaults);
      return defaults;
    }
    const list = rows.map((r) => ({
      ide: r.ide,
      sourceModel: r.source_model,
      targetModel: r.target_model,
    }));
    return this.sortMappingsCanonical(ide, list);
  }

  public static initDefaultMappings(ide: string, mappings: MitmMapping[]): void {
    const db = getDatabase();
    for (const m of mappings) {
      db.run(
        "INSERT OR IGNORE INTO mitm_mappings (ide, source_model, target_model) VALUES (?, ?, ?)",
        ide,
        m.sourceModel,
        m.targetModel
      );
    }
  }

  public static resetMappings(ide: string): MitmMapping[] {
    const db = getDatabase();
    // 1. Fetch current mappings for this ide to preserve user targetModel selections
    const currentRows = db.all<any>("SELECT source_model, target_model FROM mitm_mappings WHERE ide = ?", ide);
    const existingTargetMap = new Map<string, string>();
    for (const r of currentRows) {
      if (r.target_model && r.target_model.trim().length > 0) {
        existingTargetMap.set(r.source_model, r.target_model.trim());
        const lower = r.source_model.toLowerCase();
        const canonical =
          (ide.toLowerCase() === "kiro" && LEGACY_KIRO_DISPLAY_TO_SLUG[lower]) ||
          lower
            .replace(/[\s_]+/g, "-")
            .replace(/[()]/g, "")
            .replace(/\//g, "-")
            .replace(/-+/g, "-");
        existingTargetMap.set(canonical, r.target_model.trim());
      }
    }

    // 2. Delete old mappings for this ide
    db.run("DELETE FROM mitm_mappings WHERE ide = ?", ide);

    // 3. Get standard defaults for this IDE with empty target models
    const defaults = getDefaultMappings(ide);

    // 4. Preserve existing user choices for standard models, or default to ""
    const restoredMappings: MitmMapping[] = defaults.map((m) => ({
      ide: m.ide,
      sourceModel: m.sourceModel,
      targetModel: existingTargetMap.get(m.sourceModel) || "",
    }));

    // 5. Insert restored mappings
    for (const m of restoredMappings) {
      db.run(
        "INSERT INTO mitm_mappings (ide, source_model, target_model) VALUES (?, ?, ?)",
        m.ide,
        m.sourceModel,
        m.targetModel
      );
    }

    return this.sortMappingsCanonical(ide, restoredMappings);
  }

  public static updateMapping(ide: string, sourceModel: string, targetModel: string): void {
    const db = getDatabase();
    db.run(
      `INSERT INTO mitm_mappings (ide, source_model, target_model)
       VALUES (?, ?, ?)
       ON CONFLICT(ide, source_model) DO UPDATE SET target_model = excluded.target_model`,
      ide,
      sourceModel,
      targetModel
    );
  }

  public static deleteMapping(ide: string, sourceModel: string): void {
    const db = getDatabase();
    db.run("DELETE FROM mitm_mappings WHERE ide = ? AND source_model = ?", ide, sourceModel);
  }
}

registerCustomHostsProvider(() => {
  const toolHostsMap = new Map<string, string>();
  const allCustomHosts = new Set<string>();

  try {
    const db = getDatabase();
    for (const tool of MITM_TOOLS) {
      const row = db.get<{ value?: string }>(
        "SELECT value FROM settings WHERE key = ?",
        `mitm_hosts_${tool.id}`
      );
      if (row?.value) {
        const hostnames = parseHostnamesFromHostsEntries(row.value);
        for (const h of hostnames) {
          toolHostsMap.set(h, tool.id);
          allCustomHosts.add(h);
        }
      }
    }

    const globalRow = db.get<{ value?: string }>(
      "SELECT value FROM settings WHERE key = 'mitm_hosts'"
    );
    if (globalRow?.value) {
      const hostnames = parseHostnamesFromHostsEntries(globalRow.value);
      for (const h of hostnames) {
        allCustomHosts.add(h);
      }
    }
  } catch {
    // Database uninitialized or in test environment
  }

  return { toolHostsMap, allCustomHosts };
});
