import test from "node:test";
import assert from "node:assert/strict";
import {
  parseRetryAfter,
  parseDurationString,
  parseRateLimitHeaders,
} from "../src/shared/utils/rateLimitParser.js";
import {
  ProviderCircuitBreaker,
  isInfrastructureError,
} from "../src/core/resilience/circuitBreaker.js";
import {
  ConnectionCooldownManager,
  calculateDecorrelatedJitter,
  isTerminalError,
} from "../src/core/resilience/cooldownManager.js";
import {
  ModelLockoutManager,
  isModelScopedError,
} from "../src/core/resilience/modelLockout.js";
import {
  getProviderCircuitBreaker,
  recordResilienceSuccess,
  recordResilienceFailure,
  resetAllResilience,
} from "../src/core/resilience/index.js";
import { LoadBalancer } from "../src/core/router/loadBalancer.js";
import { ProviderRepository } from "../src/storage/repositories/providerRepo.js";

test("RateLimitParser - Retry-After and reset headers parsing", () => {
  // 1. Seconds parsing & bounds
  assert.equal(parseRetryAfter("30"), 30_000);
  assert.equal(parseRetryAfter("1.5"), 1_500);
  // Clamped to 300,000 ms ceiling
  assert.equal(parseRetryAfter("600"), 300_000);

  // 2. HTTP Date parsing
  const futureDate = new Date(Date.now() + 20_000).toUTCString();
  const parsedDateMs = parseRetryAfter(futureDate);
  assert.ok(parsedDateMs !== null && parsedDateMs > 15_000 && parsedDateMs <= 25_000);

  const pastDate = new Date(Date.now() - 10_000).toUTCString();
  assert.equal(parseRetryAfter(pastDate), 0);

  // Invalid strings
  assert.equal(parseRetryAfter(""), null);
  assert.equal(parseRetryAfter("invalid-format"), null);

  // 3. Duration string parsing
  assert.equal(parseDurationString("6s"), 6_000);
  assert.equal(parseDurationString("500ms"), 500);
  assert.equal(parseDurationString("1m30s"), 90_000);
  assert.equal(parseDurationString("2m"), 120_000);

  // 4. Header inspection (Headers object & plain record)
  const oaiHeaders = new Headers({
    "x-ratelimit-reset-requests": "15s",
  });
  assert.equal(parseRateLimitHeaders(oaiHeaders), 15_000);

  const anthropicHeaders = {
    "anthropic-ratelimit-requests-reset": "25s",
  };
  assert.equal(parseRateLimitHeaders(anthropicHeaders), 25_000);

  const retryAfterHeaders = new Headers({
    "retry-after": "45",
  });
  assert.equal(parseRateLimitHeaders(retryAfterHeaders), 45_000);

  assert.equal(parseRateLimitHeaders(null), null);
  assert.equal(parseRateLimitHeaders({}), null);
});

test("ProviderCircuitBreaker - error predicate and state transitions", async () => {
  // Predicate verification
  assert.equal(isInfrastructureError(500), true);
  assert.equal(isInfrastructureError(502), true);
  assert.equal(isInfrastructureError(503), true);
  assert.equal(isInfrastructureError(504), true);
  assert.equal(isInfrastructureError(408), true);
  assert.equal(isInfrastructureError(0, { code: "ECONNREFUSED" }), true);

  // Exemptions
  assert.equal(isInfrastructureError(401), false);
  assert.equal(isInfrastructureError(403), false);
  assert.equal(isInfrastructureError(429), false);
  assert.equal(isInfrastructureError(529), false);
  assert.equal(isInfrastructureError(400), false);
  assert.equal(isInfrastructureError(404), false);

  const cb = new ProviderCircuitBreaker("test-provider", {
    failureThreshold: 3,
    degradedThreshold: 2,
    resetTimeoutMs: 50, // 50ms for test
    halfOpenSuccessThreshold: 1,
  });

  assert.equal(cb.getState(), "CLOSED");
  assert.equal(cb.canExecute(), true);

  // Non-infrastructure errors should not trip breaker
  cb.recordFailure(429);
  cb.recordFailure(401);
  assert.equal(cb.getState(), "CLOSED");

  // Infrastructure failure 1: still CLOSED
  cb.recordFailure(503);
  assert.equal(cb.getState(), "CLOSED");

  // Infrastructure failure 2: DEGRADED (can still execute)
  cb.recordFailure(500);
  assert.equal(cb.getState(), "DEGRADED");
  assert.equal(cb.canExecute(), true);

  // Infrastructure failure 3: OPEN (cannot execute)
  cb.recordFailure(502);
  assert.equal(cb.getState(), "OPEN");
  assert.equal(cb.canExecute(), false);

  // Probe before timeout expires: blocked
  assert.equal(cb.canExecute(), false);

  // Wait for lazy recovery timeout (50ms)
  await new Promise((r) => setTimeout(r, 60));

  // Single-probe concurrency guard: first call enters HALF_OPEN and succeeds
  const probeAllowed = cb.canExecute();
  assert.equal(probeAllowed, true);
  assert.equal(cb.getState(), "HALF_OPEN");

  // Concurrent call while probe is in flight: BLOCKED
  const concurrentAllowed = cb.canExecute();
  assert.equal(concurrentAllowed, false);

  // Probe succeeds -> breaker transitions to CLOSED
  cb.recordSuccess();
  assert.equal(cb.getState(), "CLOSED");
  assert.equal(cb.canExecute(), true);

  // Now test probe failure in HALF_OPEN: immediately re-opens
  cb.recordFailure(500);
  cb.recordFailure(500);
  cb.recordFailure(500);
  assert.equal(cb.getState(), "OPEN");

  await new Promise((r) => setTimeout(r, 60));
  assert.equal(cb.canExecute(), true); // enters HALF_OPEN
  assert.equal(cb.getState(), "HALF_OPEN");

  // Probe fails
  cb.recordFailure(500);
  assert.equal(cb.getState(), "OPEN");
  assert.equal(cb.canExecute(), false);
});

test("ConnectionCooldownManager - AWS decorrelated jitter and terminal states", async () => {
  // 1. Decorrelated jitter bounds
  const baseMs = 1_000;
  const capMs = 10_000;
  let sleep = 0;
  for (let i = 0; i < 50; i++) {
    sleep = calculateDecorrelatedJitter(sleep, baseMs, capMs);
    assert.ok(sleep >= baseMs, `Jitter ${sleep} must be >= base ${baseMs}`);
    assert.ok(sleep <= capMs, `Jitter ${sleep} must be <= cap ${capMs}`);
  }

  // 2. Terminal error classification
  assert.equal(isTerminalError(401), true);
  assert.equal(isTerminalError(403, "Account suspended for violation"), true);
  assert.equal(isTerminalError(403, "Account banned"), true);
  assert.equal(isTerminalError(403, "API key revoked"), true);
  // Non-terminal 403 (quota/balance)
  assert.equal(isTerminalError(403, "Resource has been exhausted (quota)"), false);
  assert.equal(isTerminalError(429), false);

  const cm = new ConnectionCooldownManager();
  const accId = "acc_test_cd_1";

  // Rate-limited with custom duration
  cm.markRateLimited(accId, 50);
  assert.equal(cm.isAccountInCooldown(accId), true);
  assert.ok(cm.getCooldownRemainingMs(accId) > 0);

  // Wait for lazy expiration
  await new Promise((r) => setTimeout(r, 60));
  assert.equal(cm.isAccountInCooldown(accId), false);
  assert.equal(cm.getCooldownRemainingMs(accId), 0);

  // Terminal state: persists and does not expire lazily
  const termAccId = "acc_banned_key";
  cm.markTerminal(termAccId, "revoked_api_key");
  assert.equal(cm.isTerminal(termAccId), true);
  assert.equal(cm.isAccountInCooldown(termAccId), true);

  // clearCooldowns does not clear terminal accounts
  cm.clearCooldowns();
  assert.equal(cm.isTerminal(termAccId), true);

  // reset clears all
  cm.reset();
  assert.equal(cm.isTerminal(termAccId), false);
});

test("ModelLockoutManager - model-scoped error classification and success-decay", () => {
  // Predicate
  assert.equal(isModelScopedError(404), true);
  assert.equal(isModelScopedError(529), true);
  assert.equal(isModelScopedError(400, "context_length_exceeded: maximum context length is 8192"), true);
  assert.equal(isModelScopedError(400, "Model 'gpt-5-preview' does not have access"), true);
  assert.equal(isModelScopedError(500), false);
  assert.equal(isModelScopedError(429), false);

  const ml = new ModelLockoutManager();
  const provId = "prov_openai";
  const accId = "acc_1";
  const model = "gpt-4o";
  const siblingModel = "gpt-4o-mini";
  const siblingAccount = "acc_2";

  // Lock model on 404
  const duration1 = ml.lockModel(provId, accId, model, "404 model not found");
  assert.equal(duration1, 120_000); // 120s initial
  assert.equal(ml.isModelLocked(provId, accId, model), true);

  // Sibling model and sibling account are NOT locked
  assert.equal(ml.isModelLocked(provId, accId, siblingModel), false);
  assert.equal(ml.isModelLocked(provId, siblingAccount, model), false);

  // Second failure: exponential backoff (240s)
  const duration2 = ml.lockModel(provId, accId, model, "404 model not found");
  assert.equal(duration2, 240_000);
  assert.equal(ml.getFailureCount(provId, accId, model), 2);

  // Success-decay: halving failureCount
  ml.recordSuccess(provId, accId, model);
  assert.equal(ml.getFailureCount(provId, accId, model), 1);
  assert.equal(ml.isModelLocked(provId, accId, model), false); // unlocked on success

  // Second success: drops to 0 and clears
  ml.recordSuccess(provId, accId, model);
  assert.equal(ml.getFailureCount(provId, accId, model), 0);
});

test("LoadBalancer facade compatibility and resilience integration", () => {
  resetAllResilience();
  LoadBalancer.reset();

  const providerId = `prov_lb_compat_${Date.now()}`;
  ProviderRepository.saveProvider({
    id: providerId,
    name: "LB Compatibility Provider",
    baseUrl: "https://api.lb-compat.com/v1",
    format: "openai",
    isActive: true,
    strategy: "fill-first",
    createdAt: Date.now(),
    updatedAt: Date.now(),
  });

  const acc1 = `acc_compat_1_${Date.now()}`;
  const acc2 = `acc_compat_2_${Date.now()}`;

  ProviderRepository.addAccount({
    id: acc1,
    providerId,
    name: "Account 1",
    rawApiKey: "key-1",
    isActive: true,
  });

  ProviderRepository.addAccount({
    id: acc2,
    providerId,
    name: "Account 2",
    rawApiKey: "key-2",
    isActive: true,
  });

  try {
    // 1. Facade rate-limit check
    LoadBalancer.markRateLimited(acc1, 5_000, providerId);
    assert.equal(LoadBalancer.isAccountInCooldown(acc1), true);
    assert.ok(LoadBalancer.getCooldownRemainingMs(acc1) > 0);

    // PickAccount picks acc2
    const picked = LoadBalancer.pickAccount(providerId);
    assert.equal(picked?.id, acc2);

    // Clear cooldowns
    LoadBalancer.clearCooldowns();
    assert.equal(LoadBalancer.isAccountInCooldown(acc1), false);

    // 2. Model lockout integration during pickAccount
    // acc2 currently has 0 rate limit hits and acc1 has 1, so acc2 is primary in fill-first.
    // Lock acc2 on "gpt-expensive". PickAccount should skip acc2 and failover to acc1.
    recordResilienceFailure({
      providerId,
      accountId: acc2,
      model: "gpt-expensive",
      status: 404,
      errorText: "Model not found",
    });

    const pickedForModel = LoadBalancer.pickAccount(providerId, { targetModel: "gpt-expensive" });
    assert.equal(pickedForModel?.id, acc1);

    // Picking for a model that acc2 is NOT locked for should pick acc2
    const pickedNormal = LoadBalancer.pickAccount(providerId, { targetModel: "gpt-4o" });
    assert.equal(pickedNormal?.id, acc2);

    // 3. Provider Circuit Breaker integration in LoadBalancer
    const cb = getProviderCircuitBreaker(providerId);
    cb.forceState("OPEN");
    const blockedPick = LoadBalancer.pickAccount(providerId);
    assert.equal(blockedPick, undefined);

    cb.reset();
    const allowedPick = LoadBalancer.pickAccount(providerId);
    assert.ok(allowedPick);
  } finally {
    resetAllResilience();
    LoadBalancer.reset();
    ProviderRepository.deleteAccount(acc1);
    ProviderRepository.deleteAccount(acc2);
    ProviderRepository.deleteProvider(providerId);
  }
});
