/**
 * Provider Circuit Breaker
 * Layer 1 of the Resilience Engine.
 * Protects against whole-provider infrastructure outages (HTTP 500, 502, 503, 504, 408, network drops).
 * Exempts 401, 403, 429, 529 which are handled by account cooldown or model lockout.
 * States: CLOSED -> DEGRADED -> OPEN -> HALF_OPEN -> CLOSED.
 * Features:
 * - Lazy recovery on read (no background timers)
 * - Single-probe concurrency guard in HALF_OPEN state (halfOpenProbeInFlight)
 */

import type { CircuitBreakerState, CircuitState, ProviderBreakerProfile } from "./types.js";

const DEFAULT_PROFILE: ProviderBreakerProfile = {
  failureThreshold: 5,
  degradedThreshold: 3,
  resetTimeoutMs: 30_000,
  halfOpenSuccessThreshold: 1,
};

/**
 * Predicate to evaluate whether an error or status represents an infrastructure outage
 * rather than an account-level or client/model-level error.
 */
export function isInfrastructureError(status: number, error?: unknown): boolean {
  // Explicit exemptions: account auth, quota, rate limit, Anthropic model overload, client errors
  if (
    status === 529 ||
    status === 401 ||
    status === 403 ||
    status === 429 ||
    status === 404 ||
    status === 400 ||
    status === 422
  ) {
    return false;
  }

  // 408 Request Timeout and 5xx (except 529) are infrastructure errors
  if (status === 408 || (status >= 500 && status <= 599)) {
    return true;
  }

  if (error) {
    const msg = typeof error === "string" ? error.toLowerCase() : String((error as any)?.message || "").toLowerCase();
    const code = String((error as any)?.code || "").toUpperCase();

    if (code === "ECONNREFUSED" || code === "ETIMEDOUT" || code === "ENOTFOUND" || code === "ECONNRESET") {
      return true;
    }
    if (
      msg.includes("fetch failed") ||
      msg.includes("network error") ||
      msg.includes("socket hang up") ||
      msg.includes("econnrefused") ||
      msg.includes("etimedout")
    ) {
      return true;
    }
  }

  return false;
}

export class ProviderCircuitBreaker {
  private readonly providerId: string;
  private readonly profile: ProviderBreakerProfile;

  private state: CircuitState = "CLOSED";
  private failureCount: number = 0;
  private consecutiveSuccesses: number = 0;
  private lastFailureTime: number = 0;
  private lastStateChangeTime: number = Date.now();
  private halfOpenProbeInFlight: boolean = false;
  private halfOpenProbeStartedAt: number = 0;
  private static readonly PROBE_TIMEOUT_MS = 15_000;

  constructor(providerId: string, profile?: Partial<ProviderBreakerProfile>) {
    this.providerId = providerId;
    this.profile = { ...DEFAULT_PROFILE, ...profile };
  }

  /**
   * Lazily checks if reset timeout has elapsed for an OPEN breaker.
   */
  private checkLazyRecovery(): void {
    if (this.state === "OPEN") {
      const elapsed = Date.now() - this.lastFailureTime;
      if (elapsed >= this.profile.resetTimeoutMs) {
        this.state = "HALF_OPEN";
        this.consecutiveSuccesses = 0;
        this.halfOpenProbeInFlight = false;
        this.halfOpenProbeStartedAt = 0;
        this.lastStateChangeTime = Date.now();
      }
    }
  }

  /**
   * Evaluates if requests are permitted.
   * If in HALF_OPEN, allows exactly 1 probe through using halfOpenProbeInFlight concurrency guard
   * with a safety timeout to prevent deadlocks from unhandled probe errors.
   */
  public canExecute(): boolean {
    this.checkLazyRecovery();

    if (this.state === "CLOSED" || this.state === "DEGRADED") {
      return true;
    }

    if (this.state === "HALF_OPEN") {
      const isStale =
        this.halfOpenProbeInFlight &&
        Date.now() - this.halfOpenProbeStartedAt > ProviderCircuitBreaker.PROBE_TIMEOUT_MS;

      if (!this.halfOpenProbeInFlight || isStale) {
        this.halfOpenProbeInFlight = true;
        this.halfOpenProbeStartedAt = Date.now();
        return true;
      }
      return false; // Concurrency guard: reject other requests while probe is in flight
    }

    return false; // OPEN
  }

  /**
   * Release in-flight probe guard manually if an operation was aborted or cancelled.
   */
  public releaseProbe(): void {
    if (this.state === "HALF_OPEN") {
      this.halfOpenProbeInFlight = false;
      this.halfOpenProbeStartedAt = 0;
    }
  }

  /**
   * Record a successful request.
   * Closes breaker if probe succeeded in HALF_OPEN state, or resets failure counts if CLOSED/DEGRADED.
   */
  public recordSuccess(): void {
    this.checkLazyRecovery();
    const now = Date.now();

    if (this.state === "HALF_OPEN") {
      this.consecutiveSuccesses++;
      this.halfOpenProbeInFlight = false;
      this.halfOpenProbeStartedAt = 0;
      const threshold = this.profile.halfOpenSuccessThreshold ?? 1;
      if (this.consecutiveSuccesses >= threshold) {
        this.state = "CLOSED";
        this.failureCount = 0;
        this.consecutiveSuccesses = 0;
        this.lastStateChangeTime = now;
      }
    } else {
      this.failureCount = 0;
      if (this.state === "DEGRADED") {
        this.state = "CLOSED";
        this.lastStateChangeTime = now;
      }
    }
  }

  /**
   * Record a request failure.
   * Only infrastructure errors affect the breaker.
   * In HALF_OPEN, any infrastructure failure immediately flips back to OPEN.
   */
  public recordFailure(status?: number, error?: unknown): boolean {
    if (status !== undefined && !isInfrastructureError(status, error)) {
      return false;
    }

    const now = Date.now();
    this.lastFailureTime = now;
    this.consecutiveSuccesses = 0;

    if (this.state === "HALF_OPEN") {
      this.state = "OPEN";
      this.halfOpenProbeInFlight = false;
      this.halfOpenProbeStartedAt = 0;
      this.lastStateChangeTime = now;
      return true;
    }

    this.failureCount++;
    const degradedLimit = this.profile.degradedThreshold ?? 3;

    if (this.failureCount >= this.profile.failureThreshold) {
      if (this.state !== "OPEN") {
        this.state = "OPEN";
        this.halfOpenProbeInFlight = false;
        this.halfOpenProbeStartedAt = 0;
        this.lastStateChangeTime = now;
      }
    } else if (this.failureCount >= degradedLimit) {
      if (this.state === "CLOSED") {
        this.state = "DEGRADED";
        this.lastStateChangeTime = now;
      }
    }

    return true;
  }

  public getState(): CircuitState {
    this.checkLazyRecovery();
    return this.state;
  }

  public getSnapshot(): CircuitBreakerState {
    this.checkLazyRecovery();
    return {
      state: this.state,
      failureCount: this.failureCount,
      consecutiveSuccesses: this.consecutiveSuccesses,
      lastFailureTime: this.lastFailureTime,
      lastStateChangeTime: this.lastStateChangeTime,
      halfOpenProbeInFlight: this.halfOpenProbeInFlight,
    };
  }

  public getRetryAfterMs(): number {
    this.checkLazyRecovery();
    if (this.state !== "OPEN") return 0;
    const remaining = this.profile.resetTimeoutMs - (Date.now() - this.lastFailureTime);
    return Math.max(0, remaining);
  }

  public reset(): void {
    this.state = "CLOSED";
    this.failureCount = 0;
    this.consecutiveSuccesses = 0;
    this.lastFailureTime = 0;
    this.lastStateChangeTime = Date.now();
    this.halfOpenProbeInFlight = false;
    this.halfOpenProbeStartedAt = 0;
  }

  public forceState(state: CircuitState): void {
    this.state = state;
    this.lastStateChangeTime = Date.now();
    if (state === "OPEN") {
      this.lastFailureTime = Date.now();
    }
    if (state !== "HALF_OPEN") {
      this.halfOpenProbeInFlight = false;
      this.halfOpenProbeStartedAt = 0;
    }
  }
}
