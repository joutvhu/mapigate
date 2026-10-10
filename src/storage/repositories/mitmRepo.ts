import { getDatabase } from "../database.js";

export interface MitmMapping {
  ide: string;
  sourceModel: string;
  targetModel: string;
}

export const TOOL_DEFAULT_HOSTS: Record<string, string> = {
  antigravity: "127.0.0.1 daily-cloudcode-pa.googleapis.com",
  kiro: "127.0.0.1 runtime.us-east-1.kiro.dev\n127.0.0.1 api.kiro.dev",
  copilot: "127.0.0.1 api.githubcopilot.com",
};

export const DEFAULT_HOSTS_ENTRIES = Object.values(TOOL_DEFAULT_HOSTS).join("\n");

export const DEFAULT_KIRO_MAPPINGS: MitmMapping[] = [
  { ide: "kiro", sourceModel: "Auto (Kiro Agent)", targetModel: "ag/gemini-3.8-flash" },
  { ide: "kiro", sourceModel: "Claude Sonnet 5", targetModel: "ag/gemini-3.8-flash" },
  { ide: "kiro", sourceModel: "Claude Sonnet 4.5", targetModel: "ag/claude-opus-4-6-thinking" },
  { ide: "kiro", sourceModel: "Claude Sonnet 4", targetModel: "ag/claude-sonnet-4-6" },
  { ide: "kiro", sourceModel: "Claude Haiku 4.5", targetModel: "ag/gemini-3.8-flash" },
  { ide: "kiro", sourceModel: "DeepSeek 3.2", targetModel: "xmtp/mimo-v2.6-pro" },
  { ide: "kiro", sourceModel: "MiniMax M2.1", targetModel: "xmtp/mimo-v2.6-flash" },
  { ide: "kiro", sourceModel: "GPT 5.6 Sol", targetModel: "ag/gemini-3.8-flash" },
  { ide: "kiro", sourceModel: "GPT 5.6 Terra", targetModel: "ag/gemini-3.8-flash" },
  { ide: "kiro", sourceModel: "GPT 5.6 Luna", targetModel: "ag/gemini-3.8-flash" },
  { ide: "kiro", sourceModel: "Qwen3 Coder Next", targetModel: "gh/gpt-5-mini" },
];

export const DEFAULT_ANTIGRAVITY_MAPPINGS: MitmMapping[] = [
  { ide: "antigravity", sourceModel: "Gemini 3.8 Flash (High)", targetModel: "gemini-3.8-flash" },
  { ide: "antigravity", sourceModel: "Gemini 3.8 Flash (Medium)", targetModel: "gemini-3.8-flash" },
  { ide: "antigravity", sourceModel: "Claude Sonnet 5.5 (Thinking)", targetModel: "claude-sonnet-5-5" },
  { ide: "antigravity", sourceModel: "Claude Opus 5.5 (Thinking)", targetModel: "claude-opus-5-5" },
];

export const DEFAULT_COPILOT_MAPPINGS: MitmMapping[] = [
  { ide: "copilot", sourceModel: "gpt-4o", targetModel: "cx/gpt-5.5" },
  { ide: "copilot", sourceModel: "claude-3.5-sonnet", targetModel: "ag/claude-sonnet-5-5" },
  { ide: "copilot", sourceModel: "claude-3.7-sonnet", targetModel: "ag/claude-sonnet-5-5" },
  { ide: "copilot", sourceModel: "o1", targetModel: "cx/o3-mini" },
];

export function getDefaultMappings(tool: string): MitmMapping[] {
  if (tool === "antigravity") return DEFAULT_ANTIGRAVITY_MAPPINGS;
  if (tool === "copilot") return DEFAULT_COPILOT_MAPPINGS;
  return DEFAULT_KIRO_MAPPINGS;
}

export class MitmRepository {
  public static getToolDnsStatus(tool: string): boolean {
    const db = getDatabase();
    const key = `mitm_dns_${tool.toLowerCase()}`;
    const row = db.get<any>("SELECT value FROM settings WHERE key = ?", key);
    if (!row) {
      return tool.toLowerCase() === "kiro";
    }
    return row.value === "true" || row.value === "1";
  }

  public static getAllToolDnsStatus(): Record<string, boolean> {
    const tools = ["antigravity", "kiro", "copilot"];
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

  public static getMappings(ide: string): MitmMapping[] {
    const db = getDatabase();
    const rows = db.all<any>("SELECT * FROM mitm_mappings WHERE ide = ?", ide);
    if (rows.length === 0) {
      const defaults = getDefaultMappings(ide);
      this.initDefaultMappings(ide, defaults);
      return defaults;
    }
    return rows.map((r) => ({
      ide: r.ide,
      sourceModel: r.source_model,
      targetModel: r.target_model,
    }));
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
    db.run("DELETE FROM mitm_mappings WHERE ide = ?", ide);
    const defaults = getDefaultMappings(ide);
    this.initDefaultMappings(ide, defaults);
    return defaults;
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
