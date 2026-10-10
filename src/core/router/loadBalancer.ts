import { ProviderRepository } from "../../storage/repositories/providerRepo.js";
import type { ProviderAccount } from "../../shared/types/index.js";

interface CooldownEntry {
  until: number;
}

export class LoadBalancer {
  private static cooldowns: Map<string, CooldownEntry> = new Map();

  /**
   * Pick an active account with round-robin and rate-limit cooldown filtering
   */
  public static pickAccount(
    providerId: string
  ): (ProviderAccount & { rawApiKey: string }) | undefined {
    const allAccounts = ProviderRepository.getAccountsByProvider(providerId);
    if (allAccounts.length === 0) return undefined;

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

    // Pick the least recently used account
    pool.sort((a, b) => (a.lastUsedAt || 0) - (b.lastUsedAt || 0));
    const chosen = pool[0];

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
