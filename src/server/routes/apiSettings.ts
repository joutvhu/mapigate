import path from "node:path";
import { Router } from "express";
import { SettingsRepository } from "../../storage/repositories/settingsRepo.js";
import {
  getDefaultDataDir,
  MAPIGATE_DB_FILE,
  isDevelopmentMode,
  APP_NAME,
  APP_VERSION,
} from "../../shared/constants/index.js";
import {
  getAutoStartInfo,
  enableAutoStart,
  disableAutoStart,
} from "../../cli/daemon/autostart.js";
import { serverLifecycle } from "../lifecycle.js";
import { logger, parseLogLevel } from "../../shared/logger.js";
import { BackupService } from "../../storage/backupService.js";
import { checkForUpdates } from "../../shared/utils/versionChecker.js";

export const settingsRouter = Router();

// GET /api/settings/version - Check latest version on npm
settingsRouter.get("/version", async (req, res) => {
  try {
    const force = req.query.force === "true";
    const updateInfo = await checkForUpdates(force);
    res.json(updateInfo);
  } catch (error: any) {
    res.status(500).json({ error: error.message || "Failed to check version" });
  }
});

// GET /api/settings/system-info - Get data directory, database path & environment status
settingsRouter.get("/system-info", (_req, res) => {
  try {
    const dataDir = getDefaultDataDir();
    const dbPath = path.join(dataDir, MAPIGATE_DB_FILE);
    const isDev = isDevelopmentMode();
    const runningPort = serverLifecycle.getPort();
    const runningHost = serverLifecycle.getHost();
    const configuredEndpoint = SettingsRepository.getEndpointSettings();
    res.json({
      dataDir,
      dbPath,
      isDevelopmentMode: isDev,
      appName: APP_NAME,
      version: APP_VERSION,
      port: runningPort,
      host: runningHost,
      configuredHost: configuredEndpoint.host,
      configuredPort: configuredEndpoint.port,
      isRestartRequired: runningHost !== configuredEndpoint.host || runningPort !== configuredEndpoint.port,
      logLevel: logger.getLevelName(),
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message || "Failed to fetch system info" });
  }
});

// GET /api/settings/logging - Get logging settings
settingsRouter.get("/logging", (_req, res) => {
  try {
    res.json({
      logLevel: logger.getLevelName(),
      availableLevels: ["trace", "debug", "info", "warn", "error"],
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message || "Failed to fetch logging settings" });
  }
});

// PUT /api/settings/logging - Update logging settings
settingsRouter.put("/logging", (req, res) => {
  try {
    const { logLevel } = req.body || {};
    if (logLevel && typeof logLevel === "string") {
      const parsed = parseLogLevel(logLevel);
      logger.setLevel(parsed);
      const name = logger.getLevelName();
      SettingsRepository.setLogLevel(name);
      return res.json({ logLevel: name });
    }
    res.status(400).json({ error: "Missing or invalid 'logLevel' property" });
  } catch (error: any) {
    res.status(400).json({ error: error.message || "Failed to update logging settings" });
  }
});

// --- Multimodal Capacity Adapter ---

// GET /api/settings/capacity-adapter - Get multimodal capacity adapter settings
settingsRouter.get("/capacity-adapter", (_req, res) => {
  try {
    const config = SettingsRepository.getCapacityAdapterSettings();
    res.json(config);
  } catch (error: any) {
    res.status(500).json({ error: error.message || "Failed to fetch capacity adapter settings" });
  }
});

// PUT /api/settings/capacity-adapter - Update multimodal capacity adapter settings
settingsRouter.put("/capacity-adapter", (req, res) => {
  try {
    const updated = SettingsRepository.setCapacityAdapterSettings(req.body || {});
    res.json(updated);
  } catch (error: any) {
    res.status(400).json({ error: error.message || "Failed to update capacity adapter settings" });
  }
});

// PATCH /api/settings/capacity-adapter - Partial update multimodal capacity adapter settings
settingsRouter.patch("/capacity-adapter", (req, res) => {
  try {
    const updated = SettingsRepository.setCapacityAdapterSettings(req.body || {});
    res.json(updated);
  } catch (error: any) {
    res.status(400).json({ error: error.message || "Failed to update capacity adapter settings" });
  }
});

// --- Endpoint & Connection Settings ---

// GET /api/settings/endpoint - Get gateway connection & endpoint settings
settingsRouter.get("/endpoint", (_req, res) => {
  try {
    const config = SettingsRepository.getEndpointSettings();
    const runningPort = serverLifecycle.getPort();
    res.json({
      ...config,
      runningPort,
      activePort: runningPort,
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message || "Failed to fetch endpoint settings" });
  }
});

// PUT /api/settings/endpoint - Update gateway connection & endpoint settings
settingsRouter.put("/endpoint", (req, res) => {
  try {
    const updated = SettingsRepository.setEndpointSettings(req.body || {});
    res.json(updated);
  } catch (error: any) {
    res.status(400).json({ error: error.message || "Failed to update endpoint settings" });
  }
});

// --- Token Saver Settings ---

// GET /api/settings/token-saver - Get token saver settings
settingsRouter.get("/token-saver", (_req, res) => {
  try {
    const config = SettingsRepository.getTokenSaverSettings();
    res.json(config);
  } catch (error: any) {
    res.status(500).json({ error: error.message || "Failed to fetch token saver settings" });
  }
});

// PUT /api/settings/token-saver - Update token saver settings
settingsRouter.put("/token-saver", (req, res) => {
  try {
    const updated = SettingsRepository.setTokenSaverSettings(req.body || {});
    res.json(updated);
  } catch (error: any) {
    res.status(400).json({ error: error.message || "Failed to update token saver settings" });
  }
});

// PATCH /api/settings/token-saver - Partial update token saver settings
settingsRouter.patch("/token-saver", (req, res) => {
  try {
    const updated = SettingsRepository.setTokenSaverSettings(req.body || {});
    res.json(updated);
  } catch (error: any) {
    res.status(400).json({ error: error.message || "Failed to update token saver settings" });
  }
});

// --- Client Gateway API Keys Management ---

// GET /api/settings/endpoint/keys - List all client gateway API keys
settingsRouter.get("/endpoint/keys", (_req, res) => {
  try {
    const keys = SettingsRepository.getGatewayApiKeys();
    res.json(keys);
  } catch (error: any) {
    res.status(500).json({ error: error.message || "Failed to fetch gateway API keys" });
  }
});

// POST /api/settings/endpoint/keys - Generate a new client gateway API key
settingsRouter.post("/endpoint/keys", (req, res) => {
  try {
    const { name } = req.body || {};
    const createdKey = SettingsRepository.createGatewayApiKey(name);
    res.status(201).json(createdKey);
  } catch (error: any) {
    res.status(400).json({ error: error.message || "Failed to create gateway API key" });
  }
});

// DELETE /api/settings/endpoint/keys/:id - Delete a client gateway API key
settingsRouter.delete("/endpoint/keys/:id", (req, res) => {
  try {
    const id = req.params.id;
    const deleted = SettingsRepository.deleteGatewayApiKey(id);
    if (!deleted) {
      res.status(404).json({ error: "API key not found" });
      return;
    }
    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message || "Failed to delete gateway API key" });
  }
});

// PATCH /api/settings/endpoint/keys/:id/toggle - Toggle active status of a gateway API key
settingsRouter.patch("/endpoint/keys/:id/toggle", (req, res) => {
  try {
    const id = req.params.id;
    const toggled = SettingsRepository.toggleGatewayApiKey(id);
    if (!toggled) {
      res.status(404).json({ error: "API key not found" });
      return;
    }
    res.json(toggled);
  } catch (error: any) {
    res.status(500).json({ error: error.message || "Failed to toggle gateway API key" });
  }
});

// --- General Settings Root ---

// GET /api/settings - General settings
settingsRouter.get("/", (_req, res) => {
  try {
    const capacityAdapter = SettingsRepository.getCapacityAdapterSettings();
    const endpoint = SettingsRepository.getEndpointSettings();
    const tokenSaver = SettingsRepository.getTokenSaverSettings();
    res.json({
      capacityAdapter,
      endpoint,
      tokenSaver,
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message || "Failed to fetch settings" });
  }
});

const FORBIDDEN_SETTINGS_KEYS = new Set([
  "masterpassword",
  "master_password",
  "gatewayapikeys",
  "gateway_api_keys",
]);

function isAllowedSettingKey(key: string): boolean {
  if (!key || typeof key !== "string") return false;
  const normalized = key.toLowerCase().replace(/[-_]/g, "");
  if (FORBIDDEN_SETTINGS_KEYS.has(normalized)) return false;
  if (normalized.startsWith("mitmhosts") || key.startsWith("mitm_hosts_")) return false;
  return true;
}

// PATCH /api/settings - Partial update settings
settingsRouter.patch("/", (req, res) => {
  try {
    const body = req.body || {};
    if (body.capacityAdapter) {
      SettingsRepository.setCapacityAdapterSettings(body.capacityAdapter);
    }
    if (body.endpoint) {
      SettingsRepository.setEndpointSettings(body.endpoint);
    }
    if (body.tokenSaver) {
      SettingsRepository.setTokenSaverSettings(body.tokenSaver);
    }
    for (const [key, val] of Object.entries(body)) {
      if (key !== "capacityAdapter" && key !== "endpoint" && key !== "tokenSaver") {
        if (!isAllowedSettingKey(key)) {
          continue;
        }
        SettingsRepository.setSetting(key, val);
      }
    }
    const capacityAdapter = SettingsRepository.getCapacityAdapterSettings();
    const endpoint = SettingsRepository.getEndpointSettings();
    const tokenSaver = SettingsRepository.getTokenSaverSettings();
    res.json({
      capacityAdapter,
      endpoint,
      tokenSaver,
    });
  } catch (error: any) {
    res.status(400).json({ error: error.message || "Failed to update settings" });
  }
});

// PUT /api/settings - Update settings
settingsRouter.put("/", (req, res) => {
  try {
    const body = req.body || {};
    if (body.capacityAdapter) {
      SettingsRepository.setCapacityAdapterSettings(body.capacityAdapter);
    }
    if (body.endpoint) {
      SettingsRepository.setEndpointSettings(body.endpoint);
    }
    if (body.tokenSaver) {
      SettingsRepository.setTokenSaverSettings(body.tokenSaver);
    }
    for (const [key, val] of Object.entries(body)) {
      if (key !== "capacityAdapter" && key !== "endpoint" && key !== "tokenSaver") {
        if (!isAllowedSettingKey(key)) {
          continue;
        }
        SettingsRepository.setSetting(key, val);
      }
    }
    const capacityAdapter = SettingsRepository.getCapacityAdapterSettings();
    const endpoint = SettingsRepository.getEndpointSettings();
    const tokenSaver = SettingsRepository.getTokenSaverSettings();
    res.json({
      capacityAdapter,
      endpoint,
      tokenSaver,
    });
  } catch (error: any) {
    res.status(400).json({ error: error.message || "Failed to update settings" });
  }
});

// GET /api/settings/autostart - Get autostart state and target path
settingsRouter.get("/autostart", (_req, res) => {
  try {
    const info = getAutoStartInfo();
    res.json(info);
  } catch (error: any) {
    res.status(500).json({ error: error.message || "Failed to get autostart status" });
  }
});

// POST /api/settings/autostart - Enable or disable autostart
settingsRouter.post("/autostart", (req, res) => {
  try {
    const enabled = Boolean(req.body?.enabled);
    const success = enabled ? enableAutoStart() : disableAutoStart();
    const info = getAutoStartInfo();
    res.json({
      success,
      enabled: info.enabled,
      platform: info.platform,
      targetPath: info.targetPath,
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message || "Failed to update autostart setting" });
  }
});


// --- Configuration Backup & Restore ---

// POST /api/settings/backup/export - Export full configuration
settingsRouter.post("/backup/export", async (req, res) => {
  try {
    const { includeCredentials, password } = req.body || {};
    const backup = await BackupService.exportConfig({
      includeCredentials: Boolean(includeCredentials),
      password: typeof password === "string" ? password : undefined,
    });
    res.json(backup);
  } catch (error: any) {
    res.status(500).json({ error: error.message || "Failed to generate configuration backup" });
  }
});

// POST /api/settings/backup/import - Import and restore configuration
settingsRouter.post("/backup/import", async (req, res) => {
  try {
    const { backup, password, mode } = req.body || {};
    if (!backup) {
      res.status(400).json({ error: "Missing backup payload in request body" });
      return;
    }
    const result = await BackupService.importConfig(backup, {
      password: typeof password === "string" ? password : undefined,
      mode: mode === "overwrite" ? "overwrite" : "merge",
    });
    res.json(result);
  } catch (error: any) {
    res.status(400).json({ error: error.message || "Failed to restore configuration backup" });
  }
});
