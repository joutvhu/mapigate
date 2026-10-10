import { ProviderRepository } from "../../storage/repositories/providerRepo.js";
import type { ProviderAccount } from "../../shared/types/index.js";

interface CooldownEntry {
  until: number;
}

export class LoadBalancer {
  private static cooldowns: Map<string, CooldownEntry> = new Map();
  private static stickyCounts: Map<string, { accountId: string; count: number }> = new Map();

  /**
   * Pick an active account with strategy, sticky limit, and rate-limit cooldown filtering
   */
  public static pickAccount(
    providerId: string
  ): (ProviderAccount & { rawApiKey: string }) | undefined {
    const allAccounts = ProviderRepository.getAccountsByProvider(providerId);
    if (allAccounts.length === 0) return undefined;

    const providerConfig = ProviderRepository.getProviderById(providerId);
    const strategy = providerConfig?.strategy || "round-robin";
    const stickyLimit = providerConfig?.stickyLimit || 1;

    const now = Date.now();
    // Filter out accounts currently under cooldown
    const available = allAccounts.filter((acc) => {
      const cd = this.cooldowns.get(acc.id);
      if (!cd) return true;
      if (now >= cd.until) {
        this.cooldowns.delete(acc.id);
        return true;
      }
      return false;
    });

    const pool = available.length > 0 ? available : allAccounts;

    let chosen: (ProviderAccount & { rawApiKey: string }) | undefined;

    if (strategy === "fill-first") {
      // Pick first active account in priority order
      chosen = pool[0];
    } else if (strategy === "earliest-reset") {
      // Prioritize account whose cooldown expires soonest (or least rate limit hits)
      pool.sort((a, b) => {
        const cdA = this.cooldowns.get(a.id)?.until || 0;
        const cdB = this.cooldowns.get(b.id)?.until || 0;
        if (cdA !== cdB) return cdA - cdB;
        return a.rateLimitHits - b.rateLimitHits;
      });
      chosen = pool[0];
    } else {
      // Round-robin with sticky limit support
      const sticky = this.stickyCounts.get(providerId);
      const currentStickyAcc = sticky ? pool.find((a) => a.id === sticky.accountId) : undefined;

      if (currentStickyAcc && sticky && sticky.count < stickyLimit) {
        sticky.count += 1;
        chosen = currentStickyAcc;
      } else {
        // Pick least recently used
        pool.sort((a, b) => (a.lastUsedAt || 0) - (b.lastUsedAt || 0));
        chosen = pool[0];
        if (chosen) {
          this.stickyCounts.set(providerId, { accountId: chosen.id, count: 1 });
        }
      }
    }

    if (chosen) {
      ProviderRepository.recordAccountUsed(chosen.id);
    }

    return chosen;
  }

  /**
   * Mark an account as rate limited with a cooldown period (default 60s)
   */
  public static markRateLimited(accountId: string, cooldownMs: number = 60_000): void {
    this.cooldowns.set(accountId, { until: Date.now() + cooldownMs });
    ProviderRepository.recordRateLimitHit(accountId);
  }
}
