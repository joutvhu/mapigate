import { getDatabase, type DatabaseDriver } from "../database.js";
import {
  TOOL_HOSTS,
  formatToolDefaultHosts,
  type MitmToolId,
} from "../../shared/constants/mitmToolHosts.js";

export interface MitmMapping {
  ide: string;
  sourceModel: string;
  targetModel: string;
}

export const TOOL_DEFAULT_HOSTS: Record<string, string> = {
  antigravity: formatToolDefaultHosts("antigravity"),
  kiro: formatToolDefaultHosts("kiro"),
  copilot: formatToolDefaultHosts("copilot"),
  cursor: formatToolDefaultHosts("cursor"),
};

export const DEFAULT_HOSTS_ENTRIES = Object.values(TOOL_DEFAULT_HOSTS).join("\n");

export const DEFAULT_KIRO_MAPPINGS: MitmMapping[] = [
  { ide: "kiro", sourceModel: "claude-sonnet-4.5", targetModel: "" },
  { ide: "kiro", sourceModel: "claude-sonnet-4", targetModel: "" },
  { ide: "kiro", sourceModel: "claude-haiku-4.5", targetModel: "" },
  { ide: "kiro", sourceModel: "claude-sonnet-5", targetModel: "" },
  { ide: "kiro", sourceModel: "deepseek-3.2", targetModel: "" },
  { ide: "kiro", sourceModel: "minimax-m2.5", targetModel: "" },
  { ide: "kiro", sourceModel: "minimax-m2.1", targetModel: "" },
  { ide: "kiro", sourceModel: "glm-5", targetModel: "" },
  { ide: "kiro", sourceModel: "auto", targetModel: "" },
  { ide: "kiro", sourceModel: "simple-task", targetModel: "" },
  { ide: "kiro", sourceModel: "gpt-5.6-sol", targetModel: "" },
  { ide: "kiro", sourceModel: "gpt-5.6-terra", targetModel: "" },
  { ide: "kiro", sourceModel: "gpt-5.6-luna", targetModel: "" },
  { ide: "kiro", sourceModel: "qwen3-coder-next", targetModel: "" },
];

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

export const DEFAULT_ANTIGRAVITY_MAPPINGS: MitmMapping[] = [
  { ide: "antigravity", sourceModel: "Gemini 3.8 Flash (High)", targetModel: "" },
  { ide: "antigravity", sourceModel: "Gemini 3.8 Flash (Medium)", targetModel: "" },
  { ide: "antigravity", sourceModel: "Gemini 3.8 Flash (Low)", targetModel: "" },
  { ide: "antigravity", sourceModel: "Gemini 3.7 Flash (High)", targetModel: "" },
  { ide: "antigravity", sourceModel: "Gemini 3.7 Flash (Medium)", targetModel: "" },
  { ide: "antigravity", sourceModel: "Gemini 3.7 Flash (Low)", targetModel: "" },
  { ide: "antigravity", sourceModel: "Gemini 3.6 Flash (High)", targetModel: "" },
  { ide: "antigravity", sourceModel: "Gemini 3.6 Flash (Medium)", targetModel: "" },
  { ide: "antigravity", sourceModel: "Gemini 3.6 Flash (Low)", targetModel: "" },
  { ide: "antigravity", sourceModel: "Gemini 3.1 Pro (High)", targetModel: "" },
  { ide: "antigravity", sourceModel: "Gemini 3.1 Pro (Low)", targetModel: "" },
  { ide: "antigravity", sourceModel: "Gemini 3.1 Pro (High) / Legacy", targetModel: "" },
  { ide: "antigravity", sourceModel: "Claude Sonnet 5.5 (Thinking)", targetModel: "" },
  { ide: "antigravity", sourceModel: "Claude Sonnet 5.5 (High)", targetModel: "" },
  { ide: "antigravity", sourceModel: "Claude Sonnet 5.5 (Medium)", targetModel: "" },
  { ide: "antigravity", sourceModel: "Claude Sonnet 5.5 (Low)", targetModel: "" },
  { ide: "antigravity", sourceModel: "Claude Opus 5.5 (Thinking)", targetModel: "" },
  { ide: "antigravity", sourceModel: "Claude Opus 5.5 (High)", targetModel: "" },
  { ide: "antigravity", sourceModel: "Claude Opus 5.5 (Medium)", targetModel: "" },
  { ide: "antigravity", sourceModel: "Claude Opus 5.5 (Low)", targetModel: "" },
  { ide: "antigravity", sourceModel: "Claude Sonnet 4.6 (Thinking)", targetModel: "" },
  { ide: "antigravity", sourceModel: "Claude Opus 4.6 (Thinking)", targetModel: "" },
  { ide: "antigravity", sourceModel: "GPT-OSS 120B (Medium)", targetModel: "" },
];

export const DEFAULT_COPILOT_MAPPINGS: MitmMapping[] = [
  { ide: "copilot", sourceModel: "gpt-4o", targetModel: "" },
  { ide: "copilot", sourceModel: "claude-3.5-sonnet", targetModel: "" },
  { ide: "copilot", sourceModel: "claude-3.7-sonnet", targetModel: "" },
  { ide: "copilot", sourceModel: "o1", targetModel: "" },
];

export const DEFAULT_CURSOR_MAPPINGS: MitmMapping[] = [
  { ide: "cursor", sourceModel: "claude-sonnet-4-5", targetModel: "" },
  { ide: "cursor", sourceModel: "claude-opus-4", targetModel: "" },
  { ide: "cursor", sourceModel: "gpt-4o", targetModel: "" },
];

export function getDefaultMappings(tool: string): MitmMapping[] {
  const t = tool.toLowerCase();
  if (t === "antigravity") return DEFAULT_ANTIGRAVITY_MAPPINGS;
  if (t === "copilot") return DEFAULT_COPILOT_MAPPINGS;
  if (t === "cursor") return DEFAULT_CURSOR_MAPPINGS;
  return DEFAULT_KIRO_MAPPINGS;
}

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
  }

  public static resetHostsEntries(): string {
    this.saveHostsEntries(DEFAULT_HOSTS_ENTRIES);
    return DEFAULT_HOSTS_ENTRIES;
  }

  public static sortMappingsCanonical(ide: string, mappings: MitmMapping[]): MitmMapping[] {
    const defaults = getDefaultMappings(ide);
    const orderMap = new Map<string, number>();
    defaults.forEach((m, idx) => {
      orderMap.set(m.sourceModel.toLowerCase(), idx);
    });

    return [...mappings].sort((a, b) => {
      const idxA = orderMap.has(a.sourceModel.toLowerCase())
        ? orderMap.get(a.sourceModel.toLowerCase())!
        : 10000;
      const idxB = orderMap.has(b.sourceModel.toLowerCase())
        ? orderMap.get(b.sourceModel.toLowerCase())!
        : 10000;

      if (idxA !== idxB) {
        return idxA - idxB;
      }
      return a.sourceModel.localeCompare(b.sourceModel);
    });
  }

  public static migrateKiroMappings(db: DatabaseDriver): void {
    const rows = db.all<any>("SELECT source_model, target_model FROM mitm_mappings WHERE ide = 'kiro'");
    if (rows.length === 0) return;

    const hasLegacy = rows.some((r: any) => {
      const lower = r.source_model.toLowerCase();
      return (
        LEGACY_KIRO_DISPLAY_TO_SLUG[lower] !== undefined ||
        /[A-Z\s()]/.test(r.source_model)
      );
    });

    if (!hasLegacy) return;

    const targetMap = new Map<string, string>();
    const customModels = new Set<string>();

    for (const r of rows) {
      const raw = r.source_model.trim();
      const lower = raw.toLowerCase();
      const canonical =
        LEGACY_KIRO_DISPLAY_TO_SLUG[lower] ||
        lower.replace(/[\s_]+/g, "-").replace(/[()]/g, "");

      const target = (r.target_model || "").trim();
      if (target) {
        if (!targetMap.has(canonical) || !targetMap.get(canonical)) {
          targetMap.set(canonical, target);
        }
      } else if (!targetMap.has(canonical)) {
        targetMap.set(canonical, "");
      }

      const isDefault = DEFAULT_KIRO_MAPPINGS.some((m) => m.sourceModel === canonical);
      if (!isDefault) {
        customModels.add(canonical);
      }
    }

    db.run("DELETE FROM mitm_mappings WHERE ide = 'kiro'");

    for (const def of DEFAULT_KIRO_MAPPINGS) {
      const tgt = targetMap.get(def.sourceModel) || "";
      db.run(
        "INSERT INTO mitm_mappings (ide, source_model, target_model) VALUES ('kiro', ?, ?)",
        def.sourceModel,
        tgt
      );
    }

    for (const cust of customModels) {
      const tgt = targetMap.get(cust) || "";
      db.run(
        "INSERT INTO mitm_mappings (ide, source_model, target_model) VALUES ('kiro', ?, ?)",
        cust,
        tgt
      );
    }
  }

  public static getMappings(ide: string): MitmMapping[] {
    const db = getDatabase();
    if (ide.toLowerCase() === "kiro") {
      this.migrateKiroMappings(db);
    }
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
          LEGACY_KIRO_DISPLAY_TO_SLUG[lower] ||
          lower.replace(/[\s_]+/g, "-").replace(/[()]/g, "");
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
