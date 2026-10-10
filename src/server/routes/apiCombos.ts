import { Router } from "express";
import { ComboRepository } from "../../storage/repositories/comboRepo.js";

export const comboRouter = Router();

// GET all combos
comboRouter.get("/", (_req, res) => {
  const combos = ComboRepository.getAllCombos();
  res.json(combos);
});

// POST save combo
comboRouter.post("/", (req, res) => {
  const { name, models, strategy } = req.body;
  if (!name) {
    res.status(400).json({ error: "Combo name is required." });
    return;
  }

  const record = ComboRepository.saveCombo({
    name,
    models: Array.isArray(models) ? models : [],
    strategy: strategy || "round-robin",
  });

  res.json(record);
});

// DELETE combo
comboRouter.delete("/:id", (req, res) => {
  ComboRepository.deleteCombo(req.params.id);
  res.json({ success: true });
});
