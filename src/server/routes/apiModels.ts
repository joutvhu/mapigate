import { Router } from "express";
import { ModelRepository } from "../../storage/repositories/modelRepo.js";
import crypto from "node:crypto";

export const modelRouter = Router();

// GET all model rules
modelRouter.get("/", (_req, res) => {
  const rules = ModelRepository.getAllRules();
  res.json(rules);
});

// POST save rule
modelRouter.post("/rules", (req, res) => {
  const body = req.body;
  if (!body.alias || !body.targetModel || !body.targetProviderId) {
    res.status(400).json({ error: "Alias, targetModel, and targetProviderId are required." });
    return;
  }

  const id = body.id || `rule_${crypto.randomUUID().slice(0, 8)}`;
  const rule = {
    id,
    alias: body.alias,
    targetModel: body.targetModel,
    targetProviderId: body.targetProviderId,
    fallbackRules: Array.isArray(body.fallbackRules) ? body.fallbackRules : [],
    isDefault: Boolean(body.isDefault),
  };

  ModelRepository.saveRule(rule);
  res.json(rule);
});

// DELETE rule
modelRouter.delete("/rules/:id", (req, res) => {
  ModelRepository.deleteRule(req.params.id);
  res.json({ success: true });
});
