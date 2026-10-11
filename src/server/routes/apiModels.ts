import { Router } from "express";
import { ModelRepository } from "../../storage/repositories/modelRepo.js";
import { ProviderRepository } from "../../storage/repositories/providerRepo.js";
import { PROVIDER_REGISTRY } from "../../shared/constants/providerRegistry.js";
import { getCapabilitiesForModel } from "../../core/capabilities/index.js";
import crypto from "node:crypto";

export const modelRouter = Router();

// GET all model rules
modelRouter.get("/", (_req, res) => {
  const rules = ModelRepository.getAllRules();
  res.json(rules);
});

// GET available models catalog with connected accounts metadata
modelRouter.get("/available", (req, res) => {
  try {
    const connectedOnlyParam = req.query.connectedOnly;
    const connectedOnly = connectedOnlyParam === "true" || connectedOnlyParam === "1";

    const accounts = ProviderRepository.getAllAccounts();
    const dbProviders = ProviderRepository.getAllProviders();

    const activeCounts = new Map<string, number>();
    for (const acc of accounts) {
      if (acc.isActive) {
        activeCounts.set(acc.providerId, (activeCounts.get(acc.providerId) || 0) + 1);
      }
    }

    const availableModels: Array<{
      id: string;
      value: string;
      name: string;
      providerId: string;
      providerName: string;
      hasConnectedAccount: boolean;
      accountsCount: number;
      caps: {
        vision: boolean;
        reasoning: boolean;
        audio: boolean;
      };
      contextLength: number;
    }> = [];

    const seenValues = new Set<string>();

    for (const provider of Object.values(PROVIDER_REGISTRY)) {
      if (!provider || !provider.models) continue;
      let accountsCount = activeCounts.get(provider.id) || 0;
      if (provider.alias && provider.alias !== provider.id) {
        accountsCount += activeCounts.get(provider.alias) || 0;
      }
      if (provider.aliases) {
        for (const a of provider.aliases) {
          if (a !== provider.id && a !== provider.alias) {
            accountsCount += activeCounts.get(a) || 0;
          }
        }
      }
      const hasConnectedAccount = accountsCount > 0;

      if (connectedOnly && !hasConnectedAccount) {
        continue;
      }

      for (const model of provider.models) {
        const val = `${provider.id}/${model.id}`;
        if (seenValues.has(val)) continue;
        seenValues.add(val);

        const modelAny = model as any;
        const modelCaps = getCapabilitiesForModel(provider.id, model.id);
        const vision = Boolean(
          modelAny.vision !== undefined
            ? modelAny.vision
            : (model.capabilities?.includes("vision") || modelCaps.vision)
        );
        const reasoning = Boolean(
          modelAny.reasoning !== undefined
            ? modelAny.reasoning
            : (model.capabilities?.includes("reasoning") || modelCaps.reasoning)
        );
        const audio = Boolean(
          modelAny.audio !== undefined
            ? modelAny.audio
            : (model.capabilities?.includes("audio") || modelCaps.audioInput || modelCaps.audioOutput)
        );

        availableModels.push({
          id: model.id,
          value: val,
          name: model.name || model.id,
          providerId: provider.id,
          providerName: provider.name,
          hasConnectedAccount,
          accountsCount,
          caps: {
            vision,
            reasoning,
            audio,
          },
          contextLength: model.contextLength || 0,
        });
      }
    }

    // Also include custom providers from DB not present in PROVIDER_REGISTRY
    for (const p of dbProviders) {
      if (PROVIDER_REGISTRY[p.id]) continue;
      const accountsCount = activeCounts.get(p.id) || 0;
      const hasConnectedAccount = accountsCount > 0;
      if (connectedOnly && !hasConnectedAccount) continue;

      const pModels = Array.isArray(p.models) ? p.models : [];
      for (const m of pModels) {
        const modelId = typeof m === "string" ? m : (m as any).id;
        const modelName = typeof m === "string" ? m : ((m as any).name || (m as any).id);
        const val = `${p.id}/${modelId}`;
        if (seenValues.has(val)) continue;
        seenValues.add(val);

        const modelCaps = getCapabilitiesForModel(p.id, modelId);
        availableModels.push({
          id: modelId,
          value: val,
          name: modelName,
          providerId: p.id,
          providerName: p.name || p.id,
          hasConnectedAccount,
          accountsCount,
          caps: {
            vision: Boolean(modelCaps.vision),
            reasoning: Boolean(modelCaps.reasoning),
            audio: Boolean(modelCaps.audioInput || modelCaps.audioOutput),
          },
          contextLength: 0,
        });
      }
    }

    res.json(availableModels);
  } catch (err: any) {
    res.status(500).json({ error: err.message || "Failed to load available models" });
  }
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
