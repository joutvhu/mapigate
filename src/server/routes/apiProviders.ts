import { Router } from "express";
import { ProviderRepository } from "../../storage/repositories/providerRepo.js";
import { PROVIDER_REGISTRY, getRegistryProvider } from "../../shared/constants/providerRegistry.js";
import crypto from "node:crypto";

export const providerRouter = Router();

// GET all registry providers
providerRouter.get("/registry", (_req, res) => {
  res.json(PROVIDER_REGISTRY);
});

// GET single provider registry info
providerRouter.get("/registry/:id", (req, res) => {
  const item = getRegistryProvider(req.params.id);
  if (!item) {
    res.status(404).json({ error: "Provider not found in registry" });
    return;
  }
  res.json(item);
});

// GET single provider details
providerRouter.get("/:id", (req, res) => {
  const provider = ProviderRepository.getProviderWithDefaults(req.params.id);
  if (!provider) {
    res.status(404).json({ error: "Provider not found" });
    return;
  }
  const accounts = ProviderRepository.getAccountsByProvider(provider.id);
  res.json({
    ...provider,
    accountsCount: accounts.length,
    accounts: accounts.map((a) => ({
      id: a.id,
      name: a.name,
      isActive: a.isActive,
      rateLimitHits: a.rateLimitHits,
      lastUsedAt: a.lastUsedAt,
    })),
  });
});

// PUT toggle account active status
providerRouter.put("/:id/accounts/:accountId/toggle", (req, res) => {
  ProviderRepository.toggleAccount(req.params.accountId, req.body.isActive);
  res.json({ success: true });
});

// PUT strategy and sticky limit
providerRouter.put("/:id/strategy", (req, res) => {
  const { strategy, stickyLimit } = req.body;
  const strat = strategy || null;
  const sticky = stickyLimit != null ? Number(stickyLimit) : null;
  ProviderRepository.updateProviderStrategy(req.params.id, strat, sticky);
  res.json({ success: true, strategy: strat, stickyLimit: sticky });
});

// PUT reorder accounts
providerRouter.put("/:id/accounts/reorder", (req, res) => {
  const { accountIds } = req.body;
  if (Array.isArray(accountIds)) {
    ProviderRepository.reorderAccounts(accountIds);
  }
  res.json({ success: true });
});

// GET all providers with account counts
providerRouter.get("/", (_req, res) => {
  const providers = ProviderRepository.getAllProviders();
  const result = providers.map((p) => {
    const accounts = ProviderRepository.getAccountsByProvider(p.id);
    return {
      ...p,
      accountsCount: accounts.length,
      accounts: accounts.map((a) => ({
        id: a.id,
        name: a.name,
        isActive: a.isActive,
        rateLimitHits: a.rateLimitHits,
        lastUsedAt: a.lastUsedAt,
      })),
    };
  });
  res.json(result);
});

// POST create or update provider
providerRouter.post("/", (req, res) => {
  const body = req.body;
  if (!body.name || !body.baseUrl) {
    res.status(400).json({ error: "Name and baseUrl are required." });
    return;
  }

  const id = body.id || `prov_${crypto.randomUUID().slice(0, 8)}`;
  const now = Date.now();

  const provider = {
    id,
    name: body.name,
    baseUrl: body.baseUrl,
    format: body.format || "openai",
    isActive: body.isActive !== undefined ? Boolean(body.isActive) : true,
    priority: Number(body.priority) || 10,
    models: Array.isArray(body.models) ? body.models : [],
    customHeaders: body.customHeaders || {},
    proxyUrl: body.proxyUrl || undefined,
    thinkingMode: body.thinkingMode || "auto",
    createdAt: body.createdAt || now,
    updatedAt: now,
  };

  ProviderRepository.saveProvider(provider);
  res.json(provider);
});

// DELETE provider
providerRouter.delete("/:id", (req, res) => {
  ProviderRepository.deleteProvider(req.params.id);
  res.json({ success: true });
});

// POST add account to provider
providerRouter.post("/:id/accounts", (req, res) => {
  const { name, apiKey } = req.body;
  if (!name || !apiKey) {
    res.status(400).json({ error: "Account name and apiKey are required." });
    return;
  }

  const accountId = `acc_${crypto.randomUUID().slice(0, 8)}`;
  ProviderRepository.addAccount({
    id: accountId,
    providerId: req.params.id,
    name,
    rawApiKey: apiKey,
  });

  res.json({ id: accountId, success: true });
});

// POST test provider connection
providerRouter.post("/:id/test", async (req, res) => {
  const provider = ProviderRepository.getProviderById(req.params.id);
  if (!provider) {
    res.status(404).json({ success: false, message: "Provider not found." });
    return;
  }

  const accounts = ProviderRepository.getAccountsByProvider(provider.id);
  if (accounts.length === 0) {
    res.json({ success: false, message: "No active API keys found for this provider." });
    return;
  }

  const account = accounts[0];
  try {
    const testUrl = `${provider.baseUrl.replace(/\/+$/, "")}/v1/models`;
    const upstream = await fetch(testUrl, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${account.rawApiKey}`,
      },
      signal: AbortSignal.timeout(5000),
    });

    if (upstream.ok || upstream.status === 200 || upstream.status === 404) {
      res.json({ success: true, message: `Connected to ${provider.name} successfully.` });
    } else {
      res.json({ success: false, message: `Upstream returned status ${upstream.status}` });
    }
  } catch (err: any) {
    res.json({ success: false, message: err.message || "Connection timeout or failed" });
  }
});
