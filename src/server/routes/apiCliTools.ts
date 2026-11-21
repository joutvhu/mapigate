import { Router } from "express";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { CLI_TOOLS, getMapigateBaseUrl } from "../../shared/constants/cliTools.js";
import { CliToolRegistry } from "../../cli/tools/index.js";
import { DEFAULT_PORT } from "../../shared/constants/index.js";
import { serverLifecycle } from "../lifecycle.js";
import { checkBinaryInstalled } from "../../providers/core/base/baseProvider.js";
import { ToolMappingRepository } from "../../storage/repositories/toolMappingRepo.js";
import { SettingsRepository, type ModelExposureMode } from "../../storage/repositories/settingsRepo.js";
import { ComboRepository } from "../../storage/repositories/comboRepo.js";
import { ProviderRepository } from "../../storage/repositories/providerRepo.js";
import { resolveTargetModelAndProvider } from "../proxy/executorHelpers.js";
import { PROVIDER_REGISTRY, getRegistryProvider } from "../../shared/constants/providerRegistry.js";
import { normalizeModelCompareKey } from "../../shared/utils/modelUtils.js";

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
      if (fileContent.includes(runningPortStr) || fileContent.includes(String(DEFAULT_PORT)) || fileContent.includes("mapigate")) {
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

cliToolsRouter.post("/global-mappings/import-combos", (_req, res) => {
  const mappings = ToolMappingRepository.importCombosToGlobal();
  res.json({ success: true, mappings });
});

cliToolsRouter.post("/global-mappings/reset", (_req, res) => {
  const mappings = ToolMappingRepository.resetGlobalMappings();
  res.json({ success: true, mappings });
});

cliToolsRouter.get("/exposure-mode", (_req, res) => {
  const mode = SettingsRepository.getModelExposureMode();
  res.json({ mode });
});

cliToolsRouter.post("/exposure-mode", (req, res) => {
  const mode = req.body?.mode as ModelExposureMode;
  if (!mode || !["all", "connected", "mapped_only"].includes(mode)) {
    res.status(400).json({ error: "Invalid mode. Must be 'all', 'connected', or 'mapped_only'." });
    return;
  }
  SettingsRepository.setModelExposureMode(mode);
  res.json({ success: true, mode });
});

cliToolsRouter.post("/simulate", (req, res) => {
  const model = (req.body?.model || "").trim();
  const toolId = (req.body?.toolId || "").trim().toLowerCase();
  if (!model) {
    res.status(400).json({ error: "Model is required" });
    return;
  }

  // 1. Resolve mapping
  const detailed = ToolMappingRepository.resolveModelMappingDetailed(toolId || "global", model);
  const mapped = detailed.targetModel;
  const ruleType = detailed.ruleType;

  const effectiveModel = mapped || model;

  // 2. Resolve Combo or Model
  const allCombos = ComboRepository.getAllCombos();
  const comboLookup = effectiveModel.startsWith("combo/") ? effectiveModel.slice(6) : effectiveModel;
  const isComboCandidate = !effectiveModel.includes("/") || effectiveModel.startsWith("combo/");
  const activeCombo = isComboCandidate
    ? allCombos.find(
        (c) =>
          c.isActive &&
          (c.name.toLowerCase() === comboLookup.toLowerCase() || c.id.toLowerCase() === comboLookup.toLowerCase())
      )
    : undefined;

  if (activeCombo) {
    const candidateModels = [...activeCombo.models];
    const initialCandidate = candidateModels[0] || effectiveModel;
    const initialResolved = resolveTargetModelAndProvider(initialCandidate);
    const pId = initialResolved.providerId || "unknown";
    const accounts = ProviderRepository.getAccountsByProvider(pId);
    const activeAccounts = accounts.filter((a) => a.isActive);

    res.json({
      incomingModel: model,
      effectiveModel,
      isCombo: true,
      comboName: activeCombo.name,
      comboModels: candidateModels,
      matchedRule: ruleType,
      targetProviderId: pId,
      targetModel: initialResolved.targetModel,
      hasActiveAccount: activeAccounts.length > 0,
      activeAccountsCount: activeAccounts.length,
    });
    return;
  }

  // Single model resolution
  const resolved = resolveTargetModelAndProvider(effectiveModel);
  const pId = resolved.providerId || "unknown";
  const accounts = ProviderRepository.getAccountsByProvider(pId);
  let activeAccounts = accounts.filter((a) => a.isActive);

  if (resolved.targetTag) {
    const tagLower = resolved.targetTag.toLowerCase();
    activeAccounts = activeAccounts.filter(
      (a) => (a.tag || a.providerSpecificData?.tag)?.trim().toLowerCase() === tagLower
    );
  }

  const reg = PROVIDER_REGISTRY[pId] || getRegistryProvider(pId);
  const dbProv = ProviderRepository.getProviderById(pId);
  const allModelList: any[] = [
    ...(Array.isArray(dbProv?.models) ? dbProv!.models : []),
    ...(Array.isArray(reg?.models) ? reg!.models : []),
  ];
  const targetCompareKey = normalizeModelCompareKey(resolved.targetModel);
  const isModelRecognized = allModelList.some((m: any) => {
    const id = typeof m === "string" ? m : m?.id;
    return (
      id &&
      (id.toLowerCase() === resolved.targetModel.toLowerCase() ||
        normalizeModelCompareKey(id) === targetCompareKey)
    );
  });

  const displayProvider = resolved.targetTag ? `${pId}[${resolved.targetTag}]` : pId;

  res.json({
    incomingModel: model,
    effectiveModel,
    isCombo: false,
    matchedRule: ruleType,
    targetProviderId: displayProvider,
    targetModel: resolved.targetModel,
    targetTag: resolved.targetTag,
    isModelRecognized,
    isFallback: !mapped && !isModelRecognized,
    hasActiveAccount: activeAccounts.length > 0,
    activeAccountsCount: activeAccounts.length,
  });
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

  try {
    const handler = CliToolRegistry.get(toolId);
    if (handler) {
      await handler.apply({
        baseUrl: getMapigateBaseUrl(serverLifecycle.getPort()),
        apiKey: req.body?.apiKey || "mapigate-local",
        model: req.body?.model || tool.defaultModels?.[0] || "claude-sonnet-4-6",
      });
      const updatedStatus = await inspectToolStatus(toolId);
      res.json({ success: true, status: updatedStatus });
      return;
    }

    const targetPath = resolveUserPath(tool.configPath || tool.settingsFile);
    if (!targetPath) {
      res.status(400).json({ error: `Tool ${toolId} has no direct file configuration path` });
      return;
    }

    const dir = path.dirname(targetPath);
    await fs.mkdir(dir, { recursive: true });

    if (tool.configFileTemplate) {
      const backupPath = `${targetPath}.bak-mapigate`;
      if ((await checkFileExists(targetPath)) && !(await checkFileExists(backupPath))) {
        try {
          await fs.copyFile(targetPath, backupPath);
        } catch {
          // ignore backup error
        }
      }
      const runningPort = serverLifecycle.getPort();
      const effectiveApiKey =
        typeof req.body?.apiKey === "string" && req.body.apiKey.trim()
          ? req.body.apiKey.trim()
          : "mapigate-local";
      const renderedTemplate = tool.configFileTemplate
        .replace(new RegExp(`127\\.0\\.0\\.1:${DEFAULT_PORT}`, "g"), `127.0.0.1:${runningPort}`)
        .replace(new RegExp(`:${DEFAULT_PORT}`, "g"), `:${runningPort}`)
        .replace(/mapigate-local/g, effectiveApiKey);
      await fs.writeFile(targetPath, renderedTemplate, { encoding: "utf-8", mode: 0o600 });
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

  try {
    const handler = CliToolRegistry.get(toolId);
    if (handler) {
      await handler.reset();
      const updatedStatus = await inspectToolStatus(toolId);
      res.json({ success: true, status: updatedStatus });
      return;
    }

    const targetPath = resolveUserPath(tool.configPath || tool.settingsFile);
    if (!targetPath) {
      res.status(400).json({ error: `Tool ${toolId} has no file configuration path` });
      return;
    }

    const backupPath = `${targetPath}.bak-mapigate`;
    if (await checkFileExists(backupPath)) {
      await fs.copyFile(backupPath, targetPath);
    } else if (await checkFileExists(targetPath)) {
      try {
        const raw = await fs.readFile(targetPath, "utf-8");
        if (targetPath.endsWith(".json")) {
          const parsed = JSON.parse(raw.replace(/,(\s*[}\]])/g, "$1"));
          if (parsed && typeof parsed === "object") {
            if (parsed.baseUrl && String(parsed.baseUrl).includes(String(serverLifecycle.getPort()))) {
              delete parsed.baseUrl;
            }
            if (parsed.apiKey === "mapigate-local") {
              delete parsed.apiKey;
            }
            await fs.writeFile(targetPath, JSON.stringify(parsed, null, 2), { encoding: "utf-8", mode: 0o600 });
          }
        }
      } catch {
        // Leave user file intact on parse error
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


