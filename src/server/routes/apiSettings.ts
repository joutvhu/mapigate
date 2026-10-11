import { Router } from "express";
import { SettingsRepository } from "../../storage/repositories/settingsRepo.js";

export const settingsRouter = Router();

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

// GET /api/settings - General settings
settingsRouter.get("/", (_req, res) => {
  try {
    const capacityAdapter = SettingsRepository.getCapacityAdapterSettings();
    res.json({
      capacityAdapter,
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
    for (const [key, val] of Object.entries(body)) {
      if (key !== "capacityAdapter") {
        SettingsRepository.setSetting(key, val);
      }
    }
    const capacityAdapter = SettingsRepository.getCapacityAdapterSettings();
    res.json({
      capacityAdapter,
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
    for (const [key, val] of Object.entries(body)) {
      if (key !== "capacityAdapter") {
        SettingsRepository.setSetting(key, val);
      }
    }
    const capacityAdapter = SettingsRepository.getCapacityAdapterSettings();
    res.json({
      capacityAdapter,
    });
  } catch (error: any) {
    res.status(400).json({ error: error.message || "Failed to update settings" });
  }
});
