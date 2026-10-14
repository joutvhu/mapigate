/**
 * Model Lockout Manager
 * Layer 3 of the Resilience Engine.
 * Manages model-scoped lockouts (e.g. 404 model not found, context length exceeded, Anthropic 529 model overload)
 * without blacklisting the entire account or provider.
 * Features:
 * - 120s initial lockout with exponential backoff
 * - Success-decay halving the failure count on subsequent successful calls
 * - Lazy expiration on read
 */

import type { ModelLockoutEntry } from "./types.js";

const INITIAL_LOCKOUT_MS = 120_000; // 120s initial lockout
const MAX_LOCKOUT_MS = 3_600_000; // 1 hour ceiling

/**
 * Predicate to evaluate whether an error is scoped specifically to a model/account combination
 * (e.g. 404 model not found, context length exceeded, or model capacity 529) rather than
 * a provider outage or general rate limit.
 */
export function isModelScopedError(status: number, errorText?: string): boolean {
  if (status === 404 || status === 529) {
    return true;
  }

  const lower = (errorText || "").toLowerCase();
  if (!lower) return false;

  return (
    lower.includes("context_length_exceeded") ||
    lower.includes("maximum context length") ||
    lower.includes("context length") ||
    lower.includes("model not found") ||
    lower.includes("model_not_found") ||
    lower.includes("does not have access to model") ||
    lower.includes("does not have access") ||
    lower.includes("not supported for this model") ||
    lower.includes("not found for model") ||
    lower.includes("model_cap_exceeded") ||
    lower.includes("tokens exceed") ||
    lower.includes("maximum prompt length") ||
    lower.includes("unsupported model")
  );
}

export class ModelLockoutManager {
  private lockouts: Map<string, ModelLockoutEntry> = new Map();

  private buildKey(providerId: string, accountId: string, model: string): string {
    return `${providerId}:${accountId}:${model}`;
  }

  /**
   * Lock a model for a specific provider and account with exponential backoff.
   * Returns the lockout duration in milliseconds.
   */
  public lockModel(
    providerId: string,
    accountId: string,
    model: string,
    errorText?: string
  ): number {
    const key = this.buildKey(providerId, accountId, model);
    const existing = this.lockouts.get(key);

    const failureCount = (existing?.failureCount || 0) + 1;
    const duration = Math.min(
      MAX_LOCKOUT_MS,
      INITIAL_LOCKOUT_MS * Math.pow(2, failureCount - 1)
    );

    const now = Date.now();
    this.lockouts.set(key, {
      until: now + duration,
      failureCount,
      lastError: errorText,
      lockedAt: now,
    });

    return duration;
  }

  /**
   * Record a successful request for a model/account.
   * Halves the failure count (success-decay). If failure count reaches 0, removes the entry.
   */
  public recordSuccess(providerId: string, accountId: string, model: string): void {
    const key = this.buildKey(providerId, accountId, model);
    const existing = this.lockouts.get(key);
    if (!existing) return;

    const decayed = Math.floor(existing.failureCount / 2);
    if (decayed <= 0) {
      this.lockouts.delete(key);
    } else {
      existing.failureCount = decayed;
      existing.until = 0; // Model is currently operational
    }
  }

  /**
   * Checks if a model is currently locked for a given provider and account.
   */
  public isModelLocked(providerId: string, accountId: string, model: string): boolean {
    const key = this.buildKey(providerId, accountId, model);
    const entry = this.lockouts.get(key);
    if (!entry) return false;

    if (Date.now() >= entry.until) {
      return false; // Lockout has expired lazily
    }

    return true;
  }

  public getRemainingLockoutMs(providerId: string, accountId: string, model: string): number {
    const key = this.buildKey(providerId, accountId, model);
    const entry = this.lockouts.get(key);
    if (!entry) return 0;

    const remaining = entry.until - Date.now();
    return Math.max(0, remaining);
  }

  public getFailureCount(providerId: string, accountId: string, model: string): number {
    const key = this.buildKey(providerId, accountId, model);
    return this.lockouts.get(key)?.failureCount || 0;
  }

  public clear(): void {
    this.lockouts.clear();
  }

  public reset(): void {
    this.lockouts.clear();
  }
}
