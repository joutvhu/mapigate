/**
 * Resilience Engine Entry Point
 * Exports singletons and orchestration helpers for the 3-layer resilience architecture:
 * 1. ProviderCircuitBreaker (whole-provider infrastructure outages)
 * 2. ConnectionCooldownManager (account rate-limits & terminal states)
 * 3. ModelLockoutManager (model-scoped capability & quota errors)
 */

import { ProviderCircuitBreaker, isInfrastructureError } from "./circuitBreaker.js";
import { ConnectionCooldownManager, isTerminalError, calculateDecorrelatedJitter } from "./cooldownManager.js";
import { ModelLockoutManager, isModelScopedError } from "./modelLockout.js";
import { parseRateLimitHeaders } from "../../shared/utils/rateLimitParser.js";
import type {
  ResilienceSuccessOptions,
  ResilienceFailureOptions,
  ResilienceFailureResult,
  CircuitState,
  CircuitBreakerState,
  ProviderBreakerProfile,
  CooldownEntry,
  ModelLockoutEntry,
} from "./types.js";

export * from "./types.js";
export {
  ProviderCircuitBreaker,
  isInfrastructureError,
  ConnectionCooldownManager,
  isTerminalError,
  calculateDecorrelatedJitter,
  ModelLockoutManager,
  isModelScopedError,
};

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

const circuitBreakers = new Map<string, ProviderCircuitBreaker>();

export function getProviderCircuitBreaker(
  providerId: string,
  profile?: Partial<ProviderBreakerProfile>
): ProviderCircuitBreaker {
  let cb = circuitBreakers.get(providerId);
  if (!cb) {
    cb = new ProviderCircuitBreaker(providerId, profile);
    circuitBreakers.set(providerId, cb);
  }
  return cb;
}

export const cooldownManager = new ConnectionCooldownManager();
export const modelLockoutManager = new ModelLockoutManager();

/**
 * Record a successful request across all three resilience layers.
 */
export function recordResilienceSuccess(opts: ResilienceSuccessOptions): void {
  const cb = getProviderCircuitBreaker(opts.providerId);
  cb.recordSuccess();

  if (opts.accountId) {
    cooldownManager.markSuccess(opts.accountId);
    if (opts.model) {
      modelLockoutManager.recordSuccess(opts.providerId, opts.accountId, opts.model);
    }
  }
}

/**
 * Record a request failure across all three resilience layers.
 * Evaluates infrastructure errors, terminal accounts, model lockouts, and rate limits.
 */
export function recordResilienceFailure(opts: ResilienceFailureOptions): ResilienceFailureResult {
  const { providerId, accountId, model, status, errorText, headers } = opts;

  let infrastructure = false;
  let rateLimited = false;
  let terminal = false;
  let modelLocked = false;
  let cooldownMs: number | undefined;

  // 1. Layer 1: Provider Circuit Breaker
  if (isInfrastructureError(status, errorText)) {
    const cb = getProviderCircuitBreaker(providerId);
    cb.recordFailure(status, errorText);
    infrastructure = true;
  }

  // 2. Layer 3: Model Lockout (404, context length exceeded, 529 model overload)
  if (accountId && model && isModelScopedError(status, errorText)) {
    cooldownMs = modelLockoutManager.lockModel(providerId, accountId, model, errorText);
    modelLocked = true;
  }

  // 3. Layer 2: Terminal Account (401 invalid key, banned account)
  if (accountId && isTerminalError(status, errorText)) {
    cooldownManager.markTerminal(accountId, errorText || `HTTP ${status}`);
    terminal = true;
  }

  // 4. Layer 2: Rate Limit / Quota Exceeded (429, 402, quota error text)
  if (accountId && isRateLimitOrQuotaError(status, errorText)) {
    rateLimited = true;
    const parsedMs = parseRateLimitHeaders(headers);
    const appliedMs = parsedMs && parsedMs > 0 ? parsedMs : undefined;
    cooldownMs = cooldownManager.markRateLimited(accountId, appliedMs, providerId);
  }

  return {
    infrastructure,
    rateLimited,
    terminal,
    modelLocked,
    cooldownMs,
  };
}

export function resetAllResilience(): void {
  for (const cb of circuitBreakers.values()) {
    cb.reset();
  }
  circuitBreakers.clear();
  cooldownManager.reset();
  modelLockoutManager.reset();
}
