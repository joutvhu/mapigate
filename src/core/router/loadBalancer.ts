import { ProviderRepository } from "../../storage/repositories/providerRepo.js";
import { getRegistryProvider } from "../../shared/constants/providerRegistry.js";
import type { ProviderAccount } from "../../shared/types/index.js";
import {
  cooldownManager,
  modelLockoutManager,
  getProviderCircuitBreaker,
  isRateLimitOrQuotaError,
} from "../resilience/index.js";

export { isRateLimitOrQuotaError };

export interface CooldownEntry {
  until: number;
}

export interface PickAccountOptions {
  excludeAccountIds?: Set<string> | string[];
  healthyOnly?: boolean;
  prefixHash?: string;
  targetModel?: string;
}

export class LoadBalancer {
  private static stickyCounts: Map<string, { accountId: string; count: number }> = new Map();

  /**
   * Pick an active account with strategy, sticky limit, and rate-limit cooldown filtering.
   * Supports excluding already-tried accounts for intra-provider failover.
   * Checks provider circuit breaker, account cooldowns, and model lockouts.
   */
  public static pickAccount(
    providerId: string,
    excludeOrOptions?: Set<string> | string[] | PickAccountOptions
  ): (ProviderAccount & { rawApiKey: string }) | undefined {
    // 1. Layer 1 Check: Provider Circuit Breaker
    const cb = getProviderCircuitBreaker(providerId);
    if (!cb.canExecute()) {
      return undefined;
    }

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
    let targetModel: string | undefined;

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
        targetModel = excludeOrOptions.targetModel;
      }
    }

    const eligibleAccounts = excludeSet
      ? allAccounts.filter((acc) => !excludeSet.has(acc.id))
      : allAccounts;

    if (eligibleAccounts.length === 0) return undefined;

    const providerConfig = ProviderRepository.getProviderById(providerId);
    const strategy = providerConfig?.strategy || "round-robin";
    const stickyLimit = providerConfig?.stickyLimit || 1;

    // Filter out accounts currently under cooldown or with target model locked
    const available = eligibleAccounts.filter((acc) => {
      if (cooldownManager.isAccountInCooldown(acc.id)) {
        return false;
      }
      if (targetModel && modelLockoutManager.isModelLocked(providerId, acc.id, targetModel)) {
        return false;
      }
      return true;
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
        const cdA = cooldownManager.getCooldownRemainingMs(a.id);
        const cdB = cooldownManager.getCooldownRemainingMs(b.id);
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
   * Mark an account as rate limited with a cooldown period (default 60s).
   * Legacy facade method delegating to cooldownManager.
   */
  public static markRateLimited(
    accountId: string,
    cooldownMs: number = 60_000,
    providerId?: string
  ): void {
    cooldownManager.markRateLimited(accountId, cooldownMs, providerId);
    ProviderRepository.recordRateLimitHit(accountId);

    // If this account was sticky, clear sticky count so next selection moves on
    for (const [pId, entry] of this.stickyCounts.entries()) {
      if (entry.accountId === accountId || pId === providerId) {
        this.stickyCounts.delete(pId);
      }
    }
  }

  public static isAccountInCooldown(accountId: string): boolean {
    return cooldownManager.isAccountInCooldown(accountId);
  }

  public static getCooldownRemainingMs(accountId: string): number {
    return cooldownManager.getCooldownRemainingMs(accountId);
  }

  public static clearCooldowns(): void {
    cooldownManager.clearCooldowns();
  }

  public static clearStickyCounts(): void {
    this.stickyCounts.clear();
  }

  public static reset(): void {
    cooldownManager.reset();
    this.stickyCounts.clear();
  }
}
