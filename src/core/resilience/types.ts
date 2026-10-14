/**
 * Resilience Engine Types for Mapigate
 * Defines data structures for the 3-layer resilience architecture:
 * 1. Provider Circuit Breaker (whole-provider infrastructure outages)
 * 2. Connection Cooldown Manager (account-level rate-limit backoff & terminal states)
 * 3. Model Lockout Manager (model-scoped capability & quota errors)
 */

export type CircuitState = "CLOSED" | "DEGRADED" | "OPEN" | "HALF_OPEN";

export interface CircuitBreakerState {
  state: CircuitState;
  failureCount: number;
  consecutiveSuccesses: number;
  lastFailureTime: number;
  lastStateChangeTime: number;
  halfOpenProbeInFlight: boolean;
}

export interface ProviderBreakerProfile {
  failureThreshold: number;
  degradedThreshold?: number;
  resetTimeoutMs: number;
  halfOpenSuccessThreshold?: number;
}

export interface CooldownEntry {
  until: number;
  failureCount: number;
  lastFailureAt: number;
  terminal?: boolean;
  reason?: string;
}

export interface ModelLockoutEntry {
  until: number;
  failureCount: number;
  lastError?: string;
  lockedAt: number;
}

export interface ResilienceSuccessOptions {
  providerId: string;
  accountId?: string;
  model?: string;
}

export interface ResilienceFailureOptions {
  providerId: string;
  accountId?: string;
  model?: string;
  status: number;
  errorText?: string;
  headers?: Headers | Record<string, string | string[] | undefined> | null;
}

export interface ResilienceFailureResult {
  infrastructure: boolean;
  rateLimited: boolean;
  terminal: boolean;
  modelLocked: boolean;
  cooldownMs?: number;
}
