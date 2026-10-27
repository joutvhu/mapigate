process.env.NODE_ENV = "test";

import test from "node:test";
import assert from "node:assert/strict";
import {
  compareAccountsEarliestReset,
  getAntigravityMetrics,
} from "../src/core/router/earliestResetComparator.js";
import { LoadBalancer } from "../src/core/router/loadBalancer.js";
import { ProviderRepository } from "../src/storage/repositories/providerRepo.js";
import type { ProviderAccount } from "../src/shared/types/index.js";

test("Antigravity - Weekly reset is prioritized over 5h session reset", () => {
  const fixedNow = 1740000000000;

  // Account 1 (matches user's Image 1):
  // Gemini Weekly resets in 2h 14m (8,040,000 ms), 5h resets in 5h 0m (18,000,000 ms)
  const account1: ProviderAccount = {
    id: "acc_anti_1",
    providerId: "antigravity",
    name: "Account 1 (Weekly Soon)",
    apiKeyEncrypted: "",
    isActive: true,
    rateLimitHits: 0,
    cachedQuotas: JSON.stringify({
      accountId: "acc_anti_1",
      providerId: "antigravity",
      quotas: [
        {
          label: "Gemini (5h)",
          used: 0,
          total: 1000,
          remainingPercentage: 100,
          resetAt: fixedNow + 5 * 3600 * 1000, // 5h 0m
        },
        {
          label: "Gemini (Weekly)",
          used: 1246,
          total: 3000,
          remainingPercentage: 58,
          resetAt: fixedNow + (2 * 3600 + 14 * 60) * 1000, // 2h 14m
        },
        {
          label: "Claude & GPT (5h)",
          used: 0,
          total: 1000,
          remainingPercentage: 100,
          resetAt: fixedNow + 5 * 3600 * 1000,
        },
        {
          label: "Claude & GPT (Weekly)",
          used: 0,
          total: 3000,
          remainingPercentage: 100,
          resetAt: fixedNow + 7 * 86400 * 1000,
        },
      ],
    }),
  };

  // Account 2 (matches user's Image 2):
  // Gemini Weekly resets in 4d 5h (363,600,000 ms), 5h resets in 4h 50m (17,400,000 ms)
  const account2: ProviderAccount = {
    id: "acc_anti_2",
    providerId: "antigravity",
    name: "Account 2 (Weekly Far, 5h Soon)",
    apiKeyEncrypted: "",
    isActive: true,
    rateLimitHits: 0,
    cachedQuotas: JSON.stringify({
      accountId: "acc_anti_2",
      providerId: "antigravity",
      quotas: [
        {
          label: "Gemini (5h)",
          used: 23,
          total: 1000,
          remainingPercentage: 98,
          resetAt: fixedNow + (4 * 3600 + 50 * 60) * 1000, // 4h 50m (earlier 5h!)
        },
        {
          label: "Gemini (Weekly)",
          used: 2813,
          total: 3000,
          remainingPercentage: 6,
          resetAt: fixedNow + (4 * 86400 + 5 * 3600) * 1000, // 4d 5h
        },
        {
          label: "Claude & GPT (5h)",
          used: 0,
          total: 1000,
          remainingPercentage: 100,
          resetAt: fixedNow + 5 * 3600 * 1000,
        },
        {
          label: "Claude & GPT (Weekly)",
          used: 0,
          total: 3000,
          remainingPercentage: 100,
          resetAt: fixedNow + 7 * 86400 * 1000,
        },
      ],
    }),
  };

  // When comparing for Gemini model:
  // Account 1 Weekly resets in 2h 14m, Account 2 Weekly resets in 4d 5h
  // Even though Account 2's 5h resets in 4h 50m (vs 5h 0m), Account 1 MUST be preferred!
  const cmp = compareAccountsEarliestReset(account1, account2, "antigravity", "gemini-2.5-pro", fixedNow);
  assert.ok(cmp < 0, "Account 1 must come first because its Weekly quota resets earlier (2h 14m < 4d 5h)");

  const metrics1 = getAntigravityMetrics(account1, "gemini-2.5-pro", fixedNow);
  const metrics2 = getAntigravityMetrics(account2, "gemini-2.5-pro", fixedNow);
  assert.equal(metrics1.isExhausted, false);
  assert.equal(metrics2.isExhausted, false);
  assert.ok(metrics1.weeklyResetRemainingMs < metrics2.weeklyResetRemainingMs);
});

test("Antigravity - Model family differentiation (Gemini vs Claude/GPT)", () => {
  const fixedNow = 1740000000000;

  // Account A: Gemini Weekly resets soon (1h), Claude Weekly resets late (6d)
  const accountA: ProviderAccount = {
    id: "acc_a",
    providerId: "antigravity",
    name: "Account A",
    apiKeyEncrypted: "",
    isActive: true,
    rateLimitHits: 0,
    cachedQuotas: JSON.stringify({
      accountId: "acc_a",
      providerId: "antigravity",
      quotas: [
        { label: "Gemini (Weekly)", remainingPercentage: 50, resetAt: fixedNow + 1 * 3600 * 1000 },
        { label: "Claude & GPT (Weekly)", remainingPercentage: 50, resetAt: fixedNow + 6 * 86400 * 1000 },
      ],
    }),
  };

  // Account B: Gemini Weekly resets late (5d), Claude Weekly resets soon (2h)
  const accountB: ProviderAccount = {
    id: "acc_b",
    providerId: "antigravity",
    name: "Account B",
    apiKeyEncrypted: "",
    isActive: true,
    rateLimitHits: 0,
    cachedQuotas: JSON.stringify({
      accountId: "acc_b",
      providerId: "antigravity",
      quotas: [
        { label: "Gemini (Weekly)", remainingPercentage: 50, resetAt: fixedNow + 5 * 86400 * 1000 },
        { label: "Claude & GPT (Weekly)", remainingPercentage: 50, resetAt: fixedNow + 2 * 3600 * 1000 },
      ],
    }),
  };

  // For Gemini: Account A has earlier weekly reset (1h vs 5d) -> Account A wins
  const cmpGemini = compareAccountsEarliestReset(accountA, accountB, "antigravity", "gemini-2.5-flash", fixedNow);
  assert.ok(cmpGemini < 0, "Account A should be picked for Gemini because its Gemini Weekly resets sooner");

  // For Claude: Account B has earlier weekly reset (2h vs 6d) -> Account B wins
  const cmpClaude = compareAccountsEarliestReset(accountA, accountB, "antigravity", "claude-3-7-sonnet", fixedNow);
  assert.ok(cmpClaude > 0, "Account B should be picked for Claude because its Claude & GPT Weekly resets sooner");
});

test("Antigravity - Exhausted accounts (0% quota) are deprioritized", () => {
  const fixedNow = 1740000000000;

  // Account Exhausted: Weekly resets in 30 minutes, but remaining is 0%
  const accountExhausted: ProviderAccount = {
    id: "acc_exh",
    providerId: "antigravity",
    name: "Account Exhausted",
    apiKeyEncrypted: "",
    isActive: true,
    rateLimitHits: 0,
    cachedQuotas: JSON.stringify({
      accountId: "acc_exh",
      providerId: "antigravity",
      quotas: [
        { label: "Gemini (Weekly)", remainingPercentage: 0, resetAt: fixedNow + 30 * 60 * 1000 },
        { label: "Gemini (5h)", remainingPercentage: 100, resetAt: fixedNow + 3 * 3600 * 1000 },
      ],
    }),
  };

  // Account Healthy: Weekly resets in 3 days, remaining is 50%
  const accountHealthy: ProviderAccount = {
    id: "acc_health",
    providerId: "antigravity",
    name: "Account Healthy",
    apiKeyEncrypted: "",
    isActive: true,
    rateLimitHits: 0,
    cachedQuotas: JSON.stringify({
      accountId: "acc_health",
      providerId: "antigravity",
      quotas: [
        { label: "Gemini (Weekly)", remainingPercentage: 50, resetAt: fixedNow + 3 * 86400 * 1000 },
        { label: "Gemini (5h)", remainingPercentage: 100, resetAt: fixedNow + 3 * 3600 * 1000 },
      ],
    }),
  };

  const cmp = compareAccountsEarliestReset(accountExhausted, accountHealthy, "antigravity", "gemini-2.5-pro", fixedNow);
  assert.ok(cmp > 0, "Healthy account must be preferred over exhausted account even if exhausted account resets sooner");
});

test("Antigravity - Tie-breaker when Weekly resets at the same time", () => {
  const fixedNow = 1740000000000;
  const sameWeeklyReset = fixedNow + 2 * 86400 * 1000; // both reset in 2 days

  // Account 1: 5h resets in 1h
  const account1: ProviderAccount = {
    id: "acc_tie_1",
    providerId: "antigravity",
    name: "Account Tie 1",
    apiKeyEncrypted: "",
    isActive: true,
    rateLimitHits: 0,
    cachedQuotas: JSON.stringify({
      accountId: "acc_tie_1",
      providerId: "antigravity",
      quotas: [
        { label: "Gemini (Weekly)", remainingPercentage: 80, resetAt: sameWeeklyReset },
        { label: "Gemini (5h)", remainingPercentage: 100, resetAt: fixedNow + 1 * 3600 * 1000 },
      ],
    }),
  };

  // Account 2: 5h resets in 4h
  const account2: ProviderAccount = {
    id: "acc_tie_2",
    providerId: "antigravity",
    name: "Account Tie 2",
    apiKeyEncrypted: "",
    isActive: true,
    rateLimitHits: 0,
    cachedQuotas: JSON.stringify({
      accountId: "acc_tie_2",
      providerId: "antigravity",
      quotas: [
        { label: "Gemini (Weekly)", remainingPercentage: 80, resetAt: sameWeeklyReset },
        { label: "Gemini (5h)", remainingPercentage: 100, resetAt: fixedNow + 4 * 3600 * 1000 },
      ],
    }),
  };

  const cmp = compareAccountsEarliestReset(account1, account2, "antigravity", "gemini-2.5-pro", fixedNow);
  assert.ok(cmp < 0, "Account 1 should win tie-breaker because its 5h session resets sooner (1h < 4h)");
});

test("LoadBalancer - End-to-end pickAccount with Earliest Reset strategy on Antigravity", () => {
  const providerId = `antigravity_test_${Date.now()}`;
  const now = Date.now();

  ProviderRepository.saveProvider({
    id: providerId,
    name: "Antigravity Earliest Reset Test",
    baseUrl: "https://cloudcode-pa.googleapis.com",
    format: "openai",
    isActive: true,
    priority: 1,
    models: ["gemini-2.5-pro", "claude-3-7-sonnet"],
    strategy: "earliest-reset",
    createdAt: now,
    updatedAt: now,
  });

  const accId1 = `acc_e2e_weekly_soon_${Date.now()}`;
  const accId2 = `acc_e2e_weekly_far_${Date.now()}`;

  // Account 1: Weekly resets in 2 hours
  ProviderRepository.addAccount({
    id: accId1,
    providerId,
    name: "Weekly Soon Account",
    rawApiKey: "token-1",
  });
  ProviderRepository.updateCachedQuota(
    accId1,
    JSON.stringify({
      accountId: accId1,
      providerId,
      quotas: [
        { label: "Gemini (5h)", remainingPercentage: 100, resetAt: now + 5 * 3600 * 1000 },
        { label: "Gemini (Weekly)", remainingPercentage: 58, resetAt: now + 2 * 3600 * 1000 },
      ],
    }),
    now
  );

  // Account 2: Weekly resets in 4 days, but 5h resets in 3 hours
  ProviderRepository.addAccount({
    id: accId2,
    providerId,
    name: "Weekly Far Account",
    rawApiKey: "token-2",
  });
  ProviderRepository.updateCachedQuota(
    accId2,
    JSON.stringify({
      accountId: accId2,
      providerId,
      quotas: [
        { label: "Gemini (5h)", remainingPercentage: 98, resetAt: now + 3 * 3600 * 1000 },
        { label: "Gemini (Weekly)", remainingPercentage: 10, resetAt: now + 4 * 86400 * 1000 },
      ],
    }),
    now
  );

  const picked = LoadBalancer.pickAccount(providerId, { targetModel: "gemini-2.5-pro" });
  assert.ok(picked, "Must pick an account");
  assert.equal(
    picked.id,
    accId1,
    "LoadBalancer under earliest-reset must select Account 1 whose Weekly resets in 2 hours rather than Account 2"
  );
});
