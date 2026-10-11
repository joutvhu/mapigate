import test from "node:test";
import assert from "node:assert/strict";
import {
  calculatePercentage,
  formatResetTime,
  parseResetTime,
  getStatusColor,
  formatResetTimeDisplay,
} from "../src/core/usage/utils.js";
import { QuotaService } from "../src/core/usage/quotaService.js";
import { ProviderRepository } from "../src/storage/repositories/providerRepo.js";
import { getClaudeUsage, CLAUDE_REFRESH_INTERVAL_MS } from "../src/core/usage/handlers/claude.js";
import { extractCredentials, isTokenExpired } from "../src/core/usage/tokenHelper.js";
import {
  parseWeeklyQuotaSummary,
  fetchAntigravityWeeklyQuota,
  getAntigravityUsage,
  _clearWeeklyCache,
  CLIENT_METADATA,
  ANTIGRAVITY_LOAD_PROJECT_URL,
  ANTIGRAVITY_USER_AGENT,
  ANTIGRAVITY_IDE_VERSION,
} from "../src/core/usage/handlers/antigravity.js";

test("utils - parseResetTime correctly handles varied date formats", () => {
  assert.equal(parseResetTime(null), null);
  assert.equal(parseResetTime(undefined), null);
  assert.equal(parseResetTime(""), null);

  // ISO string
  const iso = "2026-03-30T15:00:00.000Z";
  assert.equal(parseResetTime(iso), new Date(iso).getTime());

  // Seconds timestamp (< 1e12)
  const sec = 1774882800;
  assert.equal(parseResetTime(sec), sec * 1000);

  // Milliseconds timestamp
  const ms = 1774882800000;
  assert.equal(parseResetTime(ms), ms);

  // Numeric string
  assert.equal(parseResetTime("1774882800000"), ms);
});

test("utils - calculatePercentage computes remaining percentage correctly", () => {
  assert.equal(calculatePercentage(0, 1000), 100);
  assert.equal(calculatePercentage(500, 1000), 50);
  assert.equal(calculatePercentage(1000, 1000), 0);
  assert.equal(calculatePercentage(1200, 1000), 0); // clamp min
  assert.equal(calculatePercentage(-10, 1000), 100); // clamp max
  assert.equal(calculatePercentage(0, 0), 0); // division by 0 guard
});

test("utils - formatResetTime displays appropriate countdown string", () => {
  assert.equal(formatResetTime(null), "-");

  const now = Date.now();
  // Past date
  assert.equal(formatResetTime(now - 10000), "Expired");

  // In 30 minutes
  const in30m = now + 30 * 60 * 1000;
  assert.match(formatResetTime(in30m), /30m|29m/);

  // In 5 hours 10 minutes
  const in5h = now + (5 * 3600 + 10 * 60) * 1000;
  assert.match(formatResetTime(in5h), /5h 10m|5h 9m/);

  // In 3 days 4 hours
  const in3d = now + (3 * 86400 + 4 * 3600) * 1000;
  assert.match(formatResetTime(in3d), /3d 4h|3d 3h/);
});

test("utils - getStatusColor returns expected semantic styles", () => {
  const green = getStatusColor(75);
  assert.equal(green.emoji, "🟢");
  assert.ok(green.text.includes("emerald"));

  const amber = getStatusColor(25);
  assert.equal(amber.emoji, "🟡");
  assert.ok(amber.text.includes("amber"));

  const red = getStatusColor(0);
  assert.equal(red.emoji, "🔴");
  assert.ok(red.text.includes("red"));
});

test("tokenHelper - extractCredentials and isTokenExpired work as expected", () => {
  const jsonToken = JSON.stringify({
    accessToken: "test-access-token",
    refreshToken: "test-refresh-token",
    expiresAt: Date.now() + 3600000,
    email: "dev@example.com",
  });

  const creds = extractCredentials(jsonToken);
  assert.equal(creds.accessToken, "test-access-token");
  assert.equal(creds.refreshToken, "test-refresh-token");
  assert.equal(creds.email, "dev@example.com");
  assert.equal(isTokenExpired(creds.expiresAt), false);

  // Expired token test
  assert.equal(isTokenExpired(Date.now() - 5000), true);
  assert.equal(isTokenExpired(Date.now() + 30000), true); // Within 60s safety buffer
});

test("tokenHelper - preserves githubAccessToken and prevents copilotToken overwrite", () => {
  // 1. JSON-wrapped key with githubAccessToken and projectId
  const jsonWrapped = JSON.stringify({
    access_token: "gho_sample_oauth_token",
    github_access_token: "gho_sample_oauth_token",
    project_id: "project-12345",
    copilot_token: "tid=copilot_session_token",
  });

  const creds1 = extractCredentials(jsonWrapped);
  assert.equal(creds1.githubAccessToken, "gho_sample_oauth_token");
  assert.equal(creds1.projectId, "project-12345");
  assert.equal(creds1.accessToken, "tid=copilot_session_token");
  assert.equal(creds1.providerSpecificData.githubAccessToken, "gho_sample_oauth_token");

  // 2. Plain rawApiKey with copilotToken in providerSpecificData
  const psd = {
    copilotToken: "tid=copilot_temporary_session",
    copilotTokenExpiresAt: 1740008888,
  };
  const creds2 = extractCredentials("gho_original_pat_token", psd);
  assert.equal(creds2.githubAccessToken, "gho_original_pat_token");
  assert.equal(creds2.accessToken, "tid=copilot_temporary_session");
  assert.equal(creds2.providerSpecificData.githubAccessToken, "gho_original_pat_token");
});

test("quotaService - integrates with ProviderRepository and handles mock accounts", async () => {
  const testProviderId = "test_prov_" + Date.now();
  const testAccountId = "test_acc_" + Date.now();

  // Create test provider and account
  ProviderRepository.saveProvider({
    id: testProviderId,
    name: "Test Provider",
    baseUrl: "https://api.test.com",
    format: "openai",
    isActive: true,
    priority: 1,
    models: ["test-model"],
    createdAt: Date.now(),
    updatedAt: Date.now(),
  });

  ProviderRepository.addAccount({
    id: testAccountId,
    providerId: testProviderId,
    name: "Test Developer",
    rawApiKey: "sk-test-key-12345",
  });

  const quotaService = QuotaService.getInstance();
  const result = await quotaService.fetchQuotaForAccount(testAccountId, true);

  assert.equal(result.accountId, testAccountId);
  assert.equal(result.accountName, "Test Developer");
  assert.equal(result.isActive, true);

  // Test bulk toggle
  quotaService.bulkToggle([testAccountId], false);
  const toggledAccount = ProviderRepository.getAccountById(testAccountId);
  assert.equal(toggledAccount?.isActive, false);

  quotaService.bulkToggle([testAccountId], true);
  const reToggled = ProviderRepository.getAccountById(testAccountId);
  assert.equal(reToggled?.isActive, true);

  // Cleanup
  ProviderRepository.deleteAccount(testAccountId);
  ProviderRepository.deleteProvider(testProviderId);
});

test("claudeHandler - exports correct 10-minute refresh interval and handles empty tokens gracefully", async () => {
  assert.equal(CLAUDE_REFRESH_INTERVAL_MS, 600000);

  const emptyResult = await getClaudeUsage("");
  assert.ok(emptyResult.message?.includes("Claude access token not available"));
});

test("Antigravity - parseWeeklyQuotaSummary accurately extracts weekly and session buckets", () => {
  const mockPayload = {
    groups: [
      {
        displayName: "Gemini",
        buckets: [
          {
            window: "WEEKLY",
            remainingFraction: 0.85,
            resetTime: "2026-04-05T00:00:00.000Z",
          },
          {
            window: "5h",
            remainingFraction: 0.5,
            resetTime: "2026-03-31T12:00:00.000Z",
          },
        ],
      },
      {
        displayName: "Claude & GPT",
        buckets: [
          {
            window: "WEEKLY",
            remainingFraction: 0.4,
            resetTime: "2026-04-05T00:00:00.000Z",
          },
          {
            window: "5h",
            remainingFraction: 0.1,
            resetTime: "2026-03-31T12:00:00.000Z",
          },
        ],
      },
    ],
  };

  const parsed = parseWeeklyQuotaSummary(mockPayload);

  assert.ok(parsed.gemini_weekly);
  assert.equal(parsed.gemini_weekly.remainingPercentage, 85);
  assert.equal(parsed.gemini_weekly.used, 150);
  assert.equal(parsed.gemini_weekly.total, 1000);

  assert.ok(parsed.gemini_session);
  assert.equal(parsed.gemini_session.remainingPercentage, 50);

  assert.ok(parsed.claude_gpt_weekly);
  assert.equal(parsed.claude_gpt_weekly.remainingPercentage, 40);

  assert.ok(parsed.claude_gpt_session);
  assert.equal(parsed.claude_gpt_session.remainingPercentage, 10);
});

test("Antigravity - tier detection: free-tier returns only weekly quotas without 0% session windows", async () => {
  _clearWeeklyCache();

  const mockFetch: typeof fetch = (async (url: any) => {
    const urlStr = String(url);
    if (urlStr.includes("loadCodeAssist")) {
      return {
        ok: true,
        status: 200,
        json: async () => ({
          cloudaicompanionProject: "free-project-999",
          paidTier: { id: "free-tier", name: "Free Tier" },
        }),
      } as any;
    }
    if (urlStr.includes("retrieveUserQuotaSummary")) {
      return {
        ok: true,
        status: 200,
        json: async () => ({
          groups: [
            {
              displayName: "Gemini",
              buckets: [
                {
                  window: "WEEKLY",
                  remainingFraction: 0.75,
                  resetTime: "2026-04-05T00:00:00.000Z",
                },
                {
                  window: "5h",
                  remainingFraction: 0,
                  disabled: true,
                },
              ],
            },
          ],
        }),
      } as any;
    }
    throw new Error(`Unexpected URL called: ${urlStr}`);
  }) as typeof fetch;

  const result = await getAntigravityUsage("test_ag_token", {}, { fetchFn: mockFetch });

  assert.equal(result.plan, "Free Tier");
  assert.ok(result.quotas);
  // Free tier must have weekly quota
  assert.ok(result.quotas.gemini_weekly);
  assert.equal(result.quotas.gemini_weekly.remainingPercentage, 75);
  // Free tier must NOT have misleading 0% session window
  assert.equal(result.quotas.gemini_session, undefined);
  // Free tier must not have per-model entries
  assert.equal(result.quotas["gemini-3.8-flash-high"], undefined);
});

test("Antigravity - tier detection: paid-tier returns both models and weekly/session quotas", async () => {
  _clearWeeklyCache();

  const mockFetch: typeof fetch = (async (url: any) => {
    const urlStr = String(url);
    if (urlStr.includes("loadCodeAssist")) {
      return {
        ok: true,
        status: 200,
        json: async () => ({
          cloudaicompanionProject: "paid-project-111",
          paidTier: { id: "paid-tier-advanced", name: "Gemini Advanced" },
        }),
      } as any;
    }
    if (urlStr.includes("fetchAvailableModels")) {
      return {
        ok: true,
        status: 200,
        json: async () => ({
          models: {
            "gemini-3.8-flash-high": {
              displayName: "Gemini 3.8 Flash High",
              quotaInfo: {
                remainingFraction: 0.9,
                resetTime: "2026-03-31T15:00:00.000Z",
              },
            },
            "claude-sonnet-5-5-high": {
              displayName: "Claude Sonnet 5.5",
              quotaInfo: {
                remainingFraction: 0.6,
                resetTime: "2026-03-31T15:00:00.000Z",
              },
            },
          },
        }),
      } as any;
    }
    if (urlStr.includes("retrieveUserQuotaSummary")) {
      return {
        ok: true,
        status: 200,
        json: async () => ({
          groups: [
            {
              displayName: "Gemini",
              buckets: [
                {
                  window: "WEEKLY",
                  remainingFraction: 0.8,
                  resetTime: "2026-04-05T00:00:00.000Z",
                },
                {
                  window: "5h",
                  remainingFraction: 0.9,
                  resetTime: "2026-03-31T15:00:00.000Z",
                },
              ],
            },
          ],
        }),
      } as any;
    }
    throw new Error(`Unexpected URL called: ${urlStr}`);
  }) as typeof fetch;

  const result = await getAntigravityUsage("paid_token", {}, { fetchFn: mockFetch });

  assert.equal(result.plan, "Gemini Advanced");
  assert.ok(result.quotas);
  assert.ok(result.quotas["gemini-3.8-flash-high"]);
  assert.equal(result.quotas["gemini-3.8-flash-high"].remainingPercentage, 90);
  assert.ok(result.quotas["claude-sonnet-5-5-high"]);
  assert.equal(result.quotas["claude-sonnet-5-5-high"].remainingPercentage, 60);
  assert.ok(result.quotas.gemini_weekly);
  assert.ok(result.quotas.gemini_session);
});

test("Antigravity - weekly reconciliation updates session quota when models are exhausted", async () => {
  _clearWeeklyCache();

  const resetTimeLater = "2026-03-31T18:00:00.000Z";

  const mockFetch: typeof fetch = (async (url: any) => {
    const urlStr = String(url);
    if (urlStr.includes("loadCodeAssist")) {
      return {
        ok: true,
        status: 200,
        json: async () => ({
          cloudaicompanionProject: "paid-project-222",
          paidTier: { id: "paid-tier", name: "Gemini Advanced" },
        }),
      } as any;
    }
    if (urlStr.includes("fetchAvailableModels")) {
      return {
        ok: true,
        status: 200,
        json: async () => ({
          models: {
            "gemini-3.8-flash-high": {
              displayName: "Gemini 3.8 Flash High",
              quotaInfo: {
                remainingFraction: 0.0,
                resetTime: resetTimeLater,
              },
            },
          },
        }),
      } as any;
    }
    if (urlStr.includes("retrieveUserQuotaSummary")) {
      return {
        ok: true,
        status: 200,
        json: async () => ({
          groups: [
            {
              displayName: "Gemini",
              buckets: [
                {
                  window: "WEEKLY",
                  remainingFraction: 0.5,
                  resetTime: "2026-04-05T00:00:00.000Z",
                },
                {
                  window: "5h",
                  remainingFraction: 0.8, // Upstream session summary was out of date
                  resetTime: "2026-03-31T12:00:00.000Z",
                },
              ],
            },
          ],
        }),
      } as any;
    }
    throw new Error(`Unexpected URL called: ${urlStr}`);
  }) as typeof fetch;

  const result = await getAntigravityUsage("paid_token_exhausted", {}, { fetchFn: mockFetch });

  assert.ok(result.quotas);
  // Reconciled session: exhausted models pull 5h session down to 0% and update resetAt
  assert.equal(result.quotas.gemini_session.remainingPercentage, 0);
  assert.equal(result.quotas.gemini_session.used, result.quotas.gemini_session.total);
  assert.equal(result.quotas.gemini_session.resetAt, new Date(resetTimeLater).getTime());
  // Weekly quota is NOT modified by short session exhaustion
  assert.equal(result.quotas.gemini_weekly.remainingPercentage, 50);
});

test("Antigravity - clean error handling without fabricated 100% quotas", async () => {
  _clearWeeklyCache();

  // 1. Authentication failure 401
  const mock401Fetch: typeof fetch = (async (url: any) => {
    const urlStr = String(url);
    if (urlStr.includes("loadCodeAssist")) {
      return { ok: false, status: 401 } as any;
    }
    if (urlStr.includes("fetchAvailableModels")) {
      return { ok: false, status: 401 } as any;
    }
    return { ok: false, status: 401 } as any;
  }) as typeof fetch;

  const res401 = await getAntigravityUsage("expired_token", {}, { fetchFn: mock401Fetch });
  assert.ok(res401.message?.includes("expired") || res401.error?.includes("401"));
  assert.deepEqual(res401.quotas, {});

  // 2. Empty response never fabricates 100% fake quotas
  const mockEmptyFetch: typeof fetch = (async () => {
    return { ok: true, status: 200, json: async () => ({}) } as any;
  }) as typeof fetch;

  const resEmpty = await getAntigravityUsage("valid_token", {}, { fetchFn: mockEmptyFetch });
  assert.deepEqual(resEmpty.quotas, {});
  assert.ok(resEmpty.message?.includes("No quota information available"));
});

test("Antigravity - 3-minute dedup cache prevents duplicate requests", async () => {
  _clearWeeklyCache();

  let fetchCalls = 0;
  const mockFetch: typeof fetch = (async () => {
    fetchCalls++;
    return {
      ok: true,
      status: 200,
      json: async () => ({
        groups: [
          {
            displayName: "Gemini",
            buckets: [{ window: "WEEKLY", remainingFraction: 0.9 }],
          },
        ],
      }),
    } as any;
  }) as typeof fetch;

  const token = "cache_test_token";
  const proj = "cache_proj_1";

  // First call
  const first = await fetchAntigravityWeeklyQuota(token, proj, { fetchFn: mockFetch });
  assert.equal(fetchCalls, 1);
  assert.ok(first.gemini_weekly);

  // Second call within 3 minutes - must hit cache
  const second = await fetchAntigravityWeeklyQuota(token, proj, { fetchFn: mockFetch });
  assert.equal(fetchCalls, 1);
  assert.equal(second.gemini_weekly.remainingPercentage, 90);

  // Forced refresh bypasses cache
  const third = await fetchAntigravityWeeklyQuota(token, proj, { fetchFn: mockFetch, force: true });
  assert.equal(fetchCalls, 2);
  assert.ok(third.gemini_weekly);

  _clearWeeklyCache();
});

test("QuotaService - error resilience: batch operations isolate account failures", async () => {
  const pId = "prov_resilience_" + Date.now();
  const accGoodId = "acc_good_" + Date.now();
  const accBadId = "acc_bad_" + Date.now();

  ProviderRepository.saveProvider({
    id: pId,
    name: "Resilience Provider",
    baseUrl: "https://api.test.com",
    format: "openai",
    isActive: true,
    priority: 1,
    models: ["model-1"],
    createdAt: Date.now(),
    updatedAt: Date.now(),
  });

  ProviderRepository.addAccount({
    id: accGoodId,
    providerId: pId,
    name: "Good Account",
    rawApiKey: "key_good",
  });

  ProviderRepository.addAccount({
    id: accBadId,
    providerId: pId,
    name: "Bad Account",
    rawApiKey: "key_bad",
  });

  const quotaService = QuotaService.getInstance();

  // Batch refresh must complete without throwing, returning results for both
  const results = await quotaService.batchRefresh([accGoodId, accBadId, "acc_non_existent"]);
  assert.equal(results.length, 3);

  const nonExistent = results.find((r) => r.accountId === "acc_non_existent");
  assert.ok(nonExistent?.error);

  // Cleanup
  ProviderRepository.deleteAccount(accGoodId);
  ProviderRepository.deleteAccount(accBadId);
  ProviderRepository.deleteProvider(pId);
});
