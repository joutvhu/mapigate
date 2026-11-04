import { Router } from "express";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { CLI_TOOLS, getMapigateBaseUrl } from "../../shared/constants/cliTools.js";
import { DEFAULT_PORT } from "../../shared/constants/index.js";
import { serverLifecycle } from "../lifecycle.js";
import { checkBinaryInstalled } from "../../providers/core/base/baseProvider.js";
import { ToolMappingRepository } from "../../storage/repositories/toolMappingRepo.js";

export const cliToolsRouter = Router();

export interface ToolStatusResponse {
  id: string;
  name: string;
  installed: boolean;
  configured: boolean;
  status: "Connected" | "Guide" | "Not configured" | "Not installed";
  configPath?: string;
  settingsPath?: string;
  hasMapigate: boolean;
}

function resolveUserPath(p?: string): string | null {
  if (!p) return null;
  const home = os.homedir();
  if (p.startsWith("~/") || p.startsWith("~\\")) {
    return path.join(home, p.slice(2));
  }
  if (p.startsWith("~")) {
    return path.join(home, p.slice(1));
  }
  return p;
}

async function checkFileExists(filePath: string | null): Promise<boolean> {
  if (!filePath) return false;
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function inspectToolStatus(toolId: string): Promise<ToolStatusResponse> {
  const tool = CLI_TOOLS[toolId];
  if (!tool) {
    return {
      id: toolId,
      name: toolId,
      installed: false,
      configured: false,
      status: "Not installed",
      hasMapigate: false,
    };
  }

  const resolvedConfigPath = resolveUserPath(tool.configPath || tool.settingsFile);
  const binaryInstalled = await checkBinaryInstalled(tool.binary);
  const fileExists = await checkFileExists(resolvedConfigPath);
  const isInstalled = binaryInstalled || fileExists;

  let hasMapigate = false;
  let fileContent = "";

  if (fileExists && resolvedConfigPath) {
    try {
      fileContent = await fs.readFile(resolvedConfigPath, "utf-8");
      const runningPortStr = String(serverLifecycle.getPort());
      if (fileContent.includes(runningPortStr) || fileContent.includes(String(DEFAULT_PORT)) || fileContent.includes("20127") || fileContent.includes("mapigate")) {
        hasMapigate = true;
      }
    } catch {
      // ignore read error
    }
  }

  let status: ToolStatusResponse["status"] = "Not installed";
  if (hasMapigate) {
    status = "Connected";
  } else if (isInstalled) {
    if (tool.configType === "guide") {
      status = "Guide";
    } else {
      status = "Not configured";
    }
  } else {
    if (tool.configType === "guide") {
      status = "Guide";
    } else {
      status = "Not installed";
    }
  }

  return {
    id: tool.id,
    name: tool.name,
    installed: isInstalled,
    configured: hasMapigate,
    status,
    configPath: resolvedConfigPath || undefined,
    settingsPath: resolvedConfigPath || undefined,
    hasMapigate,
  };
}

// GET all tool statuses in parallel
cliToolsRouter.get("/status", async (_req, res) => {
  try {
    const keys = Object.keys(CLI_TOOLS);
    const statuses = await Promise.all(keys.map((k) => inspectToolStatus(k)));
    const map: Record<string, ToolStatusResponse> = {};
    for (const s of statuses) {
      map[s.id] = s;
    }
    res.json(map);
  } catch (error: any) {
    res.status(500).json({ error: error.message || "Failed to inspect CLI tool statuses" });
  }
});

cliToolsRouter.get("/all-statuses", async (_req, res) => {
  try {
    const keys = Object.keys(CLI_TOOLS);
    const statuses = await Promise.all(keys.map((k) => inspectToolStatus(k)));
    const map: Record<string, ToolStatusResponse> = {};
    for (const s of statuses) {
      map[s.id] = s;
    }
    res.json(map);
  } catch (error: any) {
    res.status(500).json({ error: error.message || "Failed to inspect CLI tool statuses" });
  }
});

// ==========================================
// Universal / Global Model Mappings API
// ==========================================

cliToolsRouter.get("/global-mappings", (_req, res) => {
  const mappings = ToolMappingRepository.getGlobalMappings();
  res.json(mappings);
});

cliToolsRouter.post("/global-mappings", (req, res) => {
  const { sourceModel, targetModel } = req.body;
  if (!sourceModel || !targetModel) {
    res.status(400).json({ error: "Missing sourceModel or targetModel" });
    return;
  }
  ToolMappingRepository.saveGlobalMapping(sourceModel, targetModel);
  res.json({ success: true, sourceModel, targetModel });
});

cliToolsRouter.delete("/global-mappings", (req, res) => {
  const sourceModel = (req.query.sourceModel as string) || req.body?.sourceModel;
  if (!sourceModel) {
    res.status(400).json({ error: "Missing sourceModel parameter" });
    return;
  }
  ToolMappingRepository.deleteGlobalMapping(sourceModel);
  res.json({ success: true, sourceModel });
});

cliToolsRouter.delete("/global-mappings/*", (req, res) => {
  const sourceModel = (req.params as any)[0] || (req.params as any).sourceModel;
  if (!sourceModel) {
    res.status(400).json({ error: "Missing sourceModel parameter" });
    return;
  }
  ToolMappingRepository.deleteGlobalMapping(sourceModel);
  res.json({ success: true, sourceModel });
});

cliToolsRouter.post("/global-mappings/import/:tool", (req, res) => {
  const { tool } = req.params;
  const mappings = ToolMappingRepository.importToolDefaultsToGlobal(tool);
  res.json({ success: true, tool, mappings });
});

cliToolsRouter.post("/global-mappings/reset", (_req, res) => {
  const mappings = ToolMappingRepository.resetGlobalMappings();
  res.json({ success: true, mappings });
});

// ==========================================
// Mappings API (Fixed-path routes must precede /:tool)
// ==========================================

cliToolsRouter.get("/mappings/:tool", (req, res) => {
  const { tool } = req.params;
  const mappings = ToolMappingRepository.getMappings(tool);
  res.json(mappings);
});

cliToolsRouter.post("/mappings", (req, res) => {
  const tool = req.body.tool || req.body.toolId || req.body.ide;
  const { sourceModel, targetModel } = req.body;
  if (!tool || !sourceModel || !targetModel) {
    res.status(400).json({ error: "Missing tool, sourceModel, or targetModel" });
    return;
  }
  ToolMappingRepository.saveMapping(tool, sourceModel, targetModel);
  res.json({ success: true, tool, sourceModel, targetModel });
});

cliToolsRouter.post("/mappings/reset", (req, res) => {
  const tool = req.body.tool || req.body.toolId || req.body.ide || "claude";
  const mappings = ToolMappingRepository.resetMappings(tool);
  res.json({ success: true, tool, mappings });
});

// GET specific tool status
cliToolsRouter.get("/:tool", async (req, res) => {
  const { tool } = req.params;
  try {
    const status = await inspectToolStatus(tool);
    res.json(status);
  } catch (error: any) {
    res.status(500).json({ error: error.message || "Failed to inspect tool status" });
  }
});

// POST apply Mapigate config for a tool
cliToolsRouter.post("/:tool/apply", async (req, res) => {
  const { tool: toolId } = req.params;
  const tool = CLI_TOOLS[toolId];
  if (!tool) {
    res.status(404).json({ error: `Tool ${toolId} not found` });
    return;
  }

  const targetPath = resolveUserPath(tool.configPath || tool.settingsFile);
  if (!targetPath) {
    res.status(400).json({ error: `Tool ${toolId} has no direct file configuration path` });
    return;
  }

  try {
    const dir = path.dirname(targetPath);
    await fs.mkdir(dir, { recursive: true });

    if (tool.id === "claude") {
      let currentSettings: any = {};
      try {
        const raw = await fs.readFile(targetPath, "utf-8");
        currentSettings = JSON.parse(raw.replace(/,(\s*[}\]])/g, "$1"));
      } catch {
        // fresh
      }
      const runningPort = serverLifecycle.getPort();
      if (!currentSettings.env) currentSettings.env = {};
      if (req.body?.apiKey) {
        currentSettings.env.ANTHROPIC_AUTH_TOKEN = req.body.apiKey;
      } else {
        currentSettings.env.ANTHROPIC_AUTH_TOKEN = "mapigate-local";
      }
      currentSettings.env.ANTHROPIC_BASE_URL = getMapigateBaseUrl(runningPort);
      currentSettings.env.ANTHROPIC_MODEL = req.body?.model || "claude-sonnet-4-6";
      await fs.writeFile(targetPath, JSON.stringify(currentSettings, null, 2), "utf-8");
    } else if (tool.configFileTemplate) {
      const runningPort = serverLifecycle.getPort();
      const renderedTemplate = tool.configFileTemplate
        .replace(new RegExp(`127\\.0\\.0\\.1:${DEFAULT_PORT}`, "g"), `127.0.0.1:${runningPort}`)
        .replace(new RegExp(`:${DEFAULT_PORT}`, "g"), `:${runningPort}`)
        .replace(/127\.0\.0\.1:20127/g, `127.0.0.1:${runningPort}`)
        .replace(/:20127/g, `:${runningPort}`);
      await fs.writeFile(targetPath, renderedTemplate, "utf-8");
    } else {
      res.status(400).json({ error: `No config template available for ${toolId}` });
      return;
    }

    const updatedStatus = await inspectToolStatus(toolId);
    res.json({ success: true, status: updatedStatus });
  } catch (err: any) {
    res.status(500).json({ error: err.message || "Failed to apply configuration" });
  }
});

// POST reset Mapigate config for a tool
cliToolsRouter.post("/:tool/reset", async (req, res) => {
  const { tool: toolId } = req.params;
  const tool = CLI_TOOLS[toolId];
  if (!tool) {
    res.status(404).json({ error: `Tool ${toolId} not found` });
    return;
  }

  const targetPath = resolveUserPath(tool.configPath || tool.settingsFile);
  if (!targetPath) {
    res.status(400).json({ error: `Tool ${toolId} has no file configuration path` });
    return;
  }

  try {
    if (tool.id === "claude") {
      try {
        const raw = await fs.readFile(targetPath, "utf-8");
        const currentSettings = JSON.parse(raw.replace(/,(\s*[}\]])/g, "$1"));
        if (currentSettings.env) {
          delete currentSettings.env.ANTHROPIC_BASE_URL;
          delete currentSettings.env.ANTHROPIC_AUTH_TOKEN;
          delete currentSettings.env.ANTHROPIC_MODEL;
        }
        await fs.writeFile(targetPath, JSON.stringify(currentSettings, null, 2), "utf-8");
      } catch {
        // ignore
      }
    } else {
      try {
        await fs.unlink(targetPath);
      } catch {
        // ignore
      }
    }

    const updatedStatus = await inspectToolStatus(toolId);
    res.json({ success: true, status: updatedStatus });
  } catch (err: any) {
    res.status(500).json({ error: err.message || "Failed to reset configuration" });
  }
});

// GET mappings for a tool
cliToolsRouter.get("/:tool/mappings", (req, res) => {
  const { tool } = req.params;
  const mappings = ToolMappingRepository.getMappings(tool);
  res.json(mappings);
});

// POST update mapping for a tool
cliToolsRouter.post("/:tool/mappings", (req, res) => {
  const { tool } = req.params;
  const { sourceModel, targetModel } = req.body;
  if (!sourceModel || !targetModel) {
    res.status(400).json({ error: "Missing sourceModel or targetModel" });
    return;
  }
  ToolMappingRepository.saveMapping(tool, sourceModel, targetModel);
  res.json({ success: true, tool, sourceModel, targetModel });
});

// POST reset tool mappings to defaults
cliToolsRouter.post("/:tool/mappings/reset", (req, res) => {
  const { tool } = req.params;
  const mappings = ToolMappingRepository.resetMappings(tool);
  res.json({ success: true, tool, mappings });
});

// DELETE tool mapping
cliToolsRouter.delete("/:tool/mappings", (req, res) => {
  const { tool } = req.params;
  const sourceModel = (req.query.sourceModel as string) || req.body?.sourceModel;
  if (!sourceModel) {
    res.status(400).json({ error: "Missing sourceModel parameter" });
    return;
  }
  ToolMappingRepository.deleteMapping(tool, sourceModel);
  res.json({ success: true, tool, sourceModel });
});

cliToolsRouter.delete("/:tool/mappings/*", (req, res) => {
  const { tool } = req.params;
  const sourceModel = (req.params as any)[0] || (req.params as any).sourceModel;
  if (!sourceModel) {
    res.status(400).json({ error: "Missing sourceModel parameter" });
    return;
  }
  ToolMappingRepository.deleteMapping(tool, sourceModel);
  res.json({ success: true, tool, sourceModel });
});


