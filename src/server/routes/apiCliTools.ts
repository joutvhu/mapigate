import { Router } from "express";
import { exec } from "node:child_process";
import { promisify } from "node:util";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { CLI_TOOLS, MAPIGATE_BASE_URL, ROUTEN_BASE_URL } from "../../shared/constants/cliTools.js";

const execAsync = promisify(exec);
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
  hasRouten: boolean;
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

async function checkBinaryInstalled(binary?: string): Promise<boolean> {
  if (!binary) return false;
  try {
    const isWindows = process.platform === "win32";
    const command = isWindows ? `where ${binary}` : `which ${binary}`;
    const env = isWindows
      ? { ...process.env, PATH: `${process.env.APPDATA}\\npm;${process.env.PATH}` }
      : process.env;
    await execAsync(command, { windowsHide: true, env });
    return true;
  } catch {
    return false;
  }
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
      hasRouten: false,
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
      if (fileContent.includes("20127") || fileContent.includes("mapigate") || fileContent.includes("routen")) {
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
    hasRouten: hasMapigate,
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

// POST apply Routen config for a tool
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
      if (!currentSettings.env) currentSettings.env = {};
      currentSettings.env.ANTHROPIC_BASE_URL = MAPIGATE_BASE_URL;
      currentSettings.env.ANTHROPIC_MODEL = req.body?.model || "claude-sonnet-4-6";
      await fs.writeFile(targetPath, JSON.stringify(currentSettings, null, 2), "utf-8");
    } else if (tool.configFileTemplate) {
      await fs.writeFile(targetPath, tool.configFileTemplate, "utf-8");
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

// POST reset Routen config for a tool
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
