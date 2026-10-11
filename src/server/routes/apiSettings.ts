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

export const settingsRouter = Router();

// GET /api/settings/system-info - Get data directory, database path & environment status
settingsRouter.get("/system-info", (_req, res) => {
  try {
    const dataDir = getDefaultDataDir();
    const dbPath = path.join(dataDir, MAPIGATE_DB_FILE);
    const isDev = isDevelopmentMode();
    res.json({
      dataDir,
      dbPath,
      isDevelopmentMode: isDev,
      appName: APP_NAME,
      version: APP_VERSION,
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message || "Failed to fetch system info" });
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
    res.json(config);
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
    res.json({
      capacityAdapter,
      endpoint,
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message || "Failed to fetch settings" });
  }
});

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
    for (const [key, val] of Object.entries(body)) {
      if (key !== "capacityAdapter" && key !== "endpoint") {
        SettingsRepository.setSetting(key, val);
      }
    }
    const capacityAdapter = SettingsRepository.getCapacityAdapterSettings();
    const endpoint = SettingsRepository.getEndpointSettings();
    res.json({
      capacityAdapter,
      endpoint,
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
    for (const [key, val] of Object.entries(body)) {
      if (key !== "capacityAdapter" && key !== "endpoint") {
        SettingsRepository.setSetting(key, val);
      }
    }
    const capacityAdapter = SettingsRepository.getCapacityAdapterSettings();
    const endpoint = SettingsRepository.getEndpointSettings();
    res.json({
      capacityAdapter,
      endpoint,
    });
  } catch (error: any) {
    res.status(400).json({ error: error.message || "Failed to update settings" });
  }
});
