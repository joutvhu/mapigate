import { getDatabase } from "../database.js";
import { getDefaultMappings as getMitmDefaultMappings } from "../../mitm/toolsHelper.js";
import { CLI_TOOLS } from "../../shared/constants/cliTools.js";
import { ComboRepository } from "./comboRepo.js";

export interface ToolMapping {
  toolId: string;
  sourceModel: string;
  targetModel: string;
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
      if (cliTool.defaultModels && cliTool.defaultModels.length > 0) {
        return cliTool.defaultModels.map((m) => {
          const modelName = typeof m === "string" ? m : m.alias || m.id;
          return {
            toolId: tid,
            sourceModel: modelName,
            targetModel: "",
          };
        });
      }
    }

    return [];
  }

  public static getMappings(toolId: string): ToolMapping[] {
    const tid = (toolId || "").toLowerCase();
    const db = getDatabase();
    const rows = db.all<any>("SELECT tool_id, source_model, target_model FROM tool_mappings WHERE tool_id = ?", tid);

    if (rows.length === 0) {
      const defaults = this.getDefaultMappings(tid);
      if (defaults.length > 0) {
        this.initDefaultMappings(tid, defaults);
        return this.sortMappingsCanonical(defaults);
      }
      return [];
    }

    const list: ToolMapping[] = rows.map((r) => ({
      toolId: r.tool_id,
      sourceModel: r.source_model,
      targetModel: r.target_model,
    }));
    return this.sortMappingsCanonical(list);
  }

  public static getAllMappings(): ToolMapping[] {
    const db = getDatabase();
    const rows = db.all<any>("SELECT tool_id, source_model, target_model FROM tool_mappings");
    return rows.map((r) => ({
      toolId: r.tool_id,
      sourceModel: r.source_model,
      targetModel: r.target_model,
    }));
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

  public static saveMapping(toolId: string, sourceModel: string, targetModel: string): void {
    const tid = (toolId || "").toLowerCase();
    const normalizedTarget = this.normalizeTargetModel(targetModel);
    const db = getDatabase();
    db.run(
      `INSERT INTO tool_mappings (tool_id, source_model, target_model)
       VALUES (?, ?, ?)
       ON CONFLICT(tool_id, source_model) DO UPDATE SET target_model = excluded.target_model`,
      tid,
      sourceModel,
      normalizedTarget
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

    // 2. Delete existing mappings
    db.run("DELETE FROM tool_mappings WHERE tool_id = ?", tid);
    try {
      db.run("DELETE FROM mitm_mappings WHERE ide = ?", tid);
    } catch {
      // ignore
    }

    // 3. Get defaults
    const defaults = this.getDefaultMappings(tid);
    const restoredMappings: ToolMapping[] = defaults.map((m) => ({
      toolId: tid,
      sourceModel: m.sourceModel,
      targetModel: existingTargetMap.get(m.sourceModel) || m.targetModel || "",
    }));

    // 4. Insert restored mappings
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

    return this.sortMappingsCanonical(restoredMappings);
  }

  public static getGlobalMappings(): ToolMapping[] {
    const db = getDatabase();
    const rows = db.all<any>(
      "SELECT tool_id, source_model, target_model FROM tool_mappings WHERE tool_id = 'global'"
    );

    const list: ToolMapping[] = rows.map((r) => ({
      toolId: "global",
      sourceModel: r.source_model,
      targetModel: r.target_model || "",
    }));
    return this.sortMappingsCanonical(list);
  }

  public static saveGlobalMapping(sourceModel: string, targetModel: string): void {
    this.saveMapping("global", sourceModel, targetModel);
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

  public static resetGlobalMappings(): ToolMapping[] {
    const db = getDatabase();
    db.run("DELETE FROM tool_mappings WHERE tool_id = 'global'");
    return this.getGlobalMappings();
  }

  public static resolveModelMapping(toolId: string, incomingModel?: string | null): string | null {
    if (!incomingModel) return null;
    const tid = (toolId || "").toLowerCase();
    const raw = incomingModel.trim();
    if (!raw) return null;

    const db = getDatabase();

    // 1. Check specific tool mapping in database
    if (tid && tid !== "global" && tid !== "unknown") {
      const toolRow = db.get<any>(
        "SELECT target_model FROM tool_mappings WHERE tool_id = ? AND LOWER(source_model) = LOWER(?) LIMIT 1",
        tid,
        raw
      );
      if (toolRow && toolRow.target_model && toolRow.target_model.trim().length > 0) {
        return toolRow.target_model.trim();
      }
    }

    // 2. Check Global mapping in database
    const globalRow = db.get<any>(
      "SELECT target_model FROM tool_mappings WHERE tool_id = 'global' AND LOWER(source_model) = LOWER(?) LIMIT 1",
      raw
    );
    if (globalRow) {
      if (globalRow.target_model && globalRow.target_model.trim().length > 0) {
        return globalRow.target_model.trim();
      }
      // Explicitly unmapped in global mappings
      return null;
    }

    // 3. Check any other tool mapping in database (universal fallback)
    const anyRow = db.get<any>(
      "SELECT target_model FROM tool_mappings WHERE LOWER(source_model) = LOWER(?) LIMIT 1",
      raw
    );
    if (anyRow && anyRow.target_model && anyRow.target_model.trim().length > 0) {
      return anyRow.target_model.trim();
    }

    return null;
  }
}
