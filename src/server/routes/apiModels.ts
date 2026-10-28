import { Router } from "express";
import { ModelRepository } from "../../storage/repositories/modelRepo.js";
import { ProviderRepository } from "../../storage/repositories/providerRepo.js";
import { ComboRepository } from "../../storage/repositories/comboRepo.js";
import { PROVIDER_REGISTRY, getRegistryProvider } from "../../shared/constants/providerRegistry.js";
import { getCapabilitiesForModel, aggregateComboCapabilities } from "../../core/capabilities/index.js";
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

    const dbProviderMap = new Map<string, (typeof dbProviders)[0]>(
      dbProviders.map((p) => [p.id, p])
    );

    const hasDbConfiguredModels = (pId: string, regItem?: any): boolean => {
      const candidates = new Set<string>([pId]);
      if (regItem?.alias) candidates.add(regItem.alias);
      if (Array.isArray(regItem?.aliases)) {
        for (const a of regItem.aliases) candidates.add(a);
      }
      for (const id of candidates) {
        const db = dbProviderMap.get(id);
        if (db && Array.isArray(db.models) && db.models.length > 0) {
          return true;
        }
      }
      return false;
    };

    const getProviderAccountsCount = (pId: string): number => {
      let count = activeCounts.get(pId) || 0;
      const reg = PROVIDER_REGISTRY[pId] || getRegistryProvider(pId);
      if (reg) {
        if (reg.alias && reg.alias !== reg.id) {
          count += activeCounts.get(reg.alias) || 0;
        }
        if (reg.aliases) {
          for (const a of reg.aliases) {
            if (a !== reg.id && a !== reg.alias) {
              count += activeCounts.get(a) || 0;
            }
          }
        }
      }
      if (
        reg?.noAuth ||
        reg?.requiresApiKey === false ||
        reg?.authType === "none" ||
        pId === "opencode" ||
        pId === "oc"
      ) {
        return Math.max(1, count);
      }
      return count;
    };

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
      isCombo?: boolean;
      strategy?: string;
      models?: string[];
    }> = [];

    const seenValues = new Set<string>();

    // Include active combos
    const allCombos = ComboRepository.getAllCombos();
    for (const combo of allCombos) {
      if (!combo.isActive) continue;

      let comboHasConnected = false;
      let comboAccountsCount = 0;

      for (const m of combo.models) {
        let pId = "";
        const slash = m.indexOf("/");
        if (slash !== -1) {
          pId = m.slice(0, slash);
        } else {
          for (const prov of Object.values(PROVIDER_REGISTRY)) {
            if (prov?.models?.some((pm) => pm.id === m)) {
              pId = prov.id;
              break;
            }
          }
        }

        if (pId) {
          let count = activeCounts.get(pId) || 0;
          const regProv = PROVIDER_REGISTRY[pId];
          if (regProv) {
            if (regProv.alias && regProv.alias !== regProv.id) {
              count += activeCounts.get(regProv.alias) || 0;
            }
            if (regProv.aliases) {
              for (const a of regProv.aliases) {
                if (a !== regProv.id && a !== regProv.alias) {
                  count += activeCounts.get(a) || 0;
                }
              }
            }
          }
          if (count > 0) {
            comboHasConnected = true;
            comboAccountsCount += count;
          }
        }
      }

      if (connectedOnly && !comboHasConnected) {
        continue;
      }

      const val = combo.name.startsWith("combo/") ? combo.name : `combo/${combo.name}`;
      if (seenValues.has(val)) continue;
      seenValues.add(val);

      const comboCaps = aggregateComboCapabilities(combo.models);
      const vision = Boolean(comboCaps?.vision);
      const reasoning = Boolean(comboCaps?.reasoning);
      const audio = Boolean(comboCaps?.audioInput || comboCaps?.audioOutput);
      const contextLength = comboCaps?.contextWindow || 0;

      availableModels.push({
        id: combo.id,
        value: val,
        name: combo.name,
        providerId: "combo",
        providerName: "Combos",
        hasConnectedAccount: comboHasConnected,
        accountsCount: comboAccountsCount,
        caps: {
          vision,
          reasoning,
          audio,
        },
        contextLength,
        isCombo: true,
        strategy: combo.strategy,
        models: combo.models,
      });
    }

    // 1. Prioritize models configured in SQLite (dbProviders)
    for (const p of dbProviders) {
      const pModels = Array.isArray(p.models) ? p.models : [];
      if (pModels.length === 0) continue;

      const accountsCount = getProviderAccountsCount(p.id);
      const hasConnectedAccount = accountsCount > 0;
      if (connectedOnly && !hasConnectedAccount) continue;

      for (const m of pModels) {
        const modelId = typeof m === "string" ? m : (m as any).id;
        const modelName = typeof m === "string" ? m : ((m as any).name || (m as any).id);
        const val = modelId.startsWith(`${p.id}/`) ? modelId : `${p.id}/${modelId}`;
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
          contextLength: modelCaps.contextWindow || 0,
        });
      }
    }

    // 2. Fall back to static PROVIDER_REGISTRY presets if provider has no DB models
    for (const provider of Object.values(PROVIDER_REGISTRY)) {
      if (!provider || !provider.models) continue;
      if (hasDbConfiguredModels(provider.id, provider)) {
        continue;
      }

      const accountsCount = getProviderAccountsCount(provider.id);
      const hasConnectedAccount = accountsCount > 0;

      if (connectedOnly && !hasConnectedAccount) {
        continue;
      }

      for (const model of provider.models) {
        const val = model.id.startsWith(`${provider.id}/`) ? model.id : `${provider.id}/${model.id}`;
        if (seenValues.has(val)) continue;
        seenValues.add(val);

        const modelAny = model as any;
        const modelCaps = getCapabilitiesForModel(provider.id, model.id);
        const hasCap = (capName: string): boolean => {
          if (!model.capabilities) return false;
          if (Array.isArray(model.capabilities)) return model.capabilities.includes(capName);
          return Boolean((model.capabilities as any)[capName]);
        };
        const vision = Boolean(
          modelAny.vision !== undefined
            ? modelAny.vision
            : (hasCap("vision") || modelCaps.vision)
        );
        const reasoning = Boolean(
          modelAny.reasoning !== undefined
            ? modelAny.reasoning
            : (hasCap("reasoning") || modelCaps.reasoning)
        );
        const audio = Boolean(
          modelAny.audio !== undefined
            ? modelAny.audio
            : (hasCap("audio") || modelCaps.audioInput || modelCaps.audioOutput)
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

// GET /v1/models (OpenAI-compatible list)
export function handleOpenAiModelsList(_req: any, res: any) {
  try {
    const list: Array<{
      id: string;
      object: "model";
      created: number;
      owned_by: string;
    }> = [];

    const allCombos = ComboRepository.getAllCombos();
    for (const c of allCombos) {
      if (!c.isActive) continue;
      list.push({
        id: c.name,
        object: "model",
        created: Math.floor(c.createdAt / 1000) || Math.floor(Date.now() / 1000),
        owned_by: "combo",
      });
    }

    const seen = new Set<string>();
    const dbProviders = ProviderRepository.getAllProviders();
    const dbProviderMap = new Map<string, (typeof dbProviders)[0]>(
      dbProviders.map((p) => [p.id, p])
    );

    const hasDbConfiguredModels = (pId: string, regItem?: any): boolean => {
      const candidates = new Set<string>([pId]);
      if (regItem?.alias) candidates.add(regItem.alias);
      if (Array.isArray(regItem?.aliases)) {
        for (const a of regItem.aliases) candidates.add(a);
      }
      for (const id of candidates) {
        const db = dbProviderMap.get(id);
        if (db && Array.isArray(db.models) && db.models.length > 0) {
          return true;
        }
      }
      return false;
    };

    // 1. Prioritize models configured in SQLite (dbProviders)
    for (const p of dbProviders) {
      const pModels = Array.isArray(p.models) ? p.models : [];
      for (const m of pModels) {
        const mId = typeof m === "string" ? m : (m as any).id;
        const id = mId.startsWith(`${p.id}/`) ? mId : `${p.id}/${mId}`;
        if (!seen.has(id)) {
          seen.add(id);
          list.push({
            id,
            object: "model",
            created: Math.floor(p.updatedAt / 1000) || Math.floor(Date.now() / 1000),
            owned_by: p.id,
          });
        }
      }
    }

    // 2. Fall back to static PROVIDER_REGISTRY presets if provider has no DB models
    for (const p of Object.values(PROVIDER_REGISTRY)) {
      if (!p || !p.models) continue;
      if (hasDbConfiguredModels(p.id, p)) {
        continue;
      }
      for (const m of p.models) {
        const id = m.id.startsWith(`${p.id}/`) ? m.id : `${p.id}/${m.id}`;
        if (!seen.has(id)) {
          seen.add(id);
          list.push({
            id,
            object: "model",
            created: Math.floor(Date.now() / 1000),
            owned_by: p.id,
          });
        }
      }
    }

    res.json({
      object: "list",
      data: list,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message || "Failed to list models" });
  }
}

