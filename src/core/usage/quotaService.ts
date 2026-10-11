import { ProviderRepository } from "../../storage/repositories/providerRepo.js";
import type { AccountQuotaResult, NormalizedQuotaItem } from "./types.js";
import { formatResetTime, parseResetTime } from "./utils.js";
import { ensureFreshCredentials } from "./tokenHelper.js";
import { fetchRawQuotaForProvider } from "./handlers/index.js";

const DEFAULT_CACHE_TTL_MS = 60_000; // 60s cache
const CLAUDE_CACHE_TTL_MS = 600_000; // 10 min cache for Claude

interface CacheEntry {
  data: AccountQuotaResult;
  expiresAt: number;
}

export class QuotaService {
  private static instance: QuotaService | null = null;
  private cache: Map<string, CacheEntry> = new Map();

  public static getInstance(): QuotaService {
    if (!this.instance) {
      this.instance = new QuotaService();
    }
    return this.instance;
  }

  /**
   * Fetches normalized quota for a single account
   */
  public async fetchQuotaForAccount(
    accountId: string,
    force = false
  ): Promise<AccountQuotaResult> {
    const account = ProviderRepository.getAccountById(accountId);
    if (!account) {
      return {
        accountId,
        providerId: "unknown",
        accountName: "Unknown",
        plan: "Unknown",
        isActive: false,
        quotas: [],
        lastFetchedAt: Date.now(),
        error: `Account ${accountId} not found`,
      };
    }

    // Check cache unless force
    const cached = this.cache.get(accountId);
    if (!force && cached && cached.expiresAt > Date.now()) {
      // Keep isActive in sync with database in case user toggled it
      return {
        ...cached.data,
        isActive: account.isActive,
      };
    }

    try {
      // 1. Ensure token is refreshed if expired
      const freshCreds = await ensureFreshCredentials(
        account.id,
        account.providerId,
        account.rawApiKey,
        account.providerSpecificData
      );

      const resolvedAccount = {
        ...account,
        rawApiKey: freshCreds.accessToken || freshCreds.apiKey || account.rawApiKey,
        providerSpecificData: freshCreds.providerSpecificData,
      };

      // 2. Query provider quota handler
      const rawResult = await fetchRawQuotaForProvider({
        providerId: account.providerId,
        account: resolvedAccount,
        force,
      });

      // 3. Normalize quota buckets into UI-friendly list
      const quotas: NormalizedQuotaItem[] = [];

      if (rawResult.quotas) {
        for (const [key, bucket] of Object.entries(rawResult.quotas)) {
          const used = Math.max(0, bucket.used ?? 0);
          const total = Math.max(0, bucket.total ?? 100);
          const resetAt = parseResetTime(bucket.resetAt);

          let remainingPercentage = 0;
          if (bucket.remainingPercentage !== undefined) {
            remainingPercentage = Math.max(0, Math.min(100, Math.round(bucket.remainingPercentage)));
          } else if (total > 0) {
            remainingPercentage = Math.max(0, Math.min(100, Math.round(((total - used) / total) * 100)));
          }

          const label = bucket.displayName || key;
          const resetInText = formatResetTime(resetAt);

          quotas.push({
            label,
            used,
            total,
            remainingPercentage,
            resetAt,
            resetInText,
            unlimited: Boolean(bucket.unlimited),
            recurring: bucket.recurring !== false,
          });
        }
      }

      const result: AccountQuotaResult = {
        accountId: account.id,
        providerId: account.providerId,
        accountName: account.name,
        plan: rawResult.plan || "Standard",
        isActive: account.isActive,
        quotas,
        lastFetchedAt: Date.now(),
        error: rawResult.error,
        message: rawResult.message,
      };

      const ttl =
        account.providerId.toLowerCase() === "claude"
          ? CLAUDE_CACHE_TTL_MS
          : DEFAULT_CACHE_TTL_MS;

      this.cache.set(accountId, {
        data: result,
        expiresAt: Date.now() + ttl,
      });

      return result;
    } catch (err: any) {
      const errorResult: AccountQuotaResult = {
        accountId: account.id,
        providerId: account.providerId,
        accountName: account.name,
        plan: "Standard",
        isActive: account.isActive,
        quotas: [],
        lastFetchedAt: Date.now(),
        error: err.message || "Failed to fetch quota",
      };

      return errorResult;
    }
  }

  /**
   * Fetches quotas for all accounts in SQLite
   */
  public async fetchQuotaForAllAccounts(force = false): Promise<AccountQuotaResult[]> {
    const accounts = ProviderRepository.getAllAccounts();
    if (accounts.length === 0) return [];

    const promises = accounts.map((acc) =>
      this.fetchQuotaForAccount(acc.id, force).catch((err) => ({
        accountId: acc.id,
        providerId: acc.providerId,
        accountName: acc.name,
        plan: "Standard",
        isActive: acc.isActive,
        quotas: [],
        lastFetchedAt: Date.now(),
        error: err.message || "Failed to fetch quota",
      }))
    );

    return await Promise.all(promises);
  }

  /**
   * Refreshes a batch of accounts (or all accounts if list is empty)
   */
  public async batchRefresh(accountIds?: string[]): Promise<AccountQuotaResult[]> {
    if (accountIds && accountIds.length > 0) {
      const promises = accountIds.map((id) => this.fetchQuotaForAccount(id, true));
      return await Promise.all(promises);
    }
    return await this.fetchQuotaForAllAccounts(true);
  }

  /**
   * Bulk toggles active state in SQLite and synchronizes cache
   */
  public bulkToggle(accountIds: string[], isActive: boolean): void {
    ProviderRepository.bulkToggleAccounts(accountIds, isActive);
    for (const id of accountIds) {
      const cached = this.cache.get(id);
      if (cached) {
        cached.data.isActive = isActive;
      }
    }
  }

  /**
   * Toggles a single account active state
   */
  public toggleAccount(accountId: string, isActive?: boolean): boolean {
    const account = ProviderRepository.getAccountById(accountId);
    if (!account) return false;

    const nextState = isActive !== undefined ? isActive : !account.isActive;
    ProviderRepository.toggleAccount(accountId, nextState);

    const cached = this.cache.get(accountId);
    if (cached) {
      cached.data.isActive = nextState;
    }
    return nextState;
  }

  /**
   * Clears in-memory cache
   */
  public clearCache(): void {
    this.cache.clear();
  }
}
