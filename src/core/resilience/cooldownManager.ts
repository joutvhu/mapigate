/**
 * Connection Cooldown Manager
 * Layer 2 of the Resilience Engine.
 * Manages account-level rate limits, exponential backoff with bounded AWS Decorrelated Jitter,
 * and permanent terminal states for invalid or banned credentials.
 */

import type { CooldownEntry } from "./types.js";

const DEFAULT_BASE_MS = 3_000;
const DEFAULT_CAP_MS = 60_000;
const ONE_YEAR_MS = 365 * 24 * 3_600_000;

/**
 * Calculates backoff with bounded Decorrelated Jitter (AWS Architecture pattern):
 * sleep = min(cap, random_between(base, sleep * 3))
 * Guarantees returned value is strictly within [baseMs, capMs].
 */
export function calculateDecorrelatedJitter(
  currentSleepMs: number,
  baseMs: number = DEFAULT_BASE_MS,
  capMs: number = DEFAULT_CAP_MS
): number {
  const min = Math.max(100, baseMs);
  const effectiveCap = Math.max(min, capMs);
  const prevSleep = currentSleepMs > 0 ? currentSleepMs : min;
  const max = Math.min(effectiveCap, Math.max(min, prevSleep * 3));

  const jittered = min + Math.random() * (max - min);
  return Math.floor(Math.min(effectiveCap, Math.max(min, jittered)));
}

/**
 * Predicate to evaluate whether an error represents a permanent terminal state for an account
 * (e.g. invalid API key, banned or revoked credential) that should never self-recover.
 */
export function isTerminalError(status: number, errorText?: string): boolean {
  if (status === 401) {
    return true; // 401 Unauthorized indicates invalid or revoked credentials
  }

  const lower = (errorText || "").toLowerCase();
  if (status === 403) {
    if (
      lower.includes("banned") ||
      lower.includes("deactivated") ||
      lower.includes("suspended") ||
      lower.includes("revoked") ||
      lower.includes("account disabled") ||
      lower.includes("account blocked") ||
      lower.includes("key deleted") ||
      lower.includes("terminated")
    ) {
      return true;
    }
  }

  return false;
}

export class ConnectionCooldownManager {
  private cooldowns: Map<string, CooldownEntry> = new Map();
  private lastDurations: Map<string, number> = new Map();

  /**
   * Mark an account as rate limited. If a custom duration (e.g. from Retry-After)
   * is provided, it is applied directly; otherwise AWS decorrelated jitter is calculated.
   */
  public markRateLimited(
    accountId: string,
    cooldownMs?: number,
    _providerId?: string
  ): number {
    const existing = this.cooldowns.get(accountId);
    if (existing?.terminal) {
      return ONE_YEAR_MS;
    }

    const prevDuration = this.lastDurations.get(accountId) || 0;
    const duration =
      typeof cooldownMs === "number" && cooldownMs > 0
        ? cooldownMs
        : calculateDecorrelatedJitter(prevDuration);

    this.lastDurations.set(accountId, duration);
    this.cooldowns.set(accountId, {
      until: Date.now() + duration,
      failureCount: (existing?.failureCount || 0) + 1,
      lastFailureAt: Date.now(),
      terminal: false,
      reason: "rate_limit",
    });

    return duration;
  }

  /**
   * Mark an account as permanently terminal (e.g. revoked key, banned account).
   * Terminal accounts never expire lazily.
   */
  public markTerminal(accountId: string, reason: string = "terminal_credential_error"): void {
    this.cooldowns.set(accountId, {
      until: Date.now() + ONE_YEAR_MS,
      failureCount: 999,
      lastFailureAt: Date.now(),
      terminal: true,
      reason,
    });
  }

  /**
   * Record a successful call. Clears cooldown and resets backoff duration unless terminal.
   */
  public markSuccess(accountId: string): void {
    const entry = this.cooldowns.get(accountId);
    if (entry?.terminal) return;
    this.cooldowns.delete(accountId);
    this.lastDurations.delete(accountId);
  }

  /**
   * Check if an account is in cooldown with lazy expiration.
   */
  public isAccountInCooldown(accountId: string): boolean {
    const entry = this.cooldowns.get(accountId);
    if (!entry) return false;
    if (entry.terminal) return true;

    if (Date.now() >= entry.until) {
      this.cooldowns.delete(accountId);
      return false;
    }
    return true;
  }

  public isTerminal(accountId: string): boolean {
    return Boolean(this.cooldowns.get(accountId)?.terminal);
  }

  public getCooldownRemainingMs(accountId: string): number {
    const entry = this.cooldowns.get(accountId);
    if (!entry) return 0;
    if (entry.terminal) return ONE_YEAR_MS;

    const remaining = entry.until - Date.now();
    if (remaining <= 0) {
      this.cooldowns.delete(accountId);
      return 0;
    }
    return remaining;
  }

  public clearCooldowns(): void {
    for (const [id, entry] of this.cooldowns.entries()) {
      if (!entry.terminal) {
        this.cooldowns.delete(id);
        this.lastDurations.delete(id);
      }
    }
  }

  public reset(): void {
    this.cooldowns.clear();
    this.lastDurations.clear();
  }
}
