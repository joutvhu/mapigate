import { getDatabase } from "../database.js";
import {
  MITM_TOOLS,
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
import { ToolMappingRepository } from "./toolMappingRepo.js";
import { CryptoVault } from "../crypto/vault.js";

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
    const sorted = ToolMappingRepository.sortMappingsCanonical(
      mappings.map((m) => ({ toolId: ide, sourceModel: m.sourceModel, targetModel: m.targetModel }))
    );
    return sorted.map((s) => ({ ide: s.toolId, sourceModel: s.sourceModel, targetModel: s.targetModel }));
  }

  public static getMappings(ide: string): MitmMapping[] {
    const list = ToolMappingRepository.getMappings(ide);
    return list.map((m) => ({ ide: m.toolId, sourceModel: m.sourceModel, targetModel: m.targetModel }));
  }

  public static initDefaultMappings(ide: string, mappings: MitmMapping[]): void {
    ToolMappingRepository.initDefaultMappings(
      ide,
      mappings.map((m) => ({ toolId: ide, sourceModel: m.sourceModel, targetModel: m.targetModel }))
    );
  }

  public static resetMappings(ide: string): MitmMapping[] {
    const restored = ToolMappingRepository.resetMappings(ide);
    return restored.map((m) => ({ ide: m.toolId, sourceModel: m.sourceModel, targetModel: m.targetModel }));
  }

  public static updateMapping(ide: string, sourceModel: string, targetModel: string): void {
    ToolMappingRepository.saveMapping(ide, sourceModel, targetModel);
  }

  public static deleteMapping(ide: string, sourceModel: string): void {
    ToolMappingRepository.deleteMapping(ide, sourceModel);
  }

  public static getRouterTarget(): { baseUrl: string; apiKey?: string; isRemote: boolean } {
    const db = getDatabase();
    let url = "";
    let apiKey = "";

    try {
      const urlRow = db.get<{ value?: string }>("SELECT value FROM settings WHERE key = 'mitm_router_base_url'");
      if (urlRow?.value) {
        url = urlRow.value.trim().replace(/\/+$/, "");
      }
    } catch {}

    try {
      const keyRow = db.get<{ value?: string }>("SELECT value FROM settings WHERE key = 'mitm_router_api_key'");
      if (keyRow?.value) {
        apiKey = CryptoVault.decrypt(keyRow.value) || "";
      }
    } catch {}

    const isRemote = Boolean(url && !url.includes("127.0.0.1") && !url.includes("localhost") && !url.includes("0.0.0.0"));
    return {
      baseUrl: url,
      apiKey: apiKey || undefined,
      isRemote,
    };
  }

  public static setRouterTarget(target: { baseUrl?: string; apiKey?: string | null }): void {
    const db = getDatabase();

    if (target.baseUrl !== undefined) {
      const cleanUrl = (target.baseUrl || "").trim().replace(/\/+$/, "");
      db.run(
        `INSERT INTO settings (key, value) VALUES ('mitm_router_base_url', ?)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
        cleanUrl
      );
    }

    if (target.apiKey !== undefined) {
      if (target.apiKey === null || target.apiKey === "") {
        db.run("DELETE FROM settings WHERE key = 'mitm_router_api_key'");
      } else {
        const encrypted = CryptoVault.encrypt(target.apiKey.trim());
        db.run(
          `INSERT INTO settings (key, value) VALUES ('mitm_router_api_key', ?)
           ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
          encrypted
        );
      }
    }
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
