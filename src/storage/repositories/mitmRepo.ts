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

export const DEFAULT_KIRO_MAPPINGS: MitmMapping[] = getDefaultMappings("kiro");
export const DEFAULT_ANTIGRAVITY_MAPPINGS: MitmMapping[] = getDefaultMappings("antigravity");
export const DEFAULT_COPILOT_MAPPINGS: MitmMapping[] = getDefaultMappings("copilot");

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
    const tools: MitmToolId[] = ["antigravity", "kiro", "copilot"];
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

  public static getToolAugmentModels(tool: string): boolean {
    const db = getDatabase();
    const key = `mitm_augment_${tool.toLowerCase()}`;
    const row = db.get<any>("SELECT value FROM settings WHERE key = ?", key);
    if (!row) {
      return false;
    }
    return row.value === "true" || row.value === "1";
  }

  public static setToolAugmentModels(tool: string, active: boolean): void {
    const db = getDatabase();
    const key = `mitm_augment_${tool.toLowerCase()}`;
    db.run(
      `INSERT INTO settings (key, value) VALUES (?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
      key,
      active ? "true" : "false"
    );
  }

  public static getAllToolAugmentModels(): Record<string, boolean> {
    const tools: MitmToolId[] = ["antigravity", "kiro", "copilot"];
    const result: Record<string, boolean> = {};
    for (const tool of tools) {
      result[tool] = this.getToolAugmentModels(tool);
    }
    return result;
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

  public static getMappings(ide: string): MitmMapping[] {
    const db = getDatabase();
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
  } catch {
    // Database uninitialized or in test environment
  }

  return { toolHostsMap, allCustomHosts };
});
