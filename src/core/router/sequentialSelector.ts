import type { ProviderAccount } from "../../shared/types/index.js";
import { getAntigravityMetrics, getGenericQuotaMetrics } from "./earliestResetComparator.js";

/**
 * SequentialSelector manages stateful "Drain & Rotate" account routing.
 * It persistently uses the current account until it enters cooldown or has 0% quota remaining,
 * then advances cyclically to the next available account in the defined sequence.
 */
export class SequentialSelector {
  private static activeAccounts: Map<string, string> = new Map(); // providerId -> accountId

  public static getActiveAccountId(providerId: string): string | undefined {
    return this.activeAccounts.get(providerId);
  }

  public static setActiveAccountId(providerId: string, accountId: string): void {
    this.activeAccounts.set(providerId, accountId);
  }

  public static clear(providerId?: string): void {
    if (providerId) {
      this.activeAccounts.delete(providerId);
    } else {
      this.activeAccounts.clear();
    }
  }

  /**
   * Check whether an account is currently exhausted (0% quota)
   */
  public static isAccountExhausted(
    account: ProviderAccount,
    providerId: string,
    targetModel?: string
  ): boolean {
    const pId = providerId.toLowerCase();
    if (pId === "antigravity" || pId === "agy") {
      const m = getAntigravityMetrics(account, targetModel);
      return m.hasQuotaData && m.isExhausted;
    }
    const g = getGenericQuotaMetrics(account);
    return Boolean(g && g.hasQuotaData && g.isExhausted);
  }

  /**
   * Pick an account in sequential order (drain-to-next).
   * Stays on the current account until it enters cooldown or is exhausted (0% quota).
   * When that happens, advances to the next available account in the defined sequence.
   */
  public static pickSequentialAccount(
    providerId: string,
    pool: (ProviderAccount & { rawApiKey: string })[],
    allOrderedAccounts: ProviderAccount[],
    targetModel?: string
  ): (ProviderAccount & { rawApiKey: string }) | undefined {
    if (pool.length === 0) return undefined;
    if (pool.length === 1) {
      this.setActiveAccountId(providerId, pool[0].id);
      return pool[0];
    }

    const currentId = this.getActiveAccountId(providerId);

    // 1. If an account is currently active, check if it's still healthy in pool and not exhausted
    if (currentId) {
      const currentAcc = pool.find((a) => a.id === currentId);
      if (currentAcc && !this.isAccountExhausted(currentAcc, providerId, targetModel)) {
        return currentAcc; // Stay on current account!
      }
    }

    // 2. Current account is not set, under cooldown, or exhausted.
    // Advance cyclically to the next available account in the sequence.
    const chain = allOrderedAccounts.length > 0 ? allOrderedAccounts : pool;
    const total = chain.length;
    const currentIndex = currentId ? chain.findIndex((a) => a.id === currentId) : -1;

    const startIndex = currentIndex >= 0 ? (currentIndex + 1) % total : 0;
    for (let i = 0; i < total; i++) {
      const checkIdx = (startIndex + i) % total;
      const candidateMeta = chain[checkIdx];
      const availableCandidate = pool.find((a) => a.id === candidateMeta.id);

      if (availableCandidate && !this.isAccountExhausted(availableCandidate, providerId, targetModel)) {
        this.setActiveAccountId(providerId, availableCandidate.id);
        return availableCandidate;
      }
    }

    // 3. Fallback: if all non-cooldown candidates appear exhausted, pick the first in pool
    const fallback = pool[0];
    if (fallback) {
      this.setActiveAccountId(providerId, fallback.id);
    }
    return fallback;
  }
}
