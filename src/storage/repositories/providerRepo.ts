import { getDatabase } from "../database.js";
import { CryptoVault } from "../crypto/vault.js";
import type { ProviderConfig, ProviderAccount } from "../../shared/types/index.js";
import { getRegistryProvider, type RegistryModel } from "../../shared/constants/providerRegistry.js";

export class ProviderRepository {
  public static getAllProviders(): ProviderConfig[] {
    const db = getDatabase();
    const rows = db.all<any>("SELECT * FROM providers ORDER BY priority ASC, created_at ASC");
    return rows.map((r) => ({
      id: r.id,
      name: r.name,
      baseUrl: r.base_url,
      format: r.format,
      isActive: Boolean(r.is_active),
      priority: r.priority,
      models: JSON.parse(r.models || "[]"),
      customHeaders: JSON.parse(r.custom_headers || "{}"),
      proxyUrl: r.proxy_url || undefined,
      thinkingMode: r.thinking_mode || "auto",
      strategy: r.strategy || null,
      stickyLimit: r.sticky_limit != null ? Number(r.sticky_limit) : 1,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    }));
  }

  public static getProviderById(id: string): ProviderConfig | undefined {
    const db = getDatabase();
    const r = db.get<any>("SELECT * FROM providers WHERE id = ?", id);
    if (!r) return undefined;
    return {
      id: r.id,
      name: r.name,
      baseUrl: r.base_url,
      format: r.format,
      isActive: Boolean(r.is_active),
      priority: r.priority,
      models: JSON.parse(r.models || "[]"),
      customHeaders: JSON.parse(r.custom_headers || "{}"),
      proxyUrl: r.proxy_url || undefined,
      thinkingMode: r.thinking_mode || "auto",
      strategy: r.strategy || null,
      stickyLimit: r.sticky_limit != null ? Number(r.sticky_limit) : 1,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    };
  }

  public static getProviderWithDefaults(id: string): (ProviderConfig & {
    defaultHeaders: Record<string, string>;
    catalogModels: RegistryModel[];
    thinkingOptions: string[];
  }) | undefined {
    const dbConfig = this.getProviderById(id);
    const reg = getRegistryProvider(id);
    if (!dbConfig && !reg) return undefined;

    const base: ProviderConfig = dbConfig || {
      id: reg!.id,
      name: reg!.name,
      baseUrl: reg!.baseUrl,
      format: reg!.format as any,
      isActive: true,
      priority: 10,
      models: reg!.models.map((m) => m.id),
      customHeaders: { ...reg!.defaultHeaders },
      proxyUrl: undefined,
      thinkingMode: reg!.thinkingMode || "auto",
      strategy: null,
      stickyLimit: 1,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    const customHeaders =
      base.customHeaders && Object.keys(base.customHeaders).length > 0
        ? base.customHeaders
        : { ...(reg?.defaultHeaders || {}) };

    const models =
      base.models && base.models.length > 0
        ? base.models
        : (reg?.models.map((m) => m.id) || []);

    return {
      ...base,
      customHeaders,
      models,
      defaultHeaders: reg?.defaultHeaders || {},
      catalogModels: reg?.models || [],
      thinkingOptions: reg?.thinkingOptions || ["auto", "none", "low", "medium", "high"],
    };
  }

  public static saveProvider(provider: ProviderConfig): void {
    const db = getDatabase();
    db.run(
      `INSERT INTO providers (id, name, base_url, format, is_active, priority, models, custom_headers, proxy_url, thinking_mode, strategy, sticky_limit, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         name = excluded.name,
         base_url = excluded.base_url,
         format = excluded.format,
         is_active = excluded.is_active,
         priority = excluded.priority,
         models = excluded.models,
         custom_headers = excluded.custom_headers,
         proxy_url = excluded.proxy_url,
         thinking_mode = excluded.thinking_mode,
         strategy = excluded.strategy,
         sticky_limit = excluded.sticky_limit,
         updated_at = excluded.updated_at`,
      provider.id,
      provider.name,
      provider.baseUrl,
      provider.format,
      provider.isActive ? 1 : 0,
      provider.priority ?? 0,
      JSON.stringify(provider.models || []),
      JSON.stringify(provider.customHeaders || {}),
      provider.proxyUrl || null,
      provider.thinkingMode || "auto",
      provider.strategy || null,
      provider.stickyLimit != null ? provider.stickyLimit : 1,
      provider.createdAt ?? Date.now(),
      provider.updatedAt ?? Date.now()
    );
  }

  public static ensureProviderExists(providerId: string, fallbackName?: string): ProviderConfig {
    const rawId = (providerId || "").trim();
    if (!rawId) {
      throw new Error("Provider ID cannot be empty");
    }

    // 1. Direct DB lookup
    const existing = this.getProviderById(rawId);
    if (existing) {
      return existing;
    }

    // 2. Registry lookup (supports exact id, aliases, case-insensitivity)
    const reg = getRegistryProvider(rawId);
    if (reg) {
      // Check if canonical registry ID already exists in DB (e.g. if rawId was an alias)
      const existingCanonical = this.getProviderById(reg.id);
      if (existingCanonical) {
        return existingCanonical;
      }

      const defaults = this.getProviderWithDefaults(reg.id);
      const now = Date.now();
      const config: ProviderConfig = {
        id: reg.id,
        name: defaults?.name || reg.name || fallbackName || reg.id,
        baseUrl: defaults?.baseUrl || reg.baseUrl || "https://api.openai.com",
        format: (defaults?.format || reg.format || "openai") as any,
        isActive: true,
        priority: defaults?.priority ?? 10,
        models: defaults?.models && defaults.models.length > 0
          ? defaults.models
          : (reg.models?.map((m) => m.id) || []),
        customHeaders: defaults?.customHeaders && Object.keys(defaults.customHeaders).length > 0
          ? defaults.customHeaders
          : { ...(reg.defaultHeaders || {}) },
        proxyUrl: defaults?.proxyUrl || undefined,
        thinkingMode: defaults?.thinkingMode || reg.thinkingMode || "auto",
        strategy: defaults?.strategy || null,
        stickyLimit: defaults?.stickyLimit != null ? defaults.stickyLimit : 1,
        createdAt: now,
        updatedAt: now,
      };

      this.saveProvider(config);
      return config;
    }

    // 3. Fallback for custom / unregistered provider
    const now = Date.now();
    const fallbackConfig: ProviderConfig = {
      id: rawId,
      name: fallbackName || rawId,
      baseUrl: "https://api.openai.com",
      format: "openai",
      isActive: true,
      priority: 10,
      models: [],
      customHeaders: {},
      proxyUrl: undefined,
      thinkingMode: "auto",
      strategy: null,
      stickyLimit: 1,
      createdAt: now,
      updatedAt: now,
    };

    this.saveProvider(fallbackConfig);
    return fallbackConfig;
  }

  public static seedDefaultProviders(): void {
    const coreProviders = [
      "claude",
      "cursor",
      "codex",
      "kiro",
      "antigravity",
      "github",
      "openai",
      "deepseek",
      "gemini",
    ];
    for (const pId of coreProviders) {
      try {
        this.ensureProviderExists(pId);
      } catch {
        // Fail-open
      }
    }
  }

  public static updateProviderStrategy(id: string, strategy: string | null, stickyLimit: number | null): void {
    const db = getDatabase();
    const provider = this.ensureProviderExists(id);
    db.run(
      `UPDATE providers SET strategy = ?, sticky_limit = ?, updated_at = ? WHERE id = ?`,
      strategy,
      stickyLimit,
      Date.now(),
      provider.id
    );
  }

  public static deleteProvider(id: string): void {
    const db = getDatabase();
    db.run("DELETE FROM providers WHERE id = ?", id);
  }

  public static getAllAccounts(): (ProviderAccount & { rawApiKey: string })[] {
    const db = getDatabase();
    const rows = db.all<any>(
      "SELECT * FROM provider_accounts ORDER BY provider_id ASC, rate_limit_hits ASC, last_used_at ASC"
    );

    return rows.map((r) => ({
      id: r.id,
      providerId: r.provider_id,
      name: r.name,
      apiKeyEncrypted: r.api_key_encrypted,
      rawApiKey: CryptoVault.decrypt(r.api_key_encrypted),
      isActive: Boolean(r.is_active),
      rateLimitHits: r.rate_limit_hits,
      lastUsedAt: r.last_used_at,
      providerSpecificData: r.provider_specific_data ? JSON.parse(r.provider_specific_data) : undefined,
    }));
  }

  public static bulkToggleAccounts(accountIds: string[], isActive: boolean): void {
    if (!accountIds || accountIds.length === 0) return;
    const db = getDatabase();
    for (const id of accountIds) {
      db.run("UPDATE provider_accounts SET is_active = ? WHERE id = ?", isActive ? 1 : 0, id);
    }
  }

  public static getAllAccountsByProvider(providerId: string): (ProviderAccount & { rawApiKey: string })[] {
    const db = getDatabase();
    const rows = db.all<any>(
      "SELECT * FROM provider_accounts WHERE provider_id = ? ORDER BY rate_limit_hits ASC, last_used_at ASC",
      providerId
    );

    return rows.map((r) => ({
      id: r.id,
      providerId: r.provider_id,
      name: r.name,
      apiKeyEncrypted: r.api_key_encrypted,
      rawApiKey: CryptoVault.decrypt(r.api_key_encrypted),
      isActive: Boolean(r.is_active),
      rateLimitHits: r.rate_limit_hits,
      lastUsedAt: r.last_used_at,
      providerSpecificData: r.provider_specific_data ? JSON.parse(r.provider_specific_data) : undefined,
    }));
  }

  public static getAccountsByProvider(providerId: string): (ProviderAccount & { rawApiKey: string })[] {
    const db = getDatabase();
    const rows = db.all<any>(
      "SELECT * FROM provider_accounts WHERE provider_id = ? AND is_active = 1 ORDER BY rate_limit_hits ASC, last_used_at ASC",
      providerId
    );

    return rows.map((r) => ({
      id: r.id,
      providerId: r.provider_id,
      name: r.name,
      apiKeyEncrypted: r.api_key_encrypted,
      rawApiKey: CryptoVault.decrypt(r.api_key_encrypted),
      isActive: Boolean(r.is_active),
      rateLimitHits: r.rate_limit_hits,
      lastUsedAt: r.last_used_at,
      providerSpecificData: r.provider_specific_data ? JSON.parse(r.provider_specific_data) : undefined,
    }));
  }

  public static getAccountById(id: string): (ProviderAccount & { rawApiKey: string }) | undefined {
    const db = getDatabase();
    const r = db.get<any>("SELECT * FROM provider_accounts WHERE id = ?", id);
    if (!r) return undefined;
    return {
      id: r.id,
      providerId: r.provider_id,
      name: r.name,
      apiKeyEncrypted: r.api_key_encrypted,
      rawApiKey: CryptoVault.decrypt(r.api_key_encrypted),
      isActive: Boolean(r.is_active),
      rateLimitHits: r.rate_limit_hits,
      lastUsedAt: r.last_used_at,
      providerSpecificData: r.provider_specific_data ? JSON.parse(r.provider_specific_data) : undefined,
    };
  }

  public static addAccount(account: {
    id: string;
    providerId: string;
    name: string;
    rawApiKey?: string;
    providerSpecificData?: Record<string, any>;
  }): void {
    const provider = this.ensureProviderExists(account.providerId, account.name);
    const db = getDatabase();
    const rawKey = account.rawApiKey || "";
    const encryptedKey = CryptoVault.encrypt(rawKey);
    const now = Date.now();
    const psdJson = account.providerSpecificData ? JSON.stringify(account.providerSpecificData) : null;

    db.run(
      `INSERT INTO provider_accounts (id, provider_id, name, api_key_encrypted, is_active, rate_limit_hits, created_at, provider_specific_data)
       VALUES (?, ?, ?, ?, 1, 0, ?, ?)`,
      account.id,
      provider.id,
      account.name,
      encryptedKey,
      now,
      psdJson
    );
  }

  public static bulkAddAccounts(
    accounts: Array<{
      id: string;
      providerId: string;
      name: string;
      rawApiKey?: string;
      providerSpecificData?: Record<string, any>;
    }>
  ): void {
    const db = getDatabase();
    const now = Date.now();
    for (const acc of accounts) {
      const provider = this.ensureProviderExists(acc.providerId, acc.name);
      const rawKey = acc.rawApiKey || "";
      const encryptedKey = CryptoVault.encrypt(rawKey);
      const psdJson = acc.providerSpecificData ? JSON.stringify(acc.providerSpecificData) : null;
      db.run(
        `INSERT INTO provider_accounts (id, provider_id, name, api_key_encrypted, is_active, rate_limit_hits, created_at, provider_specific_data)
         VALUES (?, ?, ?, ?, 1, 0, ?, ?)`,
        acc.id,
        provider.id,
        acc.name,
        encryptedKey,
        now,
        psdJson
      );
    }
  }

  public static updateAccount(
    id: string,
    updates: {
      name?: string;
      rawApiKey?: string;
      isActive?: boolean;
      providerSpecificData?: Record<string, any>;
    }
  ): void {
    const db = getDatabase();
    const existing = db.get<any>("SELECT * FROM provider_accounts WHERE id = ?", id);
    if (!existing) return;

    const newEncryptedKey = updates.rawApiKey !== undefined ? CryptoVault.encrypt(updates.rawApiKey) : existing.api_key_encrypted;
    const newName = updates.name !== undefined ? updates.name : existing.name;
    const newIsActive = updates.isActive !== undefined ? (updates.isActive ? 1 : 0) : existing.is_active;
    const newPsd = updates.providerSpecificData !== undefined
      ? JSON.stringify(updates.providerSpecificData)
      : existing.provider_specific_data;

    db.run(
      `UPDATE provider_accounts
       SET name = ?, api_key_encrypted = ?, is_active = ?, provider_specific_data = ?
       WHERE id = ?`,
      newName,
      newEncryptedKey,
      newIsActive,
      newPsd,
      id
    );
  }

  public static deleteAccount(id: string): void {
    const db = getDatabase();
    db.run("DELETE FROM provider_accounts WHERE id = ?", id);
  }

  public static recordAccountUsed(id: string): void {
    const db = getDatabase();
    db.run("UPDATE provider_accounts SET last_used_at = ? WHERE id = ?", Date.now(), id);
  }

  public static toggleAccount(accountId: string, isActive?: boolean): void {
    const db = getDatabase();
    if (isActive !== undefined) {
      db.run("UPDATE provider_accounts SET is_active = ? WHERE id = ?", isActive ? 1 : 0, accountId);
    } else {
      db.run("UPDATE provider_accounts SET is_active = CASE WHEN is_active = 1 THEN 0 ELSE 1 END WHERE id = ?", accountId);
    }
  }

  public static reorderAccounts(accountIds: string[]): void {
    const db = getDatabase();
    accountIds.forEach((id, index) => {
      db.run("UPDATE provider_accounts SET rate_limit_hits = ? WHERE id = ?", index, id);
    });
  }

  public static recordRateLimitHit(id: string): void {
    const db = getDatabase();
    db.run("UPDATE provider_accounts SET rate_limit_hits = rate_limit_hits + 1 WHERE id = ?", id);
  }

  public static resetRateLimitHits(providerId: string): void {
    const db = getDatabase();
    db.run("UPDATE provider_accounts SET rate_limit_hits = 0 WHERE provider_id = ?", providerId);
  }
}
