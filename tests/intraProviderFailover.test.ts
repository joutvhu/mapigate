import test from "node:test";
import assert from "node:assert/strict";
import { LoadBalancer, isRateLimitOrQuotaError } from "../src/core/router/loadBalancer.js";
import { getProviderCircuitBreaker } from "../src/core/resilience/index.js";
import { handleProxyRequest } from "../src/server/proxy/chatProxy.js";
import { ProviderRepository } from "../src/storage/repositories/providerRepo.js";
import { LogRepository } from "../src/storage/repositories/logRepo.js";
import { RequestDetailsRepository, flushRequestDetailsBuffer } from "../src/storage/repositories/requestDetailsRepo.js";
import { getDatabase } from "../src/storage/database.js";
import type { Request, Response } from "express";

test("isRateLimitOrQuotaError accurately classifies rate limits and quota exhaustion", () => {
  // 429 and 402 are always rate limit / payment required
  assert.equal(isRateLimitOrQuotaError(429), true);
  assert.equal(isRateLimitOrQuotaError(429, "Too Many Requests"), true);
  assert.equal(isRateLimitOrQuotaError(402), true);
  assert.equal(isRateLimitOrQuotaError(402, "Payment Required"), true);

  // Quota signals in error messages
  assert.equal(isRateLimitOrQuotaError(403, "You exceeded your current quota, please check your plan"), true);
  assert.equal(isRateLimitOrQuotaError(400, "insufficient_quota: your account has run out of tokens"), true);
  assert.equal(isRateLimitOrQuotaError(403, "Resource has been exhausted (check quota)"), true);
  assert.equal(isRateLimitOrQuotaError(503, "The engine is currently overloaded, please retry"), true);
  assert.equal(isRateLimitOrQuotaError(500, "Rate limit reached for model"), true);
  assert.equal(isRateLimitOrQuotaError(403, "out of credits, please top up"), true);

  // Non-rate limit errors
  assert.equal(isRateLimitOrQuotaError(200), false);
  assert.equal(isRateLimitOrQuotaError(400, "Invalid JSON in request body"), false);
  assert.equal(isRateLimitOrQuotaError(404, "Model 'unknown-model' not found"), false);
  assert.equal(isRateLimitOrQuotaError(401, "Invalid API key format"), false);
});

test("LoadBalancer - account picking, cooldowns, and exclusion", () => {
  LoadBalancer.reset();

  const providerId = `lb_test_prov_${Date.now()}`;
  ProviderRepository.saveProvider({
    id: providerId,
    name: "LoadBalancer Test Provider",
    baseUrl: "https://api.lb-test.com/v1",
    format: "openai",
    isActive: true,
    strategy: "round-robin",
    stickyLimit: 2,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  });

  const acc1Id = `acc_1_${Date.now()}`;
  const acc2Id = `acc_2_${Date.now()}`;

  ProviderRepository.addAccount({
    id: acc1Id,
    providerId,
    name: "Account 1",
    rawApiKey: "key-1",
    isActive: true,
  });

  ProviderRepository.addAccount({
    id: acc2Id,
    providerId,
    name: "Account 2",
    rawApiKey: "key-2",
    isActive: true,
  });

  // Pick first account
  const picked1 = LoadBalancer.pickAccount(providerId);
  assert.ok(picked1);

  // Sticky limit test: picking again should stick to picked1
  const picked2 = LoadBalancer.pickAccount(providerId);
  assert.equal(picked2?.id, picked1.id);

  // Mark picked1 as rate-limited
  LoadBalancer.markRateLimited(picked1.id, 5000, providerId);
  assert.equal(LoadBalancer.isAccountInCooldown(picked1.id), true);
  assert.ok(LoadBalancer.getCooldownRemainingMs(picked1.id) > 0);

  // Next pick should avoid picked1 and pick the healthy account (acc2)
  const picked3 = LoadBalancer.pickAccount(providerId);
  assert.ok(picked3);
  assert.notEqual(picked3.id, picked1.id);

  // Picking with exclusion of picked3 should return undefined (picked1 is in cooldown, picked3 is excluded)
  const pickedExcluded = LoadBalancer.pickAccount(providerId, new Set([picked3.id]));
  assert.equal(pickedExcluded, undefined);

  LoadBalancer.clearCooldowns();
  assert.equal(LoadBalancer.isAccountInCooldown(picked1.id), false);

  ProviderRepository.deleteAccount(acc1Id);
  ProviderRepository.deleteAccount(acc2Id);
  ProviderRepository.deleteProvider(providerId);
});

test("Intra-Provider Failover - 429 rate limit immediately fails over to next account", async () => {
  LoadBalancer.reset();

  const providerId = `test_prov_failover_429_${Date.now()}`;
  const accAId = `test_acc_a_${Date.now()}`;
  const accBId = `test_acc_b_${Date.now()}`;
  const testModel = "gpt-4o";

  ProviderRepository.saveProvider({
    id: providerId,
    name: "Failover 429 Provider",
    baseUrl: "https://api.failover-429.com/v1",
    format: "openai",
    isActive: true,
    priority: 1,
    strategy: "fill-first",
    models: [testModel],
    createdAt: Date.now(),
    updatedAt: Date.now(),
  });

  ProviderRepository.addAccount({
    id: accAId,
    providerId,
    name: "Primary Account A",
    rawApiKey: "sk-key-a-primary",
    isActive: true,
  });

  ProviderRepository.addAccount({
    id: accBId,
    providerId,
    name: "Backup Account B",
    rawApiKey: "sk-key-b-backup",
    isActive: true,
  });

  const callsMade: Array<{ apiKey: string; url: string }> = [];

  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (url: any, init: any) => {
    const authHeader = init?.headers?.["Authorization"] || "";
    callsMade.push({ apiKey: authHeader, url: String(url) });

    if (authHeader.includes("sk-key-a-primary")) {
      // Primary account returns 429
      return {
        ok: false,
        status: 429,
        headers: new Headers({ "retry-after": "30" }),
        text: async () => JSON.stringify({ error: { message: "Rate limit reached: requests per min" } }),
      } as any;
    }

    if (authHeader.includes("sk-key-b-backup")) {
      // Backup account succeeds with 200
      const successJson = {
        id: "chatcmpl-b-success",
        object: "chat.completion",
        created: 1700000000,
        model: testModel,
        choices: [
          {
            index: 0,
            message: { role: "assistant", content: "Response from Backup Account B" },
            finish_reason: "stop",
          },
        ],
        usage: { prompt_tokens: 20, completion_tokens: 15, total_tokens: 35 },
      };
      return {
        ok: true,
        status: 200,
        headers: new Headers({ "content-type": "application/json" }),
        text: async () => JSON.stringify(successJson),
        json: async () => successJson,
      } as any;
    }

    throw new Error(`Unexpected auth header: ${authHeader}`);
  }) as typeof fetch;

  try {
    const mockReq = {
      headers: {
        "content-type": "application/json",
        "user-agent": "cursor/1.0",
        "x-client-tool": "cursor",
      },
      body: {
        model: `${providerId}/${testModel}`,
        messages: [{ role: "user", content: "Test failover" }],
        stream: false,
      },
    } as unknown as Request;

    let responseStatusCode = 0;
    let responseJson: any = null;
    let responseHeadersSent = false;

    const mockRes = {
      get headersSent() {
        return responseHeadersSent;
      },
      status(code: number) {
        responseStatusCode = code;
        return this;
      },
      json(data: any) {
        responseJson = data;
        responseHeadersSent = true;
        return this;
      },
      send(data: any) {
        responseJson = data;
        responseHeadersSent = true;
        return this;
      },
      setHeader() {},
    } as unknown as Response;

    await handleProxyRequest(mockReq, mockRes, "openai");

    // Verification:
    // 1. Both accounts were called in sequence
    assert.equal(callsMade.length, 2);
    assert.ok(callsMade[0].apiKey.includes("sk-key-a-primary"));
    assert.ok(callsMade[1].apiKey.includes("sk-key-b-backup"));

    // 2. Client received 200 OK from Backup Account B without seeing 429
    assert.equal(responseStatusCode, 200);
    assert.equal(responseJson?.choices?.[0]?.message?.content, "Response from Backup Account B");

    // 3. Primary Account A is in cooldown in LoadBalancer
    assert.equal(LoadBalancer.isAccountInCooldown(accAId), true);
    // Retry-after 30s was parsed
    assert.ok(LoadBalancer.getCooldownRemainingMs(accAId) > 20_000);
    // Backup Account B is NOT in cooldown
    assert.equal(LoadBalancer.isAccountInCooldown(accBId), false);

    // 4. RequestDetails flushed and inspected
    flushRequestDetailsBuffer();
    const res = RequestDetailsRepository.getRequestDetails();
    assert.ok(res.details.length > 0);
    const latest = res.details[0];
    assert.equal(latest.connectionId, accBId);
    assert.equal(latest.accountName, "Backup Account B");
    assert.equal(latest.status, 200);

    // 5. LogRepository also recorded Backup Account B
    const logs = LogRepository.getRecentLogs(1);
    assert.ok(logs.length > 0);
    assert.equal(logs[0].accountId, accBId);
    assert.equal(logs[0].accountName, "Backup Account B");
  } finally {
    globalThis.fetch = originalFetch;
    LoadBalancer.reset();
    ProviderRepository.deleteAccount(accAId);
    ProviderRepository.deleteAccount(accBId);
    ProviderRepository.deleteProvider(providerId);
  }
});

test("Intra-Provider Failover - quota exhaustion error (403) triggers failover", async () => {
  LoadBalancer.reset();

  const providerId = `test_prov_quota_${Date.now()}`;
  const acc1 = `acc_quota_1_${Date.now()}`;
  const acc2 = `acc_quota_2_${Date.now()}`;
  const testModel = "claude-3-5-sonnet";

  ProviderRepository.saveProvider({
    id: providerId,
    name: "Quota Failover Provider",
    baseUrl: "https://api.quota-failover.com/v1",
    format: "openai",
    isActive: true,
    strategy: "fill-first",
    models: [testModel],
    createdAt: Date.now(),
    updatedAt: Date.now(),
  });

  ProviderRepository.addAccount({
    id: acc1,
    providerId,
    name: "Account 1 Out of Quota",
    rawApiKey: "key-exhausted",
    isActive: true,
  });

  ProviderRepository.addAccount({
    id: acc2,
    providerId,
    name: "Account 2 Healthy",
    rawApiKey: "key-healthy",
    isActive: true,
  });

  const callsMade: string[] = [];

  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (url: any, init: any) => {
    const authHeader = init?.headers?.["Authorization"] || "";
    callsMade.push(authHeader);

    if (authHeader.includes("key-exhausted")) {
      // 403 quota exhaustion
      return {
        ok: false,
        status: 403,
        headers: new Headers(),
        text: async () => JSON.stringify({ error: { message: "Resource has been exhausted: insufficient_quota" } }),
      } as any;
    }

    if (authHeader.includes("key-healthy")) {
      const resp = {
        id: "msg-healthy-1",
        choices: [{ index: 0, message: { role: "assistant", content: "Success from Account 2" } }],
      };
      return {
        ok: true,
        status: 200,
        headers: new Headers({ "content-type": "application/json" }),
        text: async () => JSON.stringify(resp),
        json: async () => resp,
      } as any;
    }

    throw new Error(`Unexpected auth: ${authHeader}`);
  }) as typeof fetch;

  try {
    const mockReq = {
      headers: { "content-type": "application/json" },
      body: {
        model: `${providerId}/${testModel}`,
        messages: [{ role: "user", content: "Test quota failover" }],
        stream: false,
      },
    } as unknown as Request;

    let responseStatusCode = 0;
    let responseJson: any = null;

    const mockRes = {
      status(code: number) {
        responseStatusCode = code;
        return this;
      },
      json(data: any) {
        responseJson = data;
        return this;
      },
      send(data: any) {
        responseJson = data;
        return this;
      },
      setHeader() {},
    } as unknown as Response;

    await handleProxyRequest(mockReq, mockRes, "openai");

    assert.equal(callsMade.length, 2);
    assert.equal(responseStatusCode, 200);
    assert.equal(responseJson?.choices?.[0]?.message?.content, "Success from Account 2");
    assert.equal(LoadBalancer.isAccountInCooldown(acc1), true);
  } finally {
    globalThis.fetch = originalFetch;
    LoadBalancer.reset();
    ProviderRepository.deleteAccount(acc1);
    ProviderRepository.deleteAccount(acc2);
    ProviderRepository.deleteProvider(providerId);
  }
});

test("Intra-Provider Failover - returns 429 when all provider accounts hit rate limit", async () => {
  LoadBalancer.reset();

  const providerId = `test_prov_all_429_${Date.now()}`;
  const acc1 = `acc_429_1_${Date.now()}`;
  const acc2 = `acc_429_2_${Date.now()}`;
  const testModel = "deepseek-coder";

  ProviderRepository.saveProvider({
    id: providerId,
    name: "All 429 Provider",
    baseUrl: "https://api.all-429.com/v1",
    format: "openai",
    isActive: true,
    strategy: "fill-first",
    models: [testModel],
    createdAt: Date.now(),
    updatedAt: Date.now(),
  });

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

  let callCount = 0;

  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (url: any, init: any) => {
    callCount++;
    return {
      ok: false,
      status: 429,
      headers: new Headers(),
      text: async () => JSON.stringify({ error: { message: "Rate limit reached" } }),
    } as any;
  }) as typeof fetch;

  try {
    const mockReq = {
      headers: { "content-type": "application/json" },
      body: {
        model: `${providerId}/${testModel}`,
        messages: [{ role: "user", content: "Test all 429" }],
        stream: false,
      },
    } as unknown as Request;

    let responseStatusCode = 0;
    let responseJson: any = null;

    const mockRes = {
      status(code: number) {
        responseStatusCode = code;
        return this;
      },
      json(data: any) {
        responseJson = data;
        return this;
      },
      send(data: any) {
        responseJson = data;
        return this;
      },
      setHeader() {},
    } as unknown as Response;

    await handleProxyRequest(mockReq, mockRes, "openai");

    // Both accounts were attempted
    assert.equal(callCount, 2);
    // Returns 429 to client
    assert.equal(responseStatusCode, 429);
    assert.ok(responseJson?.error?.message?.includes("Rate limit"));
    // Both accounts marked in cooldown
    assert.equal(LoadBalancer.isAccountInCooldown(acc1), true);
    assert.equal(LoadBalancer.isAccountInCooldown(acc2), true);
  } finally {
    globalThis.fetch = originalFetch;
    LoadBalancer.reset();
    ProviderRepository.deleteAccount(acc1);
    ProviderRepository.deleteAccount(acc2);
    ProviderRepository.deleteProvider(providerId);
  }
});

test("Intra-Provider Failover - does NOT failover on non-quota errors (e.g. 400 Bad Request)", async () => {
  LoadBalancer.reset();

  const providerId = `test_prov_no_failover_400_${Date.now()}`;
  const acc1 = `acc_400_1_${Date.now()}`;
  const acc2 = `acc_400_2_${Date.now()}`;
  const testModel = "gpt-4o";

  ProviderRepository.saveProvider({
    id: providerId,
    name: "No Failover Provider",
    baseUrl: "https://api.no-failover.com/v1",
    format: "openai",
    isActive: true,
    strategy: "fill-first",
    models: [testModel],
    createdAt: Date.now(),
    updatedAt: Date.now(),
  });

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

  let callCount = 0;

  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (url: any, init: any) => {
    callCount++;
    return {
      ok: false,
      status: 400,
      headers: new Headers(),
      text: async () => JSON.stringify({ error: { message: "Invalid parameter: max_tokens must be positive" } }),
    } as any;
  }) as typeof fetch;

  try {
    const mockReq = {
      headers: { "content-type": "application/json" },
      body: {
        model: `${providerId}/${testModel}`,
        messages: [{ role: "user", content: "Test 400" }],
        stream: false,
      },
    } as unknown as Request;

    let responseStatusCode = 0;
    let responseJson: any = null;

    const mockRes = {
      status(code: number) {
        responseStatusCode = code;
        return this;
      },
      json(data: any) {
        responseJson = data;
        return this;
      },
      send(data: any) {
        responseJson = data;
        return this;
      },
      setHeader() {},
    } as unknown as Response;

    await handleProxyRequest(mockReq, mockRes, "openai");

    // Only called ONCE: 400 error should not retry on Account 2
    assert.equal(callCount, 1);
    assert.equal(responseStatusCode, 400);
    assert.equal(LoadBalancer.isAccountInCooldown(acc1), false);
  } finally {
    globalThis.fetch = originalFetch;
    LoadBalancer.reset();
    ProviderRepository.deleteAccount(acc1);
    ProviderRepository.deleteAccount(acc2);
    ProviderRepository.deleteProvider(providerId);
  }
});

test("LoadBalancer - fill-first strategy strictly maintains priority even with prefixHash", () => {
  LoadBalancer.reset();

  const providerId = `lb_test_fill_first_${Date.now()}`;
  ProviderRepository.saveProvider({
    id: providerId,
    name: "Fill First Provider",
    baseUrl: "https://api.fill-first.com/v1",
    format: "openai",
    isActive: true,
    strategy: "fill-first",
    createdAt: Date.now(),
    updatedAt: Date.now(),
  });

  const acc1Id = `acc_1_${Date.now()}`;
  const acc2Id = `acc_2_${Date.now()}`;

  ProviderRepository.addAccount({
    id: acc1Id,
    providerId,
    name: "Account 1 (Priority)",
    rawApiKey: "key-1",
    isActive: true,
  });

  ProviderRepository.addAccount({
    id: acc2Id,
    providerId,
    name: "Account 2 (Secondary)",
    rawApiKey: "key-2",
    isActive: true,
  });

  try {
    // With various prefix hashes, fill-first MUST always pick acc1Id (pool[0])
    for (let i = 0; i < 10; i++) {
      const picked = LoadBalancer.pickAccount(providerId, { prefixHash: `prefix_hash_${i}_test` });
      assert.equal(picked?.id, acc1Id, `fill-first should pick account 1, picked ${picked?.id}`);
    }
  } finally {
    LoadBalancer.reset();
    ProviderRepository.deleteAccount(acc1Id);
    ProviderRepository.deleteAccount(acc2Id);
    ProviderRepository.deleteProvider(providerId);
  }
});

test("executeSingleModel - handles fetch rejection and records infrastructure failure on circuit breaker", async () => {
  LoadBalancer.reset();

  const providerId = `test_prov_fetch_rejection_${Date.now()}`;
  const accId = `acc_fetch_err_${Date.now()}`;
  const testModel = "gpt-4o";

  ProviderRepository.saveProvider({
    id: providerId,
    name: "Fetch Rejection Provider",
    baseUrl: "https://api.fetch-rejection.com/v1",
    format: "openai",
    isActive: true,
    strategy: "fill-first",
    models: [testModel],
    createdAt: Date.now(),
    updatedAt: Date.now(),
  });

  ProviderRepository.addAccount({
    id: accId,
    providerId,
    name: "Account 1",
    rawApiKey: "key-1",
    isActive: true,
  });

  const cb = getProviderCircuitBreaker(providerId);
  cb.forceState("HALF_OPEN");
  assert.equal(cb.getState(), "HALF_OPEN");

  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () => {
    throw new TypeError("fetch failed: connection refused");
  }) as typeof fetch;

  try {
    const mockReq = {
      headers: { "content-type": "application/json" },
      body: {
        model: `${providerId}/${testModel}`,
        messages: [{ role: "user", content: "Test network error" }],
        stream: false,
      },
    } as unknown as Request;

    let responseStatusCode = 0;
    let responseJson: any = null;

    const mockRes = {
      status(code: number) {
        responseStatusCode = code;
        return this;
      },
      json(data: any) {
        responseJson = data;
        return this;
      },
      send(data: any) {
        responseJson = data;
        return this;
      },
      setHeader() {},
    } as unknown as Response;

    await handleProxyRequest(mockReq, mockRes, "openai");

    // Client receives 502
    assert.equal(responseStatusCode, 502);
    // Circuit breaker transitioned from HALF_OPEN to OPEN due to infrastructure failure
    assert.equal(cb.getState(), "OPEN");
    // In-flight probe concurrency guard was released
    const snap = cb.getSnapshot();
    assert.equal(snap.halfOpenProbeInFlight, false);
  } finally {
    globalThis.fetch = originalFetch;
    cb.reset();
    LoadBalancer.reset();
    ProviderRepository.deleteAccount(accId);
    ProviderRepository.deleteProvider(providerId);
  }
});

test.after(() => {
  try {
    const db = getDatabase();
    db.run("DELETE FROM request_logs WHERE provider_id LIKE 'test_prov_%' OR provider_id LIKE 'lb_test_prov_%'");
    db.run("DELETE FROM request_details WHERE provider LIKE 'test_prov_%' OR provider LIKE 'lb_test_prov_%'");
  } catch {}
});


