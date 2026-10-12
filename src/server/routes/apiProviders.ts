import { Router } from "express";
import { ProviderRepository } from "../../storage/repositories/providerRepo.js";
import { PROVIDER_REGISTRY, getRegistryProvider } from "../../providers/metadataRegistry.js";
import {
  COMMUNITY_PROVIDERS_CATALOG,
  getCommunityCatalogProvider,
} from "../../providers/catalog/index.js";
import { scanProviderModels } from "../../core/scanner/modelScanner.js";
import crypto from "node:crypto";

export const providerRouter = Router();

// GET community providers catalog (P3 on-demand catalog)
providerRouter.get("/community-catalog", (req, res) => {
  const query = String(req.query.q || "").toLowerCase().trim();
  const category = String(req.query.category || "").toLowerCase().trim();

  let list = COMMUNITY_PROVIDERS_CATALOG;
  if (category && category !== "all") {
    list = list.filter((p) => p.category.toLowerCase() === category);
  }
  if (query) {
    list = list.filter(
      (p) =>
        p.id.toLowerCase().includes(query) ||
        p.name.toLowerCase().includes(query) ||
        p.baseUrl.toLowerCase().includes(query) ||
        p.models?.some((m) => m.id.toLowerCase().includes(query) || m.name?.toLowerCase().includes(query))
    );
  }

  res.json({
    total: list.length,
    catalog: list,
  });
});

// POST import community provider into active SQLite database
providerRouter.post("/community-catalog/import", (req, res) => {
  const { id, apiKey, accountName, customBaseUrl } = req.body || {};
  if (!id) {
    res.status(400).json({ error: "Provider id is required for import." });
    return;
  }

  const catalogItem = getCommunityCatalogProvider(id);
  if (!catalogItem) {
    res.status(404).json({ error: `Community provider "${id}" not found in catalog.` });
    return;
  }

  const baseUrl = (customBaseUrl || catalogItem.baseUrl || "").trim();
  if (!baseUrl) {
    res.status(400).json({
      error: `Provider "${catalogItem.name}" requires a valid Base URL. Please specify customBaseUrl.`,
    });
    return;
  }

  const now = Date.now();
  const provider = {
    id: catalogItem.id,
    name: catalogItem.name,
    baseUrl,
    format: catalogItem.format || "openai",
    isActive: true,
    priority: 10,
    models: (catalogItem.models || []).map((m: any) => (typeof m === "string" ? m : m.id)),
    customHeaders: {},
    thinkingMode: "auto",
    strategy: null,
    stickyLimit: 1,
    createdAt: now,
    updatedAt: now,
  };

  ProviderRepository.saveProvider(provider);

  let accountId: string | undefined;
  if (apiKey && typeof apiKey === "string" && apiKey.trim()) {
    accountId = `acc_${crypto.randomUUID().slice(0, 8)}`;
    ProviderRepository.addAccount({
      id: accountId,
      providerId: provider.id,
      name: accountName?.trim() || "Default Account",
      rawApiKey: apiKey.trim(),
    });
  }

  res.json({
    success: true,
    provider,
    accountId,
  });
});

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

// POST validate provider credentials
providerRouter.post("/validate", async (req, res) => {
  const { provider: providerId, apiKey, providerSpecificData } = req.body;
  const pId = String(providerId || "").toLowerCase();

  if (!pId) {
    res.status(400).json({ valid: false, error: "Provider is required" });
    return;
  }

  const reg = getRegistryProvider(pId);
  if (pId === "opencode" || pId === "oc" || reg?.noAuth) {
    res.json({ valid: true });
    return;
  }

  // Ollama local check
  if (pId === "ollama-local" || pId.includes("ollama")) {
    const host = (providerSpecificData?.baseUrl || "http://127.0.0.1:11434").replace(/\/+$/, "");
    try {
      const probeRes = await fetch(`${host}/api/tags`, {
        signal: AbortSignal.timeout(4000),
      });
      res.json({ valid: probeRes.ok || probeRes.status === 200 });
      return;
    } catch (err: any) {
      res.json({ valid: false, error: `Could not connect to Ollama at ${host}: ${err.message}` });
      return;
    }
  }

  // Cloudflare AI check
  if (pId === "cloudflare-ai") {
    const accountId = providerSpecificData?.accountId;
    if (!accountId) {
      res.json({ valid: false, error: "Cloudflare Account ID is required" });
      return;
    }
    if (!apiKey) {
      res.json({ valid: false, error: "API Token is required" });
      return;
    }
    try {
      const url = `https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/v1/chat/completions`;
      const cfRes = await fetch(url, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "@cf/meta/llama-3.1-8b-instruct",
          messages: [{ role: "user", content: "test" }],
          max_tokens: 1,
        }),
        signal: AbortSignal.timeout(6000),
      });
      const isValid = cfRes.status !== 401 && cfRes.status !== 403;
      res.json({ valid: isValid, error: isValid ? undefined : "Invalid Cloudflare token or Account ID" });
      return;
    } catch (err: any) {
      res.json({ valid: false, error: err.message });
      return;
    }
  }

  // Azure OpenAI check
  if (pId === "azure") {
    const endpoint = (providerSpecificData?.azureEndpoint || "").replace(/\/+$/, "");
    const deployment = providerSpecificData?.deployment || "gpt-4";
    const apiVersion = providerSpecificData?.apiVersion || "2024-10-01-preview";
    const organization = providerSpecificData?.organization;

    if (!endpoint || !deployment) {
      res.json({ valid: false, error: "Endpoint and Deployment name are required for Azure" });
      return;
    }

    try {
      const url = `${endpoint}/openai/deployments/${deployment}/chat/completions?api-version=${apiVersion}`;
      const headers: Record<string, string> = {
        "api-key": apiKey || "",
        "Content-Type": "application/json",
      };
      if (organization) headers["OpenAI-Organization"] = organization;

      const azureRes = await fetch(url, {
        method: "POST",
        headers,
        body: JSON.stringify({
          messages: [{ role: "user", content: "test" }],
          max_tokens: 1,
        }),
        signal: AbortSignal.timeout(6000),
      });

      const isValid = azureRes.status !== 401 && azureRes.status !== 403;
      res.json({ valid: isValid, error: isValid ? undefined : "Invalid Azure credentials" });
      return;
    } catch (err: any) {
      res.json({ valid: false, error: err.message });
      return;
    }
  }

  // AWS Bedrock check
  if (pId === "bedrock" || pId.includes("bedrock")) {
    if (providerSpecificData?.profile) {
      res.json({ valid: true });
      return;
    }
    if (apiKey && providerSpecificData?.accessKeyId) {
      res.json({ valid: true });
      return;
    }
    res.json({ valid: false, error: "AWS Profile or Access Key ID + Secret Key required" });
    return;
  }

  // Standard API key validation
  if (!apiKey && !providerSpecificData?.profile) {
    res.json({ valid: false, error: "API key is required" });
    return;
  }

  const dbProv = ProviderRepository.getProviderById(pId);
  const baseUrl = (dbProv?.baseUrl || reg?.baseUrl || "https://api.openai.com").replace(/\/+$/, "");
  const format = dbProv?.format || reg?.format || "openai";

  try {
    if (format === "anthropic") {
      const messagesUrl = `${baseUrl}/v1/messages`;
      const probeRes = await fetch(messagesUrl, {
        method: "POST",
        headers: {
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
          "content-type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: reg?.models?.[0]?.id || "claude-3-haiku-20240307",
          max_tokens: 1,
          messages: [{ role: "user", content: "test" }],
        }),
        signal: AbortSignal.timeout(6000),
      });
      const isValid = probeRes.status !== 401 && probeRes.status !== 403;
      res.json({ valid: isValid, error: isValid ? undefined : "Invalid Anthropic API key" });
      return;
    }

    // Default OpenAI format probe: /models
    const probeUrl = `${baseUrl}/models`;
    const probeRes = await fetch(probeUrl, {
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
      signal: AbortSignal.timeout(6000),
    });

    if (probeRes.ok || probeRes.status === 200) {
      res.json({ valid: true });
      return;
    }

    if (probeRes.status === 401 || probeRes.status === 403) {
      res.json({ valid: false, error: "Invalid API key" });
      return;
    }

    // Secondary fallback: /v1/models
    const v1Res = await fetch(`${baseUrl}/v1/models`, {
      headers: { Authorization: `Bearer ${apiKey}` },
      signal: AbortSignal.timeout(5000),
    });
    const isValid = v1Res.ok || (v1Res.status !== 401 && v1Res.status !== 403);
    res.json({ valid: isValid, error: isValid ? undefined : "Authentication failed" });
  } catch (err: any) {
    res.json({ valid: false, error: err.message || "Connection timeout or unreachable" });
  }
});

// POST ad-hoc model scanning from upstream provider API
providerRouter.post("/scan-models", async (req, res) => {
  try {
    const { providerId, baseUrl, apiKey, customHeaders, format, timeoutMs, region, providerSpecificData } = req.body || {};
    if (!providerId && !baseUrl) {
      res.status(400).json({ success: false, models: [], count: 0, error: "Either providerId or baseUrl is required." });
      return;
    }
    const regProv = providerId ? getRegistryProvider(providerId) : undefined;
    const effectiveRegion = region || regProv?.defaultRegion;
    const result = await scanProviderModels({
      providerId,
      baseUrl,
      apiKey,
      customHeaders,
      format,
      timeoutMs: timeoutMs ? Number(timeoutMs) : undefined,
      region: effectiveRegion,
      providerSpecificData,
    });
    if (!result.success) {
      if (result.noAccountsConfigured) {
        res.status(400).json(result);
        return;
      }
      const isAuth = result.error?.includes("Authentication failed");
      res.status(isAuth ? 401 : 400).json(result);
      return;
    }
    res.json(result);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ success: false, models: [], count: 0, error: msg });
  }
});

// POST scan models for a specific configured provider
providerRouter.post("/:id/scan-models", async (req, res) => {
  try {
    const providerId = req.params.id;
    const { baseUrl, apiKey, customHeaders, format, timeoutMs, region, providerSpecificData } = req.body || {};
    const dbProv = ProviderRepository.getProviderById(providerId);
    const regProv = getRegistryProvider(providerId);

    if (!dbProv && !regProv && !baseUrl) {
      res.status(404).json({ success: false, models: [], count: 0, error: `Provider "${providerId}" not found.` });
      return;
    }

    const effectiveRegion = region || regProv?.defaultRegion;

    const result = await scanProviderModels({
      providerId,
      baseUrl,
      apiKey,
      customHeaders,
      format,
      timeoutMs: timeoutMs ? Number(timeoutMs) : undefined,
      region: effectiveRegion,
      providerSpecificData,
    });

    if (!result.success) {
      if (result.noAccountsConfigured) {
        res.status(400).json(result);
        return;
      }
      const isAuth = result.error?.includes("Authentication failed");
      res.status(isAuth ? 401 : 400).json(result);
      return;
    }
    res.json(result);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ success: false, models: [], count: 0, error: msg });
  }
});

// GET single provider details
providerRouter.get("/:id", (req, res) => {
  const provider = ProviderRepository.getProviderWithDefaults(req.params.id);
  if (!provider) {
    res.status(404).json({ error: "Provider not found" });
    return;
  }
  const accounts = ProviderRepository.getAllAccountsByProvider(provider.id);
  res.json({
    ...provider,
    accountsCount: accounts.length,
    accounts: accounts.map((a) => ({
      id: a.id,
      name: a.name,
      isActive: a.isActive,
      rateLimitHits: a.rateLimitHits,
      lastUsedAt: a.lastUsedAt,
      providerSpecificData: a.providerSpecificData,
    })),
  });
});

// PUT toggle account active status
providerRouter.put("/:id/accounts/:accountId/toggle", (req, res) => {
  ProviderRepository.toggleAccount(req.params.accountId, req.body.isActive);
  res.json({ success: true });
});

// DELETE single account
providerRouter.delete("/:id/accounts/:accountId", (req, res) => {
  ProviderRepository.deleteAccount(req.params.accountId);
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
    const accounts = ProviderRepository.getAllAccountsByProvider(p.id);
    return {
      ...p,
      accountsCount: accounts.length,
      accounts: accounts.map((a) => ({
        id: a.id,
        name: a.name,
        isActive: a.isActive,
        rateLimitHits: a.rateLimitHits,
        lastUsedAt: a.lastUsedAt,
        providerSpecificData: a.providerSpecificData,
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
    strategy: body.strategy || null,
    stickyLimit: body.stickyLimit != null ? Number(body.stickyLimit) : 1,
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
  try {
    const { name, apiKey, providerSpecificData } = req.body;
    const providerId = req.params.id;

    const reg = getRegistryProvider(providerId);
    const isNoAuth = reg?.noAuth || providerId === "opencode" || providerId === "oc";
    const isOllamaLocal = providerId === "ollama-local";
    const hasProfile = Boolean(providerSpecificData?.profile);

    if (!name && !isOllamaLocal && !isNoAuth) {
      res.status(400).json({ error: "Account name is required." });
      return;
    }

    if (!apiKey && !isOllamaLocal && !hasProfile && !isNoAuth) {
      res.status(400).json({ error: "API key or credential profile is required." });
      return;
    }

    const ensured = ProviderRepository.ensureProviderExists(providerId);
    const accountId = `acc_${crypto.randomUUID().slice(0, 8)}`;
    ProviderRepository.addAccount({
      id: accountId,
      providerId: ensured.id,
      name: name || (isNoAuth ? "OpenCode Free" : isOllamaLocal ? "Ollama Local" : "Account"),
      rawApiKey: apiKey || (isNoAuth ? "public" : ""),
      providerSpecificData,
    });

    res.json({ id: accountId, success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message || "Failed to add account" });
  }
});

// POST bulk add accounts
providerRouter.post("/:id/accounts/bulk", (req, res) => {
  try {
    const { accounts } = req.body;
    const providerId = req.params.id;

    if (!Array.isArray(accounts) || accounts.length === 0) {
      res.status(400).json({ error: "Accounts array is required." });
      return;
    }

    const ensured = ProviderRepository.ensureProviderExists(providerId);
    const planned = accounts.map((item) => ({
      id: `acc_${crypto.randomUUID().slice(0, 8)}`,
      providerId: ensured.id,
      name: item.name || "Account",
      rawApiKey: item.apiKey || "",
      providerSpecificData: item.providerSpecificData,
    }));

    ProviderRepository.bulkAddAccounts(planned);
    res.json({ success: true, count: planned.length });
  } catch (err: any) {
    res.status(500).json({ error: err.message || "Failed to bulk add accounts" });
  }
});

// POST test provider connection
providerRouter.post("/:id/test", async (req, res) => {
  const provider =
    ProviderRepository.getProviderById(req.params.id) ||
    ProviderRepository.getProviderWithDefaults(req.params.id);
  if (!provider) {
    res.status(404).json({ success: false, message: "Provider not found." });
    return;
  }

  const reg = getRegistryProvider(provider.id);
  const isOpenCode = provider.id === "opencode" || provider.id === "oc" || Boolean(reg?.noAuth);

  if (isOpenCode) {
    try {
      const upstream = await fetch("https://opencode.ai/zen/v1/models", {
        method: "GET",
        headers: {
          Authorization: "Bearer public",
          "User-Agent": "opencode/1.18.31",
          "x-opencode-client": "desktop",
        },
        signal: AbortSignal.timeout(5000),
      });

      if (upstream.ok || upstream.status === 200 || upstream.status === 404) {
        res.json({ success: true, message: `Connected to ${provider.name} successfully.` });
      } else {
        res.json({ success: false, message: `Upstream returned status ${upstream.status}` });
      }
      return;
    } catch (err: any) {
      res.json({ success: false, message: err.message || "Connection timeout or failed" });
      return;
    }
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
