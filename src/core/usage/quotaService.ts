import { ProviderRepository } from "../../storage/repositories/providerRepo.js";
import type { AccountQuotaResult, NormalizedQuotaItem } from "./types.js";
import { formatResetTime, parseResetTime, sortNormalizedQuotas } from "./utils.js";
import { ensureFreshCredentials } from "./tokenHelper.js";
import { fetchRawQuotaForProvider } from "./handlers/index.js";

const DEFAULT_CACHE_TTL_MS = 60_000; // 60s cache
const CLAUDE_CACHE_TTL_MS = 600_000; // 10 min cache for Claude
const ACCOUNT_TIMEOUT_MS = 8_000; // 8-second per-account timeout

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
   * Returns cached quota result for a specific account from in-memory cache if not expired.
   */
  public getCachedQuota(accountId: string): AccountQuotaResult | null {
    const cached = this.cache.get(accountId);
    if (cached && cached.expiresAt > Date.now() && cached.data) {
      return cached.data;
    }
    return null;
  }

  /**
   * Fetches normalized quota for a single account with an 8-second timeout
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

    // 1. Check in-memory cache unless force
    const cached = this.cache.get(accountId);
    if (!force && cached && cached.expiresAt > Date.now()) {
      // Keep isActive in sync with database in case user toggled it
      return {
        ...cached.data,
        isActive: account.isActive,
      };
    }

    // 2. Check DB cached quotas unless force
    if (!force && account.cachedQuotas) {
      try {
        const dbCached = JSON.parse(account.cachedQuotas) as AccountQuotaResult;
        if (dbCached && Array.isArray(dbCached.quotas)) {
          this.cache.set(accountId, {
            data: { ...dbCached, isActive: account.isActive },
            expiresAt: Date.now() + DEFAULT_CACHE_TTL_MS,
          });
          return {
            ...dbCached,
            isActive: account.isActive,
          };
        }
      } catch {
        // Fallback to fresh network fetch
      }
    }

    const fetchCore = async (): Promise<AccountQuotaResult> => {
      // 1. Ensure token is refreshed if expired
      const freshCreds = await ensureFreshCredentials(
        account.id,
        account.providerId,
        account.rawApiKey,
        account.providerSpecificData
      );

      const isGitHubOrCopilot =
        account.providerId.toLowerCase() === "github" ||
        account.providerId.toLowerCase() === "copilot";
      const effectiveToken =
        isGitHubOrCopilot && freshCreds.githubAccessToken
          ? freshCreds.githubAccessToken
          : (freshCreds.accessToken || freshCreds.apiKey || account.rawApiKey);

      const resolvedAccount = {
        ...account,
        rawApiKey: effectiveToken,
        githubAccessToken: freshCreds.githubAccessToken,
        projectId: freshCreds.projectId || freshCreds.providerSpecificData?.projectId,
        providerSpecificData: {
          ...freshCreds.providerSpecificData,
          ...(freshCreds.githubAccessToken ? { githubAccessToken: freshCreds.githubAccessToken } : {}),
          ...(freshCreds.projectId ? { projectId: freshCreds.projectId } : {}),
        },
      };

      // 2. Query provider quota handler
      let rawResult = await fetchRawQuotaForProvider({
        providerId: account.providerId,
        account: resolvedAccount,
        force,
      });

      // If provider returned auth-expired / rejected, force refresh credentials once and retry
      const isAuthError = Boolean(
        rawResult.error?.includes("401") ||
        rawResult.error?.includes("403") ||
        rawResult.message?.toLowerCase().includes("expired") ||
        rawResult.message?.toLowerCase().includes("unauthorized") ||
        rawResult.message?.toLowerCase().includes("rejected")
      );

      if (isAuthError && (freshCreds.refreshToken || account.providerSpecificData?.refreshToken)) {
        try {
          const retriedCreds = await ensureFreshCredentials(
            account.id,
            account.providerId,
            account.rawApiKey,
            account.providerSpecificData,
            true // force refresh!
          );
          const retriedEffectiveToken =
            isGitHubOrCopilot && retriedCreds.githubAccessToken
              ? retriedCreds.githubAccessToken
              : (retriedCreds.accessToken || retriedCreds.apiKey || resolvedAccount.rawApiKey);

          if (retriedEffectiveToken) {
            resolvedAccount.rawApiKey = retriedEffectiveToken;
            resolvedAccount.githubAccessToken = retriedCreds.githubAccessToken;
            resolvedAccount.providerSpecificData = {
              ...resolvedAccount.providerSpecificData,
              ...retriedCreds.providerSpecificData,
            };
            rawResult = await fetchRawQuotaForProvider({
              providerId: account.providerId,
              account: resolvedAccount,
              force: true,
            });
          }
        } catch {
          // Keep original rawResult
        }
      }

      // 3. Normalize quota buckets into UI-friendly list
      const quotas: NormalizedQuotaItem[] = [];

      if (rawResult.quotas) {
        for (const [key, bucket] of Object.entries(rawResult.quotas)) {
          // If antigravity, filter strictly to the recognized summary buckets
          if (account.providerId.toLowerCase() === "antigravity") {
            const allowedAntigravityKeys = [
              "gemini_session",
              "gemini_weekly",
              "claude_gpt_session",
              "claude_gpt_weekly",
              "gemini_4_argon_session",
              "gemini_4_argon_weekly",
            ];
            const allowedLabels = [
              "gemini (5h)",
              "gemini (weekly)",
              "claude & gpt (5h)",
              "claude & gpt (weekly)",
              "gemini 4 argon (5h)",
              "gemini 4 argon (weekly)",
            ];
            const isAllowed =
              allowedAntigravityKeys.includes(key.toLowerCase()) ||
              allowedLabels.includes((bucket.displayName || "").toLowerCase());
            if (!isAllowed) {
              continue;
            }
          }

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

      // Sort quotas into fixed deterministic order
      const sortedQuotas = sortNormalizedQuotas(account.providerId, quotas);

      const result: AccountQuotaResult = {
        accountId: account.id,
        providerId: account.providerId,
        accountName: account.name,
        plan: rawResult.plan || "Standard",
        isActive: account.isActive,
        quotas: sortedQuotas,
        lastFetchedAt: Date.now(),
        error: rawResult.error,
        message: rawResult.message,
        providerSpecificData: account.providerSpecificData,
        sortOrder: account.sortOrder ?? 0,
        createdAt: account.createdAt,
      };

      const ttl =
        account.providerId.toLowerCase() === "claude"
          ? CLAUDE_CACHE_TTL_MS
          : DEFAULT_CACHE_TTL_MS;

      this.cache.set(accountId, {
        data: result,
        expiresAt: Date.now() + ttl,
      });

      // Persist to SQLite database for instant retrieval on next startup
      try {
        ProviderRepository.updateCachedQuota(
          accountId,
          JSON.stringify(result),
          result.lastFetchedAt
        );
      } catch (err) {
        console.warn(`[QuotaService] Failed to persist cached quota for ${accountId}:`, err);
      }

      return result;
    };

    let timer: NodeJS.Timeout | null = null;
    const timeoutPromise = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        reject(new Error("Quota request timed out after 8 seconds"));
      }, ACCOUNT_TIMEOUT_MS);
      timer.unref?.();
    });

    try {
      return await Promise.race([fetchCore(), timeoutPromise]);
    } catch (err: any) {
      let previousQuotas: NormalizedQuotaItem[] = [];
      try {
        const cached =
          this.cache.get(account.id)?.data ||
          (account.cachedQuotas ? JSON.parse(account.cachedQuotas) : null);
        if (cached && Array.isArray(cached.quotas) && cached.quotas.length > 0) {
          previousQuotas = cached.quotas;
        }
      } catch {}

      const errorResult: AccountQuotaResult = {
        accountId: account.id,
        providerId: account.providerId,
        accountName: account.name,
        plan: "Standard",
        isActive: account.isActive,
        quotas: previousQuotas,
        lastFetchedAt: Date.now(),
        error: err?.message || "Failed to fetch quota",
        providerSpecificData: account.providerSpecificData,
        sortOrder: account.sortOrder ?? 0,
        createdAt: account.createdAt,
      };

      return errorResult;
    } finally {
      if (timer) {
        clearTimeout(timer);
      }
    }
  }

  /**
   * Immediately returns all cached quota results from SQLite / memory for all accounts without waiting for network.
   */
  public getCachedQuotasForAllAccounts(): AccountQuotaResult[] {
    const accounts = ProviderRepository.getAllAccounts();
    return accounts.map((acc, idx) => {
      const memoryHit = this.cache.get(acc.id);
      if (memoryHit?.data) {
        return {
          ...memoryHit.data,
          isActive: acc.isActive,
          sortOrder: acc.sortOrder ?? idx,
          createdAt: acc.createdAt,
        };
      }
      if (acc.cachedQuotas) {
        try {
          const parsed = JSON.parse(acc.cachedQuotas) as AccountQuotaResult;
          if (parsed && Array.isArray(parsed.quotas)) {
            return {
              ...parsed,
              isActive: acc.isActive,
              sortOrder: acc.sortOrder ?? idx,
              createdAt: acc.createdAt,
            };
          }
        } catch {}
      }
      return {
        accountId: acc.id,
        providerId: acc.providerId,
        accountName: acc.name,
        plan: "Standard",
        isActive: acc.isActive,
        quotas: [],
        lastFetchedAt: acc.quotaFetchedAt || Date.now(),
        sortOrder: acc.sortOrder ?? idx,
        createdAt: acc.createdAt,
      };
    });
  }

  /**
   * Fetches quotas for all accounts in SQLite with isolated error boundaries.
   * If force=false and cached results exist, returns them immediately (0ms) and revalidates in the background.
   */
  public async fetchQuotaForAllAccounts(force = false): Promise<AccountQuotaResult[]> {
    const accounts = ProviderRepository.getAllAccounts();
    if (accounts.length === 0) return [];

    // Stale-While-Revalidate: return SQLite cached results immediately if available
    if (!force) {
      const cachedList = this.getCachedQuotasForAllAccounts();
      const hasAnyQuotas = cachedList.some((c) => c.quotas && c.quotas.length > 0);
      if (hasAnyQuotas) {
        // Asynchronously revalidate in background without blocking response
        Promise.all(
          accounts.map((acc) => this.fetchQuotaForAccount(acc.id, true).catch(() => null))
        ).catch(() => {});

        return cachedList;
      }
    }

    const promises = accounts.map((acc, idx) =>
      this.fetchQuotaForAccount(acc.id, force).catch((err) => ({
        accountId: acc.id,
        providerId: acc.providerId,
        accountName: acc.name,
        plan: "Standard",
        isActive: acc.isActive,
        quotas: [],
        lastFetchedAt: Date.now(),
        error: err?.message || "Failed to fetch quota",
        sortOrder: acc.sortOrder ?? idx,
        createdAt: acc.createdAt,
      }))
    );

    return await Promise.all(promises);
  }

  /**
   * Refreshes a batch of accounts (or all accounts if list is empty) with isolated error boundaries
   */
  public async batchRefresh(accountIds?: string[]): Promise<AccountQuotaResult[]> {
    if (accountIds && accountIds.length > 0) {
      const promises = accountIds.map((id) =>
        this.fetchQuotaForAccount(id, true).catch((err) => {
          const acc = ProviderRepository.getAccountById(id);
          return {
            accountId: id,
            providerId: acc?.providerId || "unknown",
            accountName: acc?.name || "Unknown",
            plan: "Standard",
            isActive: acc?.isActive ?? true,
            quotas: [],
            lastFetchedAt: Date.now(),
            error: err?.message || "Failed to fetch quota",
          };
        })
      );
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
