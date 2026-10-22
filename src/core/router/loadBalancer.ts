import { ProviderRepository } from "../../storage/repositories/providerRepo.js";
import { getRegistryProvider } from "../../shared/constants/providerRegistry.js";
import type { ProviderAccount } from "../../shared/types/index.js";
import {
  cooldownManager,
  modelLockoutManager,
  getProviderCircuitBreaker,
  isRateLimitOrQuotaError,
} from "../resilience/index.js";
import { pickAffinityAccount } from "../caching/promptCacheAffinity.js";

export { isRateLimitOrQuotaError };

export interface CooldownEntry {
  until: number;
}

export interface PickAccountOptions {
  excludeAccountIds?: Set<string> | string[];
  healthyOnly?: boolean;
  prefixHash?: string;
  targetModel?: string;
  sessionId?: string;
}

const SESSION_STICKINESS_TTL_MS = 60 * 60 * 1000; // 1 hour

interface SessionStickinessEntry {
  accountId: string;
  lastUsedAt: number;
}

export class LoadBalancer {
  private static stickyCounts: Map<string, { accountId: string; count: number }> = new Map();
  private static sessionAccountMap: Map<string, SessionStickinessEntry> = new Map();

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
    if (cb.getState() === "OPEN") {
      return undefined;
    }

    const allAccounts = ProviderRepository.getAccountsByProvider(providerId);
    if (allAccounts.length === 0) {
      const reg = getRegistryProvider(providerId);
      const isNoKey =
        Boolean(reg?.noAuth) ||
        reg?.requiresApiKey === false ||
        reg?.authType === "none" ||
        providerId === "opencode" ||
        providerId === "oc";

      if (isNoKey) {
        const isOC = providerId === "opencode" || providerId === "oc";
        return {
          id: isOC ? "acc_opencode_free" : `acc_${reg?.id || providerId}_default`,
          providerId: reg?.id || providerId,
          name: isOC ? "OpenCode Free (Public)" : `${reg?.name || providerId} (Default)`,
          apiKeyEncrypted: "",
          rawApiKey: isOC ? "public" : "",
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
    let prefixHash: string | undefined;
    let sessionId: string | undefined;

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
        prefixHash = excludeOrOptions.prefixHash;
        sessionId = excludeOrOptions.sessionId;
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

    // Session Stickiness: 100% Affinity for active sessions with healthy accounts
    if (sessionId) {
      const stickyAccId = this.getStickyAccountId(providerId, sessionId);
      if (stickyAccId) {
        const found = pool.find((a) => a.id === stickyAccId);
        if (found) {
          this.setStickyAccount(providerId, sessionId, found.id);
          ProviderRepository.recordAccountUsed(found.id);
          return found;
        }
      }
    }

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
    } else if (prefixHash && pool.length > 1) {
      // Prompt Cache Affinity: only invoke when strategy is round-robin (or default)
      chosen = pickAffinityAccount(pool, prefixHash);
    }

    if (!chosen) {
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
      if (sessionId) {
        this.setStickyAccount(providerId, sessionId, chosen.id);
      }
      ProviderRepository.recordAccountUsed(chosen.id);
    }

    return chosen;
  }

  public static getSessionKey(providerId: string, sessionId: string): string {
    return `${providerId}:${sessionId}`;
  }

  public static getStickyAccountId(providerId: string, sessionId: string): string | undefined {
    if (!sessionId) return undefined;
    const key = this.getSessionKey(providerId, sessionId);
    const entry = this.sessionAccountMap.get(key);
    if (!entry) return undefined;
    if (Date.now() - entry.lastUsedAt > SESSION_STICKINESS_TTL_MS) {
      this.sessionAccountMap.delete(key);
      return undefined;
    }
    return entry.accountId;
  }

  public static setStickyAccount(providerId: string, sessionId: string, accountId: string): void {
    if (!sessionId || !accountId) return;
    const key = this.getSessionKey(providerId, sessionId);
    this.sessionAccountMap.set(key, { accountId, lastUsedAt: Date.now() });
  }

  public static clearSessionStickiness(sessionId?: string, providerId?: string): void {
    if (sessionId && providerId) {
      this.sessionAccountMap.delete(this.getSessionKey(providerId, sessionId));
    } else if (sessionId) {
      for (const key of this.sessionAccountMap.keys()) {
        if (key.endsWith(`:${sessionId}`)) {
          this.sessionAccountMap.delete(key);
        }
      }
    } else if (providerId) {
      for (const key of this.sessionAccountMap.keys()) {
        if (key.startsWith(`${providerId}:`)) {
          this.sessionAccountMap.delete(key);
        }
      }
    } else {
      this.sessionAccountMap.clear();
    }
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

    // Clear session stickiness for this account so active sessions failover to healthy accounts
    for (const [sKey, entry] of this.sessionAccountMap.entries()) {
      if (entry.accountId === accountId) {
        this.sessionAccountMap.delete(sKey);
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
    this.sessionAccountMap.clear();
  }
}
