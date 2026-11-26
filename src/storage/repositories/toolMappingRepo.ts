import { getDatabase } from "../database.js";
import { getDefaultMappings as getMitmDefaultMappings } from "../../mitm/toolsHelper.js";
import { CLI_TOOLS } from "../../shared/constants/cliTools.js";
import { ComboRepository } from "./comboRepo.js";
import { normalizeModelCompareKey } from "../../shared/utils/modelUtils.js";
import { inferMappingGroupName } from "../../core/router/mappingGrouping.js";

export { inferMappingGroupName };

export interface ToolMapping {
  toolId: string;
  sourceModel: string;
  targetModel: string;
  groupName?: string;
  isEnabled?: boolean;
  effortTargets?: Record<string, string>;
}

export interface SaveToolMappingOptions {
  groupName?: string | null;
  isEnabled?: boolean;
  effortTargets?: Record<string, string> | null;
}

export interface ModelMappingResolution {
  targetModel: string | null;
  ruleType: "tool" | "global" | "any" | "none";
  matchedToolId?: string;
  sourceModel?: string;
  matchedEffort?: string;
  groupName?: string;
}

function parseEffortTargets(raw: unknown): Record<string, string> | undefined {
  if (!raw) return undefined;
  let obj: unknown = raw;
  if (typeof raw === "string") {
    const trimmed = raw.trim();
    if (!trimmed) return undefined;
    try {
      obj = JSON.parse(trimmed);
    } catch {
      return undefined;
    }
  }
  if (!obj || typeof obj !== "object" || Array.isArray(obj)) return undefined;
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(obj)) {
    const key = String(k || "").trim().toLowerCase();
    const val = typeof v === "string" ? v.trim() : "";
    if (key && val) {
      out[key] = val;
    }
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

function serializeEffortTargets(raw?: Record<string, string> | null): string | null {
  const parsed = parseEffortTargets(raw);
  return parsed ? JSON.stringify(parsed) : null;
}

function rowToToolMapping(r: any, toolIdOverride?: string): ToolMapping {
  const effortTargets = parseEffortTargets(r.effort_targets);
  return {
    toolId: toolIdOverride || r.tool_id,
    sourceModel: r.source_model,
    targetModel: r.target_model || "",
    ...(r.group_name ? { groupName: r.group_name } : {}),
    isEnabled: r.is_enabled === null || r.is_enabled === undefined ? true : Number(r.is_enabled) !== 0,
    ...(effortTargets ? { effortTargets } : {}),
  };
}

export class ToolMappingRepository {
  public static sortMappingsCanonical(mappings: ToolMapping[]): ToolMapping[] {
    return [...mappings].sort((a, b) => {
      const isTopA = a.sourceModel.toLowerCase() === "auto" || a.sourceModel.toLowerCase() === "default";
      const isTopB = b.sourceModel.toLowerCase() === "auto" || b.sourceModel.toLowerCase() === "default";
      if (isTopA && !isTopB) return -1;
      if (!isTopA && isTopB) return 1;

      return a.sourceModel.localeCompare(b.sourceModel, undefined, {
        numeric: true,
        sensitivity: "base",
      });
    });
  }

  public static getDefaultMappings(toolId: string): ToolMapping[] {
    const tid = (toolId || "").toLowerCase();

    // 1. Check MITM tool defaults
    const mitmDefaults = getMitmDefaultMappings(tid);
    if (mitmDefaults && mitmDefaults.length > 0) {
      return mitmDefaults.map((m) => ({
        toolId: tid,
        sourceModel: m.sourceModel,
        targetModel: m.targetModel || "",
      }));
    }

    // 2. Check CLI / IDE tool definitions
    const cliTool = CLI_TOOLS[tid];
    if (cliTool) {
      const items: ToolMapping[] = [];
      const seen = new Set<string>();

      // Include model aliases first (e.g. default, sonnet, opus, fable, haiku for Claude Code)
      if (cliTool.modelAliases && cliTool.modelAliases.length > 0) {
        for (const a of cliTool.modelAliases) {
          if (a && !seen.has(a.toLowerCase())) {
            seen.add(a.toLowerCase());
            items.push({
              toolId: tid,
              sourceModel: a,
              targetModel: "",
            });
          }
        }
      }

      if (cliTool.defaultModels && cliTool.defaultModels.length > 0) {
        for (const m of cliTool.defaultModels) {
          const modelName = typeof m === "string" ? m : m.alias || m.id;
          if (modelName && !seen.has(modelName.toLowerCase())) {
            seen.add(modelName.toLowerCase());
            items.push({
              toolId: tid,
              sourceModel: modelName,
              targetModel: "",
            });
          }
        }
      }

      if (items.length > 0) {
        return items;
      }
    }

    return [];
  }

  public static getMappings(toolId: string): ToolMapping[] {
    const tid = (toolId || "").toLowerCase();
    const db = getDatabase();
    const rows = db.all<any>(
      "SELECT tool_id, source_model, target_model, group_name, is_enabled, effort_targets FROM tool_mappings WHERE tool_id = ?",
      tid
    );

    if (rows.length === 0) {
      const defaults = this.getDefaultMappings(tid);
      if (defaults.length > 0) {
        this.initDefaultMappings(tid, defaults);
        return this.sortMappingsCanonical(defaults);
      }
      return [];
    }

    const list: ToolMapping[] = rows.map((r) => rowToToolMapping(r));
    return this.sortMappingsCanonical(list);
  }

  public static getAllMappings(): ToolMapping[] {
    const db = getDatabase();
    const rows = db.all<any>(
      "SELECT tool_id, source_model, target_model, group_name, is_enabled, effort_targets FROM tool_mappings"
    );
    return rows.map((r) => rowToToolMapping(r));
  }

  public static initDefaultMappings(toolId: string, mappings: ToolMapping[]): void {
    const tid = (toolId || "").toLowerCase();
    const db = getDatabase();
    for (const m of mappings) {
      db.run(
        `INSERT OR IGNORE INTO tool_mappings (tool_id, source_model, target_model) VALUES (?, ?, ?)`,
        tid,
        m.sourceModel,
        m.targetModel
      );
    }
  }

  public static normalizeTargetModel(targetModel: string): string {
    const raw = (targetModel || "").trim();
    if (!raw) return "";
    if (raw.startsWith("combo/")) return raw;

    try {
      const allCombos = ComboRepository.getAllCombos();
      const isCombo = allCombos.some(
        (c) => c.isActive && c.name.toLowerCase() === raw.toLowerCase()
      );
      if (isCombo) {
        return `combo/${raw}`;
      }
    } catch {
      // ignore if database/combos not initialized
    }
    return raw;
  }

  public static saveMapping(
    toolId: string,
    sourceModel: string,
    targetModel: string,
    options?: SaveToolMappingOptions
  ): void {
    const tid = (toolId || "").toLowerCase();
    const normalizedTarget = this.normalizeTargetModel(targetModel);
    const db = getDatabase();

    const existing = db.get<any>(
      "SELECT group_name, is_enabled, effort_targets FROM tool_mappings WHERE tool_id = ? AND source_model = ?",
      tid,
      sourceModel
    );

    const groupName =
      options?.groupName !== undefined
        ? (typeof options.groupName === "string" ? options.groupName.trim() || null : null)
        : existing?.group_name ?? null;
    const isEnabledInt =
      options?.isEnabled !== undefined
        ? (options.isEnabled ? 1 : 0)
        : existing?.is_enabled ?? 1;

    let effortTargetsJson: string | null = existing?.effort_targets ?? null;
    if (options?.effortTargets !== undefined) {
      if (options.effortTargets === null) {
        effortTargetsJson = null;
      } else if (typeof options.effortTargets === "object" && !Array.isArray(options.effortTargets)) {
        const normalizedEfforts: Record<string, string> = {};
        for (const [k, v] of Object.entries(options.effortTargets)) {
          const key = String(k || "").trim().toLowerCase();
          if (typeof v !== "string") continue;
          const val = this.normalizeTargetModel(v);
          if (key && val) normalizedEfforts[key] = val;
        }
        effortTargetsJson = serializeEffortTargets(normalizedEfforts);
      }
    }

    db.run(
      `INSERT INTO tool_mappings (tool_id, source_model, target_model, group_name, is_enabled, effort_targets)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(tool_id, source_model) DO UPDATE SET
         target_model = excluded.target_model,
         group_name = excluded.group_name,
         is_enabled = excluded.is_enabled,
         effort_targets = excluded.effort_targets`,
      tid,
      sourceModel,
      normalizedTarget,
      groupName,
      isEnabledInt,
      effortTargetsJson
    );

    // Keep legacy mitm_mappings table synchronized
    try {
      db.run(
        `INSERT INTO mitm_mappings (ide, source_model, target_model)
         VALUES (?, ?, ?)
         ON CONFLICT(ide, source_model) DO UPDATE SET target_model = excluded.target_model`,
        tid,
        sourceModel,
        normalizedTarget
      );
    } catch {
      // ignore
    }
  }

  public static deleteMapping(toolId: string, sourceModel: string): void {
    const tid = (toolId || "").toLowerCase();
    const db = getDatabase();
    db.run("DELETE FROM tool_mappings WHERE tool_id = ? AND source_model = ?", tid, sourceModel);
    try {
      db.run("DELETE FROM mitm_mappings WHERE ide = ? AND source_model = ?", tid, sourceModel);
    } catch {
      // ignore
    }
  }

  public static resetMappings(toolId: string): ToolMapping[] {
    const tid = (toolId || "").toLowerCase();
    const db = getDatabase();

    // 1. Fetch current mappings to preserve existing non-empty user targets
    const currentRows = db.all<any>(
      "SELECT source_model, target_model FROM tool_mappings WHERE tool_id = ?",
      tid
    );
    const existingTargetMap = new Map<string, string>();
    for (const r of currentRows) {
      if (r.target_model && r.target_model.trim().length > 0) {
        existingTargetMap.set(r.source_model, r.target_model.trim());
      }
    }

    // 2. Get defaults before modifying tables
    const defaults = this.getDefaultMappings(tid);
    const restoredMappings: ToolMapping[] = defaults.map((m) => ({
      toolId: tid,
      sourceModel: m.sourceModel,
      targetModel: existingTargetMap.get(m.sourceModel) || m.targetModel || "",
    }));

    // 3. Delete existing mappings and insert restored mappings inside a transaction
    db.exec("BEGIN TRANSACTION;");
    try {
      db.run("DELETE FROM tool_mappings WHERE tool_id = ?", tid);
      try {
        db.run("DELETE FROM mitm_mappings WHERE ide = ?", tid);
      } catch {
        // ignore
      }

      for (const m of restoredMappings) {
        db.run(
          "INSERT INTO tool_mappings (tool_id, source_model, target_model) VALUES (?, ?, ?)",
          m.toolId,
          m.sourceModel,
          m.targetModel
        );
        try {
          db.run(
            "INSERT INTO mitm_mappings (ide, source_model, target_model) VALUES (?, ?, ?)",
            m.toolId,
            m.sourceModel,
            m.targetModel
          );
        } catch {
          // ignore
        }
      }
      db.exec("COMMIT;");
    } catch (err) {
      try {
        db.exec("ROLLBACK;");
      } catch {}
      throw err;
    }

    return this.sortMappingsCanonical(restoredMappings);
  }

  public static getGlobalMappings(): ToolMapping[] {
    const db = getDatabase();
    const rows = db.all<any>(
      "SELECT tool_id, source_model, target_model, group_name, is_enabled, effort_targets FROM tool_mappings WHERE tool_id = 'global'"
    );

    const list: ToolMapping[] = rows.map((r) => rowToToolMapping(r, "global"));
    return this.sortMappingsCanonical(list);
  }

  public static saveGlobalMapping(
    sourceModel: string,
    targetModel: string,
    options?: SaveToolMappingOptions
  ): void {
    this.saveMapping("global", sourceModel, targetModel, options);
  }

  public static toggleMappingEnabled(toolId: string, sourceModel: string, isEnabled: boolean): void {
    const tid = (toolId || "").toLowerCase();
    const db = getDatabase();
    db.run(
      "UPDATE tool_mappings SET is_enabled = ? WHERE tool_id = ? AND source_model = ?",
      isEnabled ? 1 : 0,
      tid,
      sourceModel
    );
  }

  public static toggleGroupEnabled(toolId: string, groupName: string, isEnabled: boolean): void {
    const tid = (toolId || "").toLowerCase();
    const db = getDatabase();
    const trimmed = groupName.trim();
    if (!trimmed || trimmed.toLowerCase() === "ungrouped") {
      db.run(
        "UPDATE tool_mappings SET is_enabled = ? WHERE tool_id = ? AND (group_name IS NULL OR TRIM(group_name) = '' OR LOWER(TRIM(group_name)) = 'ungrouped')",
        isEnabled ? 1 : 0,
        tid
      );
      return;
    }
    db.run(
      "UPDATE tool_mappings SET is_enabled = ? WHERE tool_id = ? AND LOWER(TRIM(group_name)) = LOWER(?)",
      isEnabled ? 1 : 0,
      tid,
      trimmed
    );
  }

  public static autoGroupMappings(toolId: string = "global"): ToolMapping[] {
    const tid = (toolId || "").toLowerCase();
    const db = getDatabase();
    const rows = db.all<any>(
      "SELECT source_model, group_name FROM tool_mappings WHERE tool_id = ?",
      tid
    );
    db.exec("BEGIN TRANSACTION;");
    try {
      for (const r of rows) {
        if (!r.group_name || !String(r.group_name).trim()) {
          const inferred = inferMappingGroupName(r.source_model);
          db.run(
            "UPDATE tool_mappings SET group_name = ? WHERE tool_id = ? AND source_model = ?",
            inferred,
            tid,
            r.source_model
          );
        }
      }
      db.exec("COMMIT;");
    } catch (err) {
      try {
        db.exec("ROLLBACK;");
      } catch {}
      throw err;
    }
    return tid === "global" ? this.getGlobalMappings() : this.getMappings(tid);
  }

  public static setGroupForMappings(
    toolId: string,
    sourceModels: string[],
    groupName: string | null
  ): ToolMapping[] {
    const tid = (toolId || "").toLowerCase();
    const db = getDatabase();
    const normalizedGroup = typeof groupName === "string" ? groupName.trim() || null : null;

    db.exec("BEGIN TRANSACTION;");
    try {
      for (const sm of sourceModels) {
        const clean = typeof sm === "string" ? sm.trim() : "";
        if (!clean) continue;
        db.run(
          "UPDATE tool_mappings SET group_name = ? WHERE tool_id = ? AND source_model = ?",
          normalizedGroup,
          tid,
          clean
        );
      }
      db.exec("COMMIT;");
    } catch (err) {
      try {
        db.exec("ROLLBACK;");
      } catch {}
      throw err;
    }

    return tid === "global" ? this.getGlobalMappings() : this.getMappings(tid);
  }

  public static deleteGlobalMapping(sourceModel: string): void {
    this.deleteMapping("global", sourceModel);
  }

  public static importToolDefaultsToGlobal(toolId: string): ToolMapping[] {
    const tid = (toolId || "").toLowerCase();
    const db = getDatabase();

    // 1. Get existing global mappings to preserve user-assigned targets
    const existingRows = db.all<any>(
      "SELECT source_model, target_model FROM tool_mappings WHERE tool_id = 'global'"
    );
    const existingMap = new Map<string, string>();
    for (const r of existingRows) {
      existingMap.set(r.source_model.toLowerCase(), r.target_model || "");
    }

    // 2. Collect all alias / model names for this tool
    const aliases = new Set<string>();
    const cliTool = CLI_TOOLS[tid];
    if (cliTool) {
      for (const m of cliTool.defaultModels || []) {
        const modelName = typeof m === "string" ? m : m.alias || m.id;
        if (modelName) aliases.add(modelName);
      }
      for (const a of cliTool.modelAliases || []) {
        if (a) aliases.add(a);
      }
    }

    const mitmDefaults = getMitmDefaultMappings(tid);
    for (const m of mitmDefaults) {
      if (m.sourceModel) aliases.add(m.sourceModel);
    }

    // 3. For each alias: if already exists, keep user's target; otherwise add with target = "" (empty for user to choose)
    for (const alias of aliases) {
      const lower = alias.toLowerCase();
      if (!existingMap.has(lower)) {
        db.run(
          `INSERT INTO tool_mappings (tool_id, source_model, target_model) VALUES ('global', ?, '')
           ON CONFLICT(tool_id, source_model) DO NOTHING`,
          alias
        );
      }
    }

    return this.getGlobalMappings();
  }

  public static importCombosToGlobal(): ToolMapping[] {
    const db = getDatabase();
    const combos = ComboRepository.getAllCombos();
    const existingRows = db.all<any>(
      "SELECT source_model, target_model FROM tool_mappings WHERE tool_id = 'global'"
    );
    const existingMap = new Map<string, string>();
    for (const r of existingRows) {
      existingMap.set(r.source_model.toLowerCase(), r.target_model || "");
    }

    for (const c of combos) {
      if (!c.isActive) continue;
      const name = c.name;
      const lower = name.toLowerCase();
      // If already exists in global mapping, preserve user's target; otherwise set to combo/<name>
      if (!existingMap.has(lower)) {
        const targetModel = `combo/${name}`;
        db.run(
          `INSERT INTO tool_mappings (tool_id, source_model, target_model) VALUES ('global', ?, ?)
           ON CONFLICT(tool_id, source_model) DO NOTHING`,
          name,
          targetModel
        );
      }
    }

    return this.getGlobalMappings();
  }

  public static resetGlobalMappings(): ToolMapping[] {
    const db = getDatabase();
    db.run("DELETE FROM tool_mappings WHERE tool_id = 'global'");
    return this.getGlobalMappings();
  }

  private static matchMappingRows(
    rows: Array<{
      tool_id?: string;
      source_model: string;
      target_model: string;
      group_name?: string | null;
      is_enabled?: number | null;
      effort_targets?: string | null;
    }>,
    raw: string,
    tid?: string,
    normalizedEffort?: string
  ): {
    matched: boolean;
    isDisabled?: boolean;
    targetModel: string | null;
    sourceModel?: string;
    toolId?: string;
    matchedEffort?: string;
    groupName?: string;
  } {
    if (rows.length === 0) return { matched: false, targetModel: null };

    const rawLower = raw.toLowerCase();
    const compareKey = normalizeModelCompareKey(raw);

    const slash = raw.indexOf("/");
    const rawStripped = slash !== -1 ? raw.slice(slash + 1).trim() : null;
    const strippedCompareKey = rawStripped ? normalizeModelCompareKey(rawStripped) : null;
    const rawPrefix = slash !== -1 ? raw.slice(0, slash).trim().toLowerCase() : null;

    // Check if caller explicitly specifies an account tag e.g. "antigravity[pro]/model"
    const hasExplicitTag = Boolean(rawPrefix && /\[[^[\]]+\]/.test(rawPrefix));
    const isGenericWrapper =
      rawPrefix === "mapigate" ||
      rawPrefix === "gateway" ||
      (Boolean(rawPrefix) && rawPrefix === (tid || "").toLowerCase());

    const resolveRowTarget = (r: {
      tool_id?: string;
      source_model: string;
      target_model: string;
      group_name?: string | null;
      is_enabled?: number | null;
      effort_targets?: string | null;
    }) => {
      const isEnabled =
        r.is_enabled === null || r.is_enabled === undefined ? true : Number(r.is_enabled) !== 0;
      const groupName = r.group_name ? String(r.group_name) : undefined;
      if (!isEnabled) {
        return {
          matched: true,
          isDisabled: true,
          targetModel: null,
          sourceModel: r.source_model,
          toolId: r.tool_id,
          groupName,
        };
      }

      const effortTargets = parseEffortTargets(r.effort_targets);
      if (normalizedEffort && effortTargets && effortTargets[normalizedEffort]) {
        return {
          matched: true,
          targetModel: effortTargets[normalizedEffort],
          sourceModel: r.source_model,
          toolId: r.tool_id,
          matchedEffort: normalizedEffort,
          groupName,
        };
      }

      const target = r.target_model && r.target_model.trim().length > 0 ? r.target_model.trim() : null;
      return {
        matched: true,
        targetModel: target,
        sourceModel: r.source_model,
        toolId: r.tool_id,
        groupName,
      };
    };

    // 1. Exact case-insensitive match (always respects explicit tagged/provider input)
    for (const r of rows) {
      if (r.source_model.toLowerCase() === rawLower) {
        return resolveRowTarget(r);
      }
    }

    // 2. Dot/dash normalized match
    for (const r of rows) {
      if (normalizeModelCompareKey(r.source_model) === compareKey) {
        return resolveRowTarget(r);
      }
    }

    // 3. Vendor stripped matching
    // Never strip vendor if the caller explicitly specified an account tag like "antigravity[pro]/..."
    // We only strip when it's a generic gateway wrapper ("mapigate", "gateway") or matches the calling toolId.
    if (rawStripped && strippedCompareKey && !hasExplicitTag && isGenericWrapper) {
      for (const r of rows) {
        const rSlash = r.source_model.indexOf("/");
        const rStripped = rSlash !== -1 ? r.source_model.slice(rSlash + 1).trim() : r.source_model;
        if (
          normalizeModelCompareKey(r.source_model) === strippedCompareKey ||
          normalizeModelCompareKey(rStripped) === strippedCompareKey
        ) {
          return resolveRowTarget(r);
        }
      }
    }

    // 4. Wildcard matching (e.g. "claude-3-7-sonnet*" matches "claude-3-7-sonnet-20250219")
    if (!hasExplicitTag) {
      for (const r of rows) {
        if (r.source_model.includes("*")) {
          const regexStr = "^" + r.source_model.toLowerCase().replace(/[-/\\^$+?.()|[\]{}]/g, "\\$&").replace(/\*/g, ".*") + "$";
          const re = new RegExp(regexStr);
          if (re.test(rawLower)) {
            return resolveRowTarget(r);
          }
          if (isGenericWrapper && rawStripped && re.test(rawStripped.toLowerCase())) {
            return resolveRowTarget(r);
          }
        }
      }
    }

    return { matched: false, targetModel: null };
  }

  public static resolveModelMappingDetailed(
    toolId: string,
    incomingModel?: string | null,
    clientEffort?: string | null
  ): ModelMappingResolution {
    if (!incomingModel) return { targetModel: null, ruleType: "none" };
    const tid = (toolId || "").toLowerCase();
    const raw = incomingModel.trim();
    if (!raw) return { targetModel: null, ruleType: "none" };
    const normalizedEffort = (clientEffort || "").trim().toLowerCase() || undefined;

    const db = getDatabase();
    const selectCols = "tool_id, source_model, target_model, group_name, is_enabled, effort_targets";

    // 1. Check specific tool mapping in database if specified
    if (tid && tid !== "global" && tid !== "unknown") {
      const toolRows = db.all<any>(
        `SELECT ${selectCols} FROM tool_mappings WHERE tool_id = ?`,
        tid
      );
      const match = this.matchMappingRows(toolRows, raw, tid, normalizedEffort);
      if (match.matched && match.isDisabled) {
        return {
          targetModel: null,
          ruleType: "tool",
          matchedToolId: tid,
          sourceModel: match.sourceModel,
          ...(match.groupName ? { groupName: match.groupName } : {}),
        };
      }
      if (match.matched && match.targetModel) {
        return {
          targetModel: match.targetModel,
          ruleType: "tool",
          matchedToolId: tid,
          sourceModel: match.sourceModel,
          ...(match.matchedEffort ? { matchedEffort: match.matchedEffort } : {}),
          ...(match.groupName ? { groupName: match.groupName } : {}),
        };
      }
      // If tool row matched but targetModel is empty, fall through to global!
    }

    // 2. Check Global Universal mapping in database (High priority fallback for all tools)
    const globalRows = db.all<any>(
      `SELECT ${selectCols} FROM tool_mappings WHERE tool_id = 'global'`
    );
    const globalMatch = this.matchMappingRows(globalRows, raw, tid, normalizedEffort);
    if (globalMatch.matched) {
      if (!globalMatch.isDisabled && globalMatch.targetModel) {
        return {
          targetModel: globalMatch.targetModel,
          ruleType: "global",
          matchedToolId: "global",
          sourceModel: globalMatch.sourceModel,
          ...(globalMatch.matchedEffort ? { matchedEffort: globalMatch.matchedEffort } : {}),
          ...(globalMatch.groupName ? { groupName: globalMatch.groupName } : {}),
        };
      }
      // Disabled or explicitly unmapped in global mappings -> do NOT fall back to other random tools!
      return {
        targetModel: null,
        ruleType: "global",
        matchedToolId: "global",
        sourceModel: globalMatch.sourceModel,
        ...(globalMatch.groupName ? { groupName: globalMatch.groupName } : {}),
      };
    }

    // 3. Fallback: check any other tool mapping in database only when tool is unknown/unspecified
    if (!tid || tid === "unknown") {
      const allRows = db.all<any>(
        `SELECT ${selectCols} FROM tool_mappings WHERE tool_id != 'global' AND COALESCE(is_enabled, 1) != 0`
      );
      const anyMatch = this.matchMappingRows(allRows, raw, tid, normalizedEffort);
      if (anyMatch.matched && !anyMatch.isDisabled && anyMatch.targetModel) {
        return {
          targetModel: anyMatch.targetModel,
          ruleType: "any",
          matchedToolId: anyMatch.toolId,
          sourceModel: anyMatch.sourceModel,
          ...(anyMatch.matchedEffort ? { matchedEffort: anyMatch.matchedEffort } : {}),
          ...(anyMatch.groupName ? { groupName: anyMatch.groupName } : {}),
        };
      }
    }

    return { targetModel: null, ruleType: "none" };
  }

  public static resolveModelMapping(
    toolId: string,
    incomingModel?: string | null,
    clientEffort?: string | null
  ): string | null {
    return this.resolveModelMappingDetailed(toolId, incomingModel, clientEffort).targetModel;
  }
}
