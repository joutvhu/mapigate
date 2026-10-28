import { getDatabase } from "../database.js";
import { getDefaultMappings as getMitmDefaultMappings } from "../../mitm/toolsHelper.js";
import { CLI_TOOLS } from "../../shared/constants/cliTools.js";

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
      if (cliTool.defaultMappings && cliTool.defaultMappings.length > 0) {
        return cliTool.defaultMappings.map((m) => ({
          toolId: tid,
          sourceModel: m.sourceModel,
          targetModel: m.targetModel || "",
        }));
      }

      if (cliTool.defaultModels && cliTool.defaultModels.length > 0) {
        return cliTool.defaultModels.map((m) => ({
          toolId: tid,
          sourceModel: m.alias || m.id,
          targetModel: m.defaultValue || "",
        }));
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

  public static saveMapping(toolId: string, sourceModel: string, targetModel: string): void {
    const tid = (toolId || "").toLowerCase();
    const db = getDatabase();
    db.run(
      `INSERT INTO tool_mappings (tool_id, source_model, target_model)
       VALUES (?, ?, ?)
       ON CONFLICT(tool_id, source_model) DO UPDATE SET target_model = excluded.target_model`,
      tid,
      sourceModel,
      targetModel
    );

    // Keep legacy mitm_mappings table synchronized
    try {
      db.run(
        `INSERT INTO mitm_mappings (ide, source_model, target_model)
         VALUES (?, ?, ?)
         ON CONFLICT(ide, source_model) DO UPDATE SET target_model = excluded.target_model`,
        tid,
        sourceModel,
        targetModel
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

    if (rows.length === 0) {
      // Auto-initialize standard global presets on first use (Claude + Cursor)
      this.importToolDefaultsToGlobal("claude");
      this.importToolDefaultsToGlobal("cursor");
      const seeded = db.all<any>(
        "SELECT tool_id, source_model, target_model FROM tool_mappings WHERE tool_id = 'global'"
      );
      return this.sortMappingsCanonical(
        seeded.map((r) => ({
          toolId: "global",
          sourceModel: r.source_model,
          targetModel: r.target_model,
        }))
      );
    }

    const list: ToolMapping[] = rows.map((r) => ({
      toolId: "global",
      sourceModel: r.source_model,
      targetModel: r.target_model,
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
    const defaults = this.getDefaultMappings(toolId);
    for (const d of defaults) {
      if (d.sourceModel && d.targetModel) {
        this.saveGlobalMapping(d.sourceModel, d.targetModel);
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
    if (globalRow && globalRow.target_model && globalRow.target_model.trim().length > 0) {
      return globalRow.target_model.trim();
    }

    // 3. Check any other tool mapping in database (universal fallback)
    const anyRow = db.get<any>(
      "SELECT target_model FROM tool_mappings WHERE LOWER(source_model) = LOWER(?) LIMIT 1",
      raw
    );
    if (anyRow && anyRow.target_model && anyRow.target_model.trim().length > 0) {
      return anyRow.target_model.trim();
    }

    // 4. Fallback to default mappings
    if (tid && tid !== "global" && tid !== "unknown") {
      const defaults = this.getDefaultMappings(tid);
      const found = defaults.find((d) => d.sourceModel.toLowerCase() === raw.toLowerCase());
      if (found && found.targetModel && found.targetModel.trim().length > 0) {
        return found.targetModel.trim();
      }
    }

    const claudeDefaults = this.getDefaultMappings("claude");
    const claudeFound = claudeDefaults.find((d) => d.sourceModel.toLowerCase() === raw.toLowerCase());
    if (claudeFound && claudeFound.targetModel && claudeFound.targetModel.trim().length > 0) {
      return claudeFound.targetModel.trim();
    }

    const cursorDefaults = this.getDefaultMappings("cursor");
    const cursorFound = cursorDefaults.find((d) => d.sourceModel.toLowerCase() === raw.toLowerCase());
    if (cursorFound && cursorFound.targetModel && cursorFound.targetModel.trim().length > 0) {
      return cursorFound.targetModel.trim();
    }

    return null;
  }
}
