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
      provider.priority,
      JSON.stringify(provider.models || []),
      JSON.stringify(provider.customHeaders || {}),
      provider.proxyUrl || null,
      provider.thinkingMode || "auto",
      provider.strategy || null,
      provider.stickyLimit != null ? provider.stickyLimit : 1,
      provider.createdAt,
      provider.updatedAt
    );
  }

  public static updateProviderStrategy(id: string, strategy: string | null, stickyLimit: number | null): void {
    const db = getDatabase();
    const existing = this.getProviderById(id);
    if (existing) {
      db.run(
        `UPDATE providers SET strategy = ?, sticky_limit = ?, updated_at = ? WHERE id = ?`,
        strategy,
        stickyLimit,
        Date.now(),
        id
      );
    } else {
      const reg = getRegistryProvider(id);
      const now = Date.now();
      db.run(
        `INSERT INTO providers (id, name, base_url, format, is_active, priority, models, custom_headers, proxy_url, thinking_mode, strategy, sticky_limit, created_at, updated_at)
         VALUES (?, ?, ?, ?, 1, 10, ?, ?, NULL, ?, ?, ?, ?, ?)`,
        id,
        reg?.name || id,
        reg?.baseUrl || "https://api.openai.com",
        reg?.format || "openai",
        JSON.stringify(reg?.models.map((m) => m.id) || []),
        JSON.stringify(reg?.defaultHeaders || {}),
        reg?.thinkingMode || "auto",
        strategy,
        stickyLimit,
        now,
        now
      );
    }
  }

  public static deleteProvider(id: string): void {
    const db = getDatabase();
    db.run("DELETE FROM providers WHERE id = ?", id);
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
    }));
  }

  public static addAccount(account: {
    id: string;
    providerId: string;
    name: string;
    rawApiKey: string;
  }): void {
    const db = getDatabase();
    const encryptedKey = CryptoVault.encrypt(account.rawApiKey);
    const now = Date.now();

    db.run(
      `INSERT INTO provider_accounts (id, provider_id, name, api_key_encrypted, is_active, rate_limit_hits, created_at)
       VALUES (?, ?, ?, ?, 1, 0, ?)`,
      account.id,
      account.providerId,
      account.name,
      encryptedKey,
      now
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
