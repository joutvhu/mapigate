import { Router } from "express";
import { ComboRepository, VALID_NAME_REGEX } from "../../storage/repositories/comboRepo.js";
import { buildPresetItems, PRESET_SOURCES } from "../../core/router/comboPresets.js";

export const comboRouter = Router();

// GET /api/combos - Get all combos
comboRouter.get("/", (_req, res) => {
  try {
    const combos = ComboRepository.getAllCombos();
    res.json(combos);
  } catch (error: any) {
    res.status(500).json({ error: error.message || "Failed to fetch combos" });
  }
});

// GET /api/combos/presets - Preview combo presets for a source
comboRouter.get("/presets", (req, res) => {
  const source = String(req.query.source || "").toLowerCase();
  if (!source || !PRESET_SOURCES.has(source)) {
    res.status(400).json({ error: "source must be 'cursor' or 'claude'" });
    return;
  }

  try {
    const existingNames = ComboRepository.getAllCombos().map((c) => c.name);
    const items = buildPresetItems(source, { existingNames });
    res.json({
      source,
      items,
      toCreate: items.filter((i) => !i.exists).length,
      toSkip: items.filter((i) => i.exists).length,
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message || "Failed to preview combo presets" });
  }
});

// POST /api/combos/presets - Create missing combo presets for a source
comboRouter.post("/presets", (req, res) => {
  const source = String(req.body?.source || "").toLowerCase();
  if (!source || !PRESET_SOURCES.has(source)) {
    res.status(400).json({ error: "source must be 'cursor' or 'claude'" });
    return;
  }

  try {
    const existingNames = ComboRepository.getAllCombos().map((c) => c.name);
    const items = buildPresetItems(source, { existingNames });
    const created: any[] = [];
    const skipped: string[] = [];

    for (const item of items) {
      if (item.exists) {
        skipped.push(item.name);
        continue;
      }
      const combo = ComboRepository.saveCombo({
        name: item.name,
        models: item.models,
        strategy: "round-robin",
      });
      created.push(combo);
    }

    res.status(201).json({
      source,
      created,
      skipped,
      createdCount: created.length,
      skippedCount: skipped.length,
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message || "Failed to create combo presets" });
  }
});

// POST /api/combos - Create new combo
comboRouter.post("/", (req, res) => {
  const { name, models, strategy, id, isActive } = req.body;

  if (!name || typeof name !== "string" || name.trim().length === 0) {
    res.status(400).json({ error: "Combo name is required." });
    return;
  }

  const trimmedName = name.trim();
  if (!VALID_NAME_REGEX.test(trimmedName)) {
    res.status(400).json({ error: "Name can only contain letters, numbers, -, _ and ." });
    return;
  }

  const existing = ComboRepository.getComboByName(trimmedName);
  if (existing) {
    res.status(400).json({ error: "Combo name already exists." });
    return;
  }

  try {
    const record = ComboRepository.saveCombo({
      id,
      name: trimmedName,
      models: Array.isArray(models) ? models : [],
      strategy: strategy || "round-robin",
      isActive: isActive !== false,
    });

    res.status(201).json(record);
  } catch (error: any) {
    res.status(400).json({ error: error.message || "Failed to create combo" });
  }
});

// GET /api/combos/:id - Get single combo by ID or name
comboRouter.get("/:id", (req, res) => {
  const combo = ComboRepository.getComboById(req.params.id) || ComboRepository.getComboByName(req.params.id);
  if (!combo) {
    res.status(404).json({ error: "Combo not found." });
    return;
  }
  res.json(combo);
});

// PUT /api/combos/:id - Update combo
comboRouter.put("/:id", (req, res) => {
  const id = req.params.id;
  const { name, models, strategy, isActive } = req.body;

  if (name !== undefined) {
    if (typeof name !== "string" || name.trim().length === 0) {
      res.status(400).json({ error: "Combo name cannot be empty." });
      return;
    }
    const trimmedName = name.trim();
    if (!VALID_NAME_REGEX.test(trimmedName)) {
      res.status(400).json({ error: "Name can only contain letters, numbers, -, _ and ." });
      return;
    }
    const existingByName = ComboRepository.getComboByName(trimmedName);
    if (existingByName && existingByName.id !== id) {
      res.status(400).json({ error: "Combo name already exists." });
      return;
    }
  }

  try {
    const updated = ComboRepository.updateCombo(id, {
      name: name !== undefined ? String(name).trim() : undefined,
      models,
      strategy,
      isActive,
    });

    if (!updated) {
      res.status(404).json({ error: "Combo not found." });
      return;
    }

    res.json(updated);
  } catch (error: any) {
    res.status(400).json({ error: error.message || "Failed to update combo." });
  }
});

// POST /api/combos/:id/toggle - Toggle active status of a combo
comboRouter.post("/:id/toggle", (req, res) => {
  const toggled = ComboRepository.toggleCombo(req.params.id);
  if (!toggled) {
    res.status(404).json({ error: "Combo not found." });
    return;
  }
  res.json(toggled);
});

// DELETE /api/combos/:id - Delete combo
comboRouter.delete("/:id", (req, res) => {
  const success = ComboRepository.deleteCombo(req.params.id);
  if (!success) {
    res.status(404).json({ error: "Combo not found." });
    return;
  }
  res.json({ success: true });
});
