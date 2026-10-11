import { ProviderRepository } from "../../storage/repositories/providerRepo.js";
import { getRegistryProvider } from "../../shared/constants/providerRegistry.js";
import type { ProviderAccount } from "../../shared/types/index.js";

export interface CooldownEntry {
  until: number;
}

export interface PickAccountOptions {
  excludeAccountIds?: Set<string> | string[];
  healthyOnly?: boolean;
}

/**
 * Evaluates whether an HTTP status code or error response text indicates
 * rate limiting or quota / balance exhaustion.
 */
export function isRateLimitOrQuotaError(status: number, errorText?: string): boolean {
  if (status === 429) return true;
  if (status === 402) return true; // Payment Required / Depleted balance

  const lower = (errorText || "").toLowerCase();
  if (!lower) return false;

  return (
    lower.includes("quota") ||
    lower.includes("rate limit") ||
    lower.includes("rate_limit") ||
    lower.includes("ratelimit") ||
    lower.includes("too many requests") ||
    lower.includes("insufficient_quota") ||
    lower.includes("insufficient balance") ||
    lower.includes("insufficient funds") ||
    lower.includes("out of credits") ||
    lower.includes("resource_exhausted") ||
    lower.includes("resource exhausted") ||
    lower.includes("overloaded") ||
    lower.includes("capacity") ||
    lower.includes("usage limit") ||
    lower.includes("credit limit")
  );
}

export class LoadBalancer {
  private static cooldowns: Map<string, CooldownEntry> = new Map();
  private static stickyCounts: Map<string, { accountId: string; count: number }> = new Map();

  /**
   * Pick an active account with strategy, sticky limit, and rate-limit cooldown filtering.
   * Supports excluding already-tried accounts for intra-provider failover.
   */
  public static pickAccount(
    providerId: string,
    excludeOrOptions?: Set<string> | string[] | PickAccountOptions
  ): (ProviderAccount & { rawApiKey: string }) | undefined {
    const allAccounts = ProviderRepository.getAccountsByProvider(providerId);
    if (allAccounts.length === 0) {
      const reg = getRegistryProvider(providerId);
      if (reg?.noAuth || providerId === "opencode" || providerId === "oc") {
        return {
          id: "acc_opencode_free",
          providerId: reg?.id || "opencode",
          name: "OpenCode Free (Public)",
          apiKeyEncrypted: "",
          rawApiKey: "public",
          isActive: true,
          rateLimitHits: 0,
          lastUsedAt: 0,
        };
      }
      return undefined;
    }

    let excludeSet: Set<string> | undefined;
    let healthyOnly = false;

    if (excludeOrOptions) {
      if (excludeOrOptions instanceof Set || Array.isArray(excludeOrOptions)) {
        excludeSet = excludeOrOptions instanceof Set ? excludeOrOptions : new Set(excludeOrOptions);
        healthyOnly = true;
      } else {
        if (excludeOrOptions.excludeAccountIds) {
          excludeSet =
            excludeOrOptions.excludeAccountIds instanceof Set
              ? excludeOrOptions.excludeAccountIds
              : new Set(excludeOrOptions.excludeAccountIds);
        }
        healthyOnly = Boolean(excludeOrOptions.healthyOnly ?? (excludeSet && excludeSet.size > 0));
      }
    }

    const eligibleAccounts = excludeSet
      ? allAccounts.filter((acc) => !excludeSet.has(acc.id))
      : allAccounts;

    if (eligibleAccounts.length === 0) return undefined;

    const providerConfig = ProviderRepository.getProviderById(providerId);
    const strategy = providerConfig?.strategy || "round-robin";
    const stickyLimit = providerConfig?.stickyLimit || 1;

    const now = Date.now();
    // Filter out accounts currently under cooldown
    const available = eligibleAccounts.filter((acc) => {
      const cd = this.cooldowns.get(acc.id);
      if (!cd) return true;
      if (now >= cd.until) {
        this.cooldowns.delete(acc.id);
        return true;
      }
      return false;
    });

    if (healthyOnly && available.length === 0) {
      return undefined;
    }

    const pool = available.length > 0 ? available : eligibleAccounts;

    let chosen: (ProviderAccount & { rawApiKey: string }) | undefined;

    if (strategy === "fill-first") {
      // Pick first active account in priority order
      chosen = pool[0];
    } else if (strategy === "earliest-reset") {
      // Prioritize account whose cooldown expires soonest (or least rate limit hits)
      const sorted = [...pool].sort((a, b) => {
        const cdA = this.cooldowns.get(a.id)?.until || 0;
        const cdB = this.cooldowns.get(b.id)?.until || 0;
        if (cdA !== cdB) return cdA - cdB;
        return a.rateLimitHits - b.rateLimitHits;
      });
      chosen = sorted[0];
    } else {
      // Round-robin with sticky limit support
      const sticky = this.stickyCounts.get(providerId);
      const currentStickyAcc = sticky ? pool.find((a) => a.id === sticky.accountId) : undefined;

      if (currentStickyAcc && sticky && sticky.count < stickyLimit) {
        sticky.count += 1;
        chosen = currentStickyAcc;
      } else {
        // Pick least recently used
        const sorted = [...pool].sort((a, b) => (a.lastUsedAt || 0) - (b.lastUsedAt || 0));
        chosen = sorted[0];
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
  public static markRateLimited(
    accountId: string,
    cooldownMs: number = 60_000,
    providerId?: string
  ): void {
    this.cooldowns.set(accountId, { until: Date.now() + cooldownMs });
    ProviderRepository.recordRateLimitHit(accountId);

    // If this account was sticky, clear sticky count so next selection moves on
    for (const [pId, entry] of this.stickyCounts.entries()) {
      if (entry.accountId === accountId || pId === providerId) {
        this.stickyCounts.delete(pId);
      }
    }
  }

  public static isAccountInCooldown(accountId: string): boolean {
    const cd = this.cooldowns.get(accountId);
    if (!cd) return false;
    if (Date.now() >= cd.until) {
      this.cooldowns.delete(accountId);
      return false;
    }
    return true;
  }

  public static getCooldownRemainingMs(accountId: string): number {
    const cd = this.cooldowns.get(accountId);
    if (!cd) return 0;
    const remaining = cd.until - Date.now();
    if (remaining <= 0) {
      this.cooldowns.delete(accountId);
      return 0;
    }
    return remaining;
  }

  public static clearCooldowns(): void {
    this.cooldowns.clear();
  }

  public static clearStickyCounts(): void {
    this.stickyCounts.clear();
  }

  public static reset(): void {
    this.cooldowns.clear();
    this.stickyCounts.clear();
  }
}
