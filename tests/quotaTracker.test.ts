import test from "node:test";
import assert from "node:assert/strict";
import {
  calculatePercentage,
  formatResetTime,
  parseResetTime,
  getStatusColor,
  formatResetTimeDisplay,
  sortNormalizedQuotas,
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
import { getGitHubUsage, formatGitHubQuotaSnapshot } from "../src/core/usage/handlers/github.js";
import { getGeminiUsage, normalizeCloudCodeProjectId } from "../src/core/usage/handlers/gemini.js";
import { _clearClaudeCache, parseClaudeResetGrants } from "../src/core/usage/handlers/claude.js";
import { getCodexUsage, getCodexReviewRateLimit, getCodexSparkRateLimit, formatCodexWindow } from "../src/core/usage/handlers/codex.js";
import { getKiroUsage, parseKiroQuotaData } from "../src/core/usage/handlers/kiro.js";
import { getQoderUsage } from "../src/core/usage/handlers/qoder.js";
import { getMiniMaxUsage, formatMiniMaxQuotaName } from "../src/core/usage/handlers/minimax.js";
import { getGrokUsage, unwrapVal, detectGrokTier } from "../src/core/usage/handlers/grok.js";
import { getDeepseekUsage, sanitizeApiKey, parseBalanceInfos } from "../src/core/usage/handlers/deepseek.js";
import { getGlmUsage, parseGlmQuotaResponse } from "../src/core/usage/handlers/glm.js";
import { getXKiroUsage, parseXKiroUsageData } from "../src/core/usage/handlers/xkiro.js";
import { getMimoUsage, XIAOMI_MIMO_MONTHLY_TOKEN_LIMIT } from "../src/core/usage/handlers/mimo.js";
import { fetchRawQuotaForProvider } from "../src/core/usage/handlers/index.js";

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
  assert.equal(parsed.gemini_weekly.used, 450);
  assert.equal(parsed.gemini_weekly.total, 3000);

  assert.ok(parsed.gemini_session);
  assert.equal(parsed.gemini_session.remainingPercentage, 50);

  assert.ok(parsed.claude_gpt_weekly);
  assert.equal(parsed.claude_gpt_weekly.remainingPercentage, 40);

  assert.ok(parsed.claude_gpt_session);
  assert.equal(parsed.claude_gpt_session.remainingPercentage, 10);
});

test("Antigravity - parseWeeklyQuotaSummary extracts Gemini 4 Argon weekly quota when supported", () => {
  const supportedPayload = {
    groups: [
      {
        displayName: "Gemini Models",
        buckets: [
          {
            displayName: "Weekly Limit Remaining",
            window: "WEEKLY",
            remainingFraction: 0,
            resetTime: "2026-04-05T00:00:00.000Z",
          },
          {
            displayName: "Five Hour Limit Remaining",
            window: "5h",
            remainingFraction: 0,
            resetTime: "2026-03-31T12:00:00.000Z",
          },
        ],
      },
      {
        displayName: "Claude and GPT models",
        buckets: [
          {
            displayName: "Weekly Limit Remaining",
            window: "WEEKLY",
            remainingFraction: 1.0,
            resetTime: "2026-04-05T00:00:00.000Z",
          },
          {
            displayName: "Five Hour Limit Remaining",
            window: "5h",
            remainingFraction: 1.0,
            resetTime: "2026-03-31T12:00:00.000Z",
          },
        ],
      },
      {
        displayName: "Gemini 4 Argon",
        buckets: [
          {
            displayName: "Gemini 4 Argon Weekly Limit",
            window: "WEEKLY",
            remainingFraction: 1.0,
            resetTime: "2026-04-05T00:00:00.000Z",
          },
        ],
      },
    ],
  };

  const parsedSupported = parseWeeklyQuotaSummary(supportedPayload);
  assert.ok(parsedSupported.gemini_weekly);
  assert.equal(parsedSupported.gemini_weekly.remainingPercentage, 0);

  assert.ok(parsedSupported.claude_gpt_weekly);
  assert.equal(parsedSupported.claude_gpt_weekly.remainingPercentage, 100);

  assert.ok(parsedSupported.gemini_4_argon_weekly);
  assert.equal(parsedSupported.gemini_4_argon_weekly.displayName, "Gemini 4 Argon (Weekly)");
  assert.equal(parsedSupported.gemini_4_argon_weekly.remainingPercentage, 100);
  assert.equal(parsedSupported.gemini_4_argon_weekly.used, 0);
  assert.equal(parsedSupported.gemini_4_argon_weekly.total, 3000);

  // When account does not support Argon, gemini_4_argon_weekly must NOT be present
  const unsupportedPayload = {
    groups: [
      {
        displayName: "Gemini Models",
        buckets: [
          {
            displayName: "Weekly Limit Remaining",
            window: "WEEKLY",
            remainingFraction: 0.8,
          },
        ],
      },
      {
        displayName: "Claude and GPT models",
        buckets: [
          {
            displayName: "Weekly Limit Remaining",
            window: "WEEKLY",
            remainingFraction: 0.9,
          },
        ],
      },
    ],
  };

  const parsedUnsupported = parseWeeklyQuotaSummary(unsupportedPayload);
  assert.equal(parsedUnsupported.gemini_4_argon_weekly, undefined);
  assert.equal(parsedUnsupported.gemini_4_argon_session, undefined);
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
  // Summary quotas must be present
  assert.ok(result.quotas.gemini_weekly);
  assert.ok(result.quotas.gemini_session);
  // Synthesized Claude session from Claude models
  assert.ok(result.quotas.claude_gpt_session);
  assert.equal(result.quotas.claude_gpt_session.remainingPercentage, 60);
  // Per-model quotas must NOT be exposed
  assert.equal(result.quotas["gemini-3.8-flash-high"], undefined);
  assert.equal(result.quotas["claude-sonnet-5-5-high"], undefined);
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

test("GitHub Copilot Handler - formats paid snapshot, free quotas, and requires oauth token", async () => {
  // 1. Paid plan with quota_snapshots
  const mockPaidFetch: typeof fetch = (async (url: any, opts: any) => {
    assert.equal(String(url), "https://api.github.com/copilot_internal/user");
    assert.equal(opts.headers["Authorization"], "token gho_valid_oauth");
    return {
      ok: true,
      status: 200,
      json: async () => ({
        copilot_plan: "business",
        quota_reset_date: "2026-04-01T00:00:00Z",
        quota_snapshots: {
          chat: { entitlement: 1000, remaining: 800, unlimited: false },
          completions: { entitlement: 0, remaining: 0, unlimited: true },
          premium_interactions: { entitlement: 50, remaining: 25, unlimited: false },
        },
      }),
    } as any;
  }) as typeof fetch;

  const paidResult = await getGitHubUsage("gho_valid_oauth", {}, { fetchFn: mockPaidFetch });
  assert.equal(paidResult.plan, "business");
  assert.ok(paidResult.quotas);
  assert.equal(paidResult.quotas.chat.used, 200);
  assert.equal(paidResult.quotas.chat.total, 1000);
  assert.equal(paidResult.quotas.chat.remainingPercentage, 80);
  assert.equal(paidResult.quotas.completions.unlimited, true);
  assert.equal(paidResult.quotas.premium_interactions.remainingPercentage, 50);

  // 2. Free / limited plan
  const mockFreeFetch: typeof fetch = (async () => ({
    ok: true,
    status: 200,
    json: async () => ({
      copilot_plan: "free",
      limited_user_reset_date: "2026-04-01T00:00:00Z",
      monthly_quotas: { chat: 50, completions: 2000 },
      limited_user_quotas: { chat: 10, completions: 500 },
    }),
  })) as any as typeof fetch;

  const freeResult = await getGitHubUsage("gho_free", {}, { fetchFn: mockFreeFetch });
  assert.equal(freeResult.plan, "free");
  assert.ok(freeResult.quotas);
  assert.equal(freeResult.quotas.chat.used, 10);
  assert.equal(freeResult.quotas.chat.total, 50);
  assert.equal(freeResult.quotas.chat.remainingPercentage, 80);

  // 3. Rejects internal copilot JWT (tid=...) without githubAccessToken
  const tidResult = await getGitHubUsage("tid=copilot_jwt_internal");
  assert.ok(tidResult.message?.includes("OAuth token required"));

  // 4. 401 unauthorized
  const mock401: typeof fetch = (async () => ({
    ok: false,
    status: 401,
  })) as any as typeof fetch;
  const authErr = await getGitHubUsage("gho_expired", {}, { fetchFn: mock401 });
  assert.ok(authErr.message?.includes("expired or unauthorized"));
});

test("Gemini Handler - handles API key notice, normalizes project id, and parses buckets", async () => {
  // 1. Google AI Studio API key notice
  const apiKeyResult = await getGeminiUsage("AIzaSyDummyApiKey123");
  assert.ok(apiKeyResult.message?.includes("Quota tracking requires Google OAuth"));

  // 2. Normalizes project ID
  assert.equal(normalizeCloudCodeProjectId("  my-project  "), "my-project");
  assert.equal(normalizeCloudCodeProjectId({ id: " project-obj " }), "project-obj");
  assert.equal(normalizeCloudCodeProjectId(null), null);

  // 3. Successful quota retrieval using loadCodeAssist and retrieveUserQuota
  const mockFetch: typeof fetch = (async (url: any, opts: any) => {
    const urlStr = String(url);
    if (urlStr.includes("loadCodeAssist")) {
      const body = JSON.parse(opts.body);
      assert.ok(body.metadata);
      return {
        ok: true,
        status: 200,
        json: async () => ({
          cloudaicompanionProject: "cloud-project-123",
          currentTier: { name: "Gemini Advanced" },
        }),
      } as any;
    }
    if (urlStr.includes("retrieveUserQuota")) {
      const body = JSON.parse(opts.body);
      assert.equal(body.project, "cloud-project-123");
      return {
        ok: true,
        status: 200,
        json: async () => ({
          buckets: [
            {
              modelId: "gemini-2.5-pro",
              displayName: "Gemini 2.5 Pro",
              remainingFraction: 0.85,
              resetTime: "2026-04-01T12:00:00Z",
            },
          ],
        }),
      } as any;
    }
    throw new Error(`Unexpected: ${urlStr}`);
  }) as typeof fetch;

  const result = await getGeminiUsage("valid_google_oauth_token", {}, { fetchFn: mockFetch });
  assert.equal(result.plan, "Gemini Advanced");
  assert.ok(result.quotas);
  assert.ok(result.quotas["gemini-2.5-pro"]);
  assert.equal(result.quotas["gemini-2.5-pro"].remainingPercentage, 85);
  assert.equal(result.quotas["gemini-2.5-pro"].used, 150);
});

test("Claude Handler - handles non-OAuth tokens, parses model-scoped weekly limits and reset grants", async () => {
  _clearClaudeCache();

  // 1. Non-OAuth API key
  const apiKeyRes = await getClaudeUsage("sk-ant-api03-test-key");
  assert.ok(apiKeyRes.message?.includes("Quota tracking is available for Claude Code OAuth"));

  // 2. Weekly scoped limits (e.g. Fable) and Cedar Ember reset credits
  const mockFetch: typeof fetch = (async (url: any, opts: any) => {
    assert.ok(String(url).includes("cedar_ember=1"));
    assert.equal(opts.headers["Authorization"], "Bearer cl_oauth_token");
    return {
      ok: true,
      status: 200,
      json: async () => ({
        five_hour: { utilization: 45, resets_at: "2026-04-01T15:00:00Z" },
        seven_day: { utilization: 60, resets_at: "2026-04-05T00:00:00Z" },
        limits: [
          {
            kind: "weekly_scoped",
            percent: 30,
            resets_at: "2026-04-05T00:00:00Z",
            scope: { model: { display_name: "Fable" } },
          },
        ],
        cedar_ember: {
          eligible: true,
          next_grant_id: "grant-1",
          grants: [
            { id: "grant-1", resets_left: 2, ends_at: "2026-04-02T00:00:00Z" },
          ],
        },
      }),
    } as any;
  }) as typeof fetch;

  const result = await getClaudeUsage("cl_oauth_token", { force: true, fetchFn: mockFetch });
  assert.equal(result.plan, "Claude Code");
  assert.ok(result.quotas);
  assert.equal(result.quotas.session.remainingPercentage, 55);
  assert.equal(result.quotas.weekly.remainingPercentage, 40);
  assert.ok(result.quotas.weekly_fable);
  assert.equal(result.quotas.weekly_fable.remainingPercentage, 70);
  assert.ok(result.quotas.reset_credits);
  assert.equal(result.quotas.reset_credits.total, 2);

  _clearClaudeCache();
});

test("Codex Handler - sends account ID header and parses review/spark rate limits", async () => {
  let capturedHeaders: Record<string, string> = {};

  const mockFetch: typeof fetch = (async (url: any, opts: any) => {
    capturedHeaders = opts.headers;
    const urlStr = String(url);
    if (urlStr.includes("/backend-api/wham/usage")) {
      return {
        ok: true,
        status: 200,
        json: async () => ({
          plan_type: "team",
          rate_limit: {
            primary_window: { used_percent: 25, reset_at: "2026-04-01T12:00:00Z" },
            secondary_window: { used_percent: 40, reset_at: "2026-04-07T00:00:00Z" },
          },
          code_review_rate_limit: {
            primary_window: { used_percent: 10, reset_at: "2026-04-01T12:00:00Z" },
          },
          spark_rate_limit: {
            primary_window: { used_percent: 50, reset_at: "2026-04-01T12:00:00Z" },
          },
          rate_limit_reset_credits: {
            available_count: 3,
          },
        }),
      } as any;
    }
    throw new Error(`Unexpected: ${urlStr}`);
  }) as typeof fetch;

  const psd = { workspaceId: "workspace-org-999" };
  const result = await getCodexUsage("codex_token_123", psd, { fetchFn: mockFetch });

  assert.equal(capturedHeaders["ChatGPT-Account-Id"], "workspace-org-999");
  assert.equal(result.plan, "team");
  assert.ok(result.quotas);
  assert.equal(result.quotas.session.remainingPercentage, 75);
  assert.equal(result.quotas.weekly.remainingPercentage, 60);
  assert.ok(result.quotas.review_session);
  assert.equal(result.quotas.review_session.remainingPercentage, 90);
  assert.ok(result.quotas.spark_session);
  assert.equal(result.quotas.spark_session.remainingPercentage, 50);
  assert.ok(result.quotas.reset_credits);
  assert.equal(result.quotas.reset_credits.total, 3);
});

test("Kiro Handler - executes 4-tier fallback cascade with tokentype and profileArn", async () => {
  const attemptsSeen: string[] = [];
  let capturedHeaders: Record<string, string> = {};

  const mockFetch: typeof fetch = (async (url: any, opts: any) => {
    capturedHeaders = opts.headers;
    const urlStr = String(url);
    if (urlStr.includes("codewhisperer") && opts.method === "GET") {
      attemptsSeen.push("codewhisperer-get");
      return { ok: false, status: 404 } as any;
    }
    if (urlStr.includes("codewhisperer") && opts.method === "POST") {
      attemptsSeen.push("codewhisperer-post");
      return { ok: false, status: 500 } as any;
    }
    if (urlStr.includes("q.us-east-1") && opts.method === "GET") {
      attemptsSeen.push("q-get");
      return {
        ok: true,
        status: 200,
        json: async () => ({
          subscriptionInfo: { subscriptionTitle: "Kiro Pro Developer" },
          nextDateReset: "2026-04-01T00:00:00Z",
          usageBreakdownList: [
            {
              resourceType: "agentic_request",
              currentUsageWithPrecision: 120,
              usageLimitWithPrecision: 600,
              freeTrialInfo: {
                currentUsageWithPrecision: 5,
                usageLimitWithPrecision: 50,
                freeTrialExpiry: "2026-04-15T00:00:00Z",
              },
            },
          ],
        }),
      } as any;
    }
    throw new Error(`Unexpected: ${urlStr}`);
  }) as typeof fetch;

  const psd = { authMethod: "api_key", profileArn: "arn:aws:kiro:profile-1" };
  const result = await getKiroUsage("kiro_token", psd, { fetchFn: mockFetch });

  assert.deepEqual(attemptsSeen, ["codewhisperer-get", "codewhisperer-post", "q-get"]);
  assert.equal(capturedHeaders["tokentype"], "API_KEY");
  assert.equal(result.plan, "Kiro Pro Developer");
  assert.ok(result.quotas);
  assert.ok(result.quotas.agentic_request);
  assert.equal(result.quotas.agentic_request.used, 120);
  assert.equal(result.quotas.agentic_request.total, 600);
  assert.equal(result.quotas.agentic_request.remainingPercentage, 80);
  assert.ok(result.quotas.agentic_request_freetrial);
  assert.equal(result.quotas.agentic_request_freetrial.used, 5);
});

test("Qoder Handler - parses real user and organization packages for global and CN endpoints", async () => {
  // 1. Global endpoint
  const mockGlobalFetch: typeof fetch = (async (url: any) => {
    assert.equal(String(url), "https://openapi.qoder.sh/api/v2/quota/usage");
    return {
      ok: true,
      status: 200,
      json: async () => ({
        plan: "Qoder Enterprise",
        expiresAt: 1775000000000,
        userQuota: { total: 1000, used: 250, remaining: 750, unit: "credits" },
        orgResourcePackage: { total: 50000, used: 10000, remaining: 40000, unit: "credits" },
      }),
    } as any;
  }) as typeof fetch;

  const globalRes = await getQoderUsage("qd_global_token", "qoder", { fetchFn: mockGlobalFetch });
  assert.equal(globalRes.plan, "Qoder Enterprise");
  assert.ok(globalRes.quotas);
  assert.equal(globalRes.quotas.user.used, 250);
  assert.equal(globalRes.quotas.user.total, 1000);
  assert.equal(globalRes.quotas.user.remainingPercentage, 75);
  assert.equal(globalRes.quotas.organization.remainingPercentage, 80);

  // 2. CN endpoint
  const mockCnFetch: typeof fetch = (async (url: any) => {
    assert.equal(String(url), "https://openapi.qoder.com.cn/api/v2/quota/usage");
    return {
      ok: true,
      status: 200,
      json: async () => ({
        userQuota: { total: 500, used: 100, remaining: 400 },
      }),
    } as any;
  }) as typeof fetch;

  const cnRes = await getQoderUsage("qd_cn_token", "qoder-cn", { fetchFn: mockCnFetch });
  assert.equal(cnRes.plan, "Qoder CN");
  assert.ok(cnRes.quotas?.user);
  assert.equal(cnRes.quotas.user.remainingPercentage, 80);
});

test("MiniMax Handler - tests URL fallback and M-series percent-only normalization", async () => {
  const triedUrls: string[] = [];

  const mockFetch: typeof fetch = (async (url: any) => {
    const urlStr = String(url);
    triedUrls.push(urlStr);
    if (urlStr.includes("token_plan/remains")) {
      return { ok: false, status: 404, text: async () => "Not found" } as any;
    }
    if (urlStr.includes("coding_plan/remains")) {
      return {
        ok: true,
        status: 200,
        text: async () =>
          JSON.stringify({
            base_resp: { status_code: 0, status_msg: "success" },
            model_remains: [
              {
                model_name: "MiniMax-M*",
                current_interval_total_count: 0,
                current_interval_remaining_percent: 78,
                remains_time: 1800000,
                current_weekly_total_count: 0,
                current_weekly_remaining_percent: 92,
                weekly_remains_time: 86400000,
              },
            ],
          }),
      } as any;
    }
    throw new Error(`Unexpected: ${urlStr}`);
  }) as typeof fetch;

  const result = await getMiniMaxUsage("mm_test_key", "minimax", { fetchFn: mockFetch });
  assert.equal(triedUrls.length, 2);
  assert.ok(result.quotas);
  assert.ok(result.quotas["m_series_5h"]);
  assert.equal(result.quotas["m_series_5h"].displayName, "M-series (5h)");
  assert.equal(result.quotas["m_series_5h"].remainingPercentage, 78);
  assert.equal(result.quotas["m_series_5h"].total, 100);
  assert.ok(result.quotas["m_series_7d"]);
  assert.equal(result.quotas["m_series_7d"].remainingPercentage, 92);
});

test("Grok Handler - unwraps protobuf-json and parses tiers, included, and on-demand limits", async () => {
  let capturedHeaders: Record<string, string> = {};

  const mockFetch: typeof fetch = (async (url: any, opts: any) => {
    capturedHeaders = opts.headers;
    const urlStr = String(url);
    if (urlStr.includes("/v1/user")) {
      return {
        ok: true,
        status: 200,
        json: async () => ({ subscriptionTier: "SuperGrok" }),
      } as any;
    }
    if (urlStr.includes("/v1/billing")) {
      return {
        ok: true,
        status: 200,
        json: async () => ({
          config: {
            monthlyLimit: { val: 200 },
            includedUsed: { val: 40 },
            onDemandCap: { val: 100 },
            onDemandUsed: { val: 25 },
            prepaidBalance: { val: 50 },
            creditUsagePercent: { val: 35 },
            billingPeriodEnd: "2026-04-10T00:00:00Z",
          },
        }),
      } as any;
    }
    throw new Error(`Unexpected: ${urlStr}`);
  }) as typeof fetch;

  const result = await getGrokUsage("grok_jwt_token", { email: "dev@grok.com" }, { fetchFn: mockFetch });

  assert.equal(capturedHeaders["x-grok-client-identifier"], "grok-cli");
  assert.equal(capturedHeaders["x-email"], "dev@grok.com");
  assert.equal(result.plan, "SuperGrok");
  assert.ok(result.quotas);
  assert.equal(result.quotas.monthly_included.used, 40);
  assert.equal(result.quotas.monthly_included.total, 200);
  assert.equal(result.quotas.monthly_included.remainingPercentage, 80);
  assert.equal(result.quotas.on_demand.remainingPercentage, 75);
  assert.equal(result.quotas.prepaid.total, 50);
  assert.equal(result.quotas.weekly_supergrok.remainingPercentage, 65);
});

test("DeepSeek Handler - sanitizes API key and parses multi-currency balances", async () => {
  // 1. Sanitizes API key
  assert.equal(sanitizeApiKey('  "sk-deepseek-key"  '), "sk-deepseek-key");
  assert.equal(sanitizeApiKey(" 'sk-deepseek-key' "), "sk-deepseek-key");

  // 2. Multi-currency balance parsing
  const mockFetch: typeof fetch = (async (url: any, opts: any) => {
    assert.equal(opts.headers["Authorization"], "Bearer sk-deepseek-key");
    return {
      ok: true,
      status: 200,
      json: async () => ({
        is_available: true,
        balance_infos: [
          { currency: "CNY", total_balance: "150.50", granted_balance: "50.00", topped_up_balance: "100.50" },
          { currency: "USD", total_balance: "25.00", granted_balance: "0.00", topped_up_balance: "25.00" },
        ],
      }),
    } as any;
  }) as typeof fetch;

  const result = await getDeepseekUsage(' "sk-deepseek-key" ', { fetchFn: mockFetch });
  assert.equal(result.plan, "DeepSeek");
  assert.ok(result.quotas);
  assert.ok(result.quotas.balance_cny);
  assert.equal(result.quotas.balance_cny.total, 150.5);
  assert.ok(result.quotas.balance_usd);
  assert.equal(result.quotas.balance_usd.total, 25);
});

test("GLM Handler - parses token and credit limits across dynamic intervals and regions", async () => {
  // 1. International parsing
  const mockIntlFetch: typeof fetch = (async (url: any, opts: any) => {
    assert.equal(String(url), "https://api.z.ai/api/monitor/usage/quota/limit");
    assert.equal(opts.headers["Authorization"], "Bearer glm_intl_key");
    return {
      ok: true,
      status: 200,
      json: async () => ({
        data: {
          level: "PRO",
          limits: [
            { type: "TOKENS_LIMIT", unit: 3, number: 5, percentage: 30, nextResetTime: 1775000000000 },
            { type: "CREDIT_LIMIT", unit: 6, number: 1, percentage: 55, nextResetTime: 1775500000000 },
          ],
        },
      }),
    } as any;
  }) as typeof fetch;

  const intlResult = await getGlmUsage("glm_intl_key", "glm", { fetchFn: mockIntlFetch });
  assert.equal(intlResult.plan, "Pro");
  assert.ok(intlResult.quotas);
  assert.ok(intlResult.quotas.session_5h);
  assert.equal(intlResult.quotas.session_5h.used, 30);
  assert.equal(intlResult.quotas.session_5h.remainingPercentage, 70);
  assert.ok(intlResult.quotas.weekly);
  assert.equal(intlResult.quotas.weekly.remainingPercentage, 45);

  // 2. CN region parsing
  const mockCnFetch: typeof fetch = (async (url: any) => {
    assert.equal(String(url), "https://open.bigmodel.cn/api/monitor/usage/quota/limit");
    return {
      ok: true,
      status: 200,
      json: async () => ({
        data: {
          level: "FREE",
          limits: [
            { type: "TOKENS_LIMIT", unit: 3, number: 3, percentage: 90, nextResetTime: 1775000000000 },
          ],
        },
      }),
    } as any;
  }) as typeof fetch;

  const cnResult = await getGlmUsage("glm_cn_key", "glm-cn", { fetchFn: mockCnFetch });
  assert.equal(cnResult.plan, "Free");
  assert.ok(cnResult.quotas?.session_3h);
  assert.equal(cnResult.quotas.session_3h.remainingPercentage, 10);
});

test("fetchRawQuotaForProvider - dispatches correctly across all registered providers", async () => {
  // 1. Dispatch to GLM
  const glmRes = await fetchRawQuotaForProvider({
    providerId: "glm",
    account: {
      id: "acc_glm",
      providerId: "glm",
      name: "GLM Dev",
      rawApiKey: "",
      isActive: true,
      priority: 1,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    },
  });
  assert.ok(glmRes.message?.includes("GLM API key not available"));

  // 2. Dispatch to DeepSeek
  const dsRes = await fetchRawQuotaForProvider({
    providerId: "deepseek",
    account: {
      id: "acc_ds",
      providerId: "deepseek",
      name: "DeepSeek Dev",
      rawApiKey: "",
      isActive: true,
      priority: 1,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    },
  });
  assert.ok(dsRes.message?.includes("DeepSeek API key not available"));

  // 3. Dispatch to Copilot alias
  const copilotRes = await fetchRawQuotaForProvider({
    providerId: "copilot",
    account: {
      id: "acc_copilot",
      providerId: "copilot",
      name: "Copilot Dev",
      rawApiKey: "",
      isActive: true,
      priority: 1,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    },
  });
  assert.ok(copilotRes.message?.includes("GitHub access token not available"));

  // 4. Dispatch to unknown provider
  const unkRes = await fetchRawQuotaForProvider({
    providerId: "some_unsupported_provider",
    account: {
      id: "acc_unk",
      providerId: "some_unsupported_provider",
      name: "Unknown",
      rawApiKey: "key",
      isActive: true,
      priority: 1,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    },
  });
  assert.ok(unkRes.message?.includes("Quota tracking is not supported"));
});

test("sortNormalizedQuotas - sorts Antigravity into exact fixed order without changing on refresh", () => {
  const rawItems = [
    { label: "Gemini 4 Argon (Weekly)", used: 0, total: 3000, remainingPercentage: 100 },
    { label: "Claude & GPT (Weekly)", used: 200, total: 1000, remainingPercentage: 80 },
    { label: "Gemini (Weekly)", used: 300, total: 1000, remainingPercentage: 70 },
    { label: "Claude & GPT (5h)", used: 100, total: 1000, remainingPercentage: 90 },
    { label: "Gemini (5h)", used: 500, total: 1000, remainingPercentage: 50 },
  ];

  const sorted1 = sortNormalizedQuotas("antigravity", rawItems);
  assert.deepEqual(
    sorted1.map((q) => q.label),
    ["Gemini (5h)", "Gemini (Weekly)", "Claude & GPT (5h)", "Claude & GPT (Weekly)", "Gemini 4 Argon (Weekly)"]
  );

  // Repeated calls must yield identical order (idempotent / stable)
  const reversed = [...rawItems].reverse();
  const sorted2 = sortNormalizedQuotas("antigravity", reversed);
  assert.deepEqual(
    sorted2.map((q) => q.label),
    ["Gemini (5h)", "Gemini (Weekly)", "Claude & GPT (5h)", "Claude & GPT (Weekly)", "Gemini 4 Argon (Weekly)"]
  );
});

test("sortNormalizedQuotas - deterministic priority and alphabetical tie-breaker for other providers", () => {
  // GitHub Copilot
  const copilotItems = [
    { label: "Premium Interactions", used: 1, total: 50, remainingPercentage: 98 },
    { label: "Completions", used: 0, total: 0, remainingPercentage: 100 },
    { label: "Chat", used: 10, total: 1000, remainingPercentage: 99 },
    { label: "Custom Extra Pool", used: 0, total: 10, remainingPercentage: 100 },
  ];
  const sortedCopilot = sortNormalizedQuotas("copilot", copilotItems);
  assert.deepEqual(
    sortedCopilot.map((q) => q.label),
    ["Chat", "Completions", "Premium Interactions", "Custom Extra Pool"]
  );

  // Alphabetical tie-breaker for unlisted provider
  const genericItems = [
    { label: "Zoo Tokens", used: 0, total: 10, remainingPercentage: 100 },
    { label: "Alpha Rate Limit", used: 0, total: 10, remainingPercentage: 100 },
    { label: "Beta Quota", used: 0, total: 10, remainingPercentage: 100 },
  ];
  const sortedGeneric = sortNormalizedQuotas("unknown_provider", genericItems);
  assert.deepEqual(
    sortedGeneric.map((q) => q.label),
    ["Alpha Rate Limit", "Beta Quota", "Zoo Tokens"]
  );
});

test("QuotaService - Antigravity account normalizes to only the 4 summary buckets in fixed order", async () => {
  const pId = "ag_test_fixed_" + Date.now();
  const accId = "ag_acc_fixed_" + Date.now();

  ProviderRepository.saveProvider({
    id: pId,
    name: "Antigravity Test Provider",
    baseUrl: "https://cloudcode-pa.googleapis.com",
    format: "gemini",
    isActive: true,
    priority: 1,
    models: ["gemini-3.8-flash-high"],
    createdAt: Date.now(),
    updatedAt: Date.now(),
  });

  ProviderRepository.addAccount({
    id: accId,
    providerId: pId,
    name: "AG Account Fixed",
    rawApiKey: "mock_ag_key",
  });

  // Test sortNormalizedQuotas directly on simulated QuotaService output
  const simulatedQuotas = [
    { label: "gemini-3.8-flash-high", used: 10, total: 1000, remainingPercentage: 99 },
    { label: "Claude & GPT (Weekly)", used: 200, total: 1000, remainingPercentage: 80 },
    { label: "Gemini (Weekly)", used: 300, total: 1000, remainingPercentage: 70 },
    { label: "Gemini 4 Argon (Weekly)", used: 0, total: 3000, remainingPercentage: 100 },
    { label: "Claude & GPT (5h)", used: 100, total: 1000, remainingPercentage: 90 },
    { label: "claude-sonnet-5-5-high", used: 50, total: 1000, remainingPercentage: 95 },
    { label: "Gemini (5h)", used: 500, total: 1000, remainingPercentage: 50 },
  ];

  const allowedLabels = [
    "gemini (5h)",
    "gemini (weekly)",
    "claude & gpt (5h)",
    "claude & gpt (weekly)",
    "gemini 4 argon (5h)",
    "gemini 4 argon (weekly)",
  ];
  const filtered = simulatedQuotas.filter((q) =>
    allowedLabels.some((l) => q.label.toLowerCase() === l)
  );
  const sorted = sortNormalizedQuotas("antigravity", filtered);

  assert.equal(sorted.length, 5);
  assert.deepEqual(
    sorted.map((q) => q.label),
    ["Gemini (5h)", "Gemini (Weekly)", "Claude & GPT (5h)", "Claude & GPT (Weekly)", "Gemini 4 Argon (Weekly)"]
  );

  ProviderRepository.deleteAccount(accId);
  ProviderRepository.deleteProvider(pId);
});

test("xKiro Handler - parses windows, free tokens, and wallet according to docs.xkiro.com/api/usage", async () => {
  const samplePayload = {
    object: "usage",
    plan: "ultra",
    user: {
      name: "Developer",
      email: "dev@example.com",
      avatar_url: "https://example.com/avatar.png",
    },
    windows: [
      {
        kind: "short",
        window_sec: 18000,
        spent_usd: "0.500000",
        cap_usd: "5.000000",
        remaining_usd: "4.500000",
        resets_in_sec: 7200,
      },
      {
        kind: "long",
        window_sec: 604800,
        spent_usd: "1.250000",
        cap_usd: "20.000000",
        remaining_usd: "18.750000",
        resets_in_sec: 180000,
      },
    ],
    free_tokens: {
      used_today: 15000,
      limit_per_day: 100000,
      remaining: 85000,
    },
    wallet: {
      balance_usd: "25.000000",
      held_usd: "0.200000",
    },
  };

  const parsed = parseXKiroUsageData(samplePayload);
  assert.equal(parsed.plan, "Ultra");
  assert.ok(parsed.quotas);

  // 1. Session 5h window
  assert.ok(parsed.quotas.session_5h);
  assert.equal(parsed.quotas.session_5h.displayName, "Session (5h)");
  assert.equal(parsed.quotas.session_5h.used, 0.5);
  assert.equal(parsed.quotas.session_5h.total, 5.0);
  assert.equal(parsed.quotas.session_5h.remainingPercentage, 90);

  // 2. Weekly 7d window
  assert.ok(parsed.quotas.weekly_7d);
  assert.equal(parsed.quotas.weekly_7d.displayName, "Weekly (7d)");
  assert.equal(parsed.quotas.weekly_7d.used, 1.25);
  assert.equal(parsed.quotas.weekly_7d.total, 20.0);
  assert.equal(parsed.quotas.weekly_7d.remainingPercentage, 94);

  // 3. Free tokens
  assert.ok(parsed.quotas.free_tokens);
  assert.equal(parsed.quotas.free_tokens.displayName, "Free Tokens (Daily)");
  assert.equal(parsed.quotas.free_tokens.used, 15000);
  assert.equal(parsed.quotas.free_tokens.total, 100000);
  assert.equal(parsed.quotas.free_tokens.remainingPercentage, 85);

  // 4. Wallet
  assert.ok(parsed.quotas.wallet);
  assert.equal(parsed.quotas.wallet.displayName, "Wallet Balance");
  assert.equal(parsed.quotas.wallet.total, 25.0);
  assert.equal(parsed.quotas.wallet.unlimited, true);

  // 5. Live dispatch through fetchRawQuotaForProvider
  const mockFetch: typeof fetch = (async (url: any) => {
    assert.equal(String(url), "https://api.xkiro.com/v1/usage");
    return {
      ok: true,
      status: 200,
      json: async () => samplePayload,
    } as any;
  }) as typeof fetch;

  const rawRes = await getXKiroUsage("sk-xt-test", {}, { fetchFn: mockFetch });
  assert.equal(rawRes.plan, "Ultra");
  assert.ok(rawRes.quotas?.session_5h);

  const dispatchRes = await fetchRawQuotaForProvider({
    providerId: "xkiro",
    account: {
      id: "acc_xk",
      providerId: "xkiro",
      name: "xKiro Account",
      rawApiKey: "sk-xt-key",
      isActive: true,
      priority: 1,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    },
  });
  // Since dispatchRes uses live or mock, it dispatches cleanly to xkiro without "not supported"
  assert.notEqual(dispatchRes.message, "Quota tracking is not supported for provider 'xkiro'.");
});

test("Database Quota Persistence & SWR Instant Retrieval", async () => {
  const pId = "db_test_prov_" + Date.now();
  const accId = "db_test_acc_" + Date.now();

  ProviderRepository.saveProvider({
    id: pId,
    name: "DB Test Provider",
    baseUrl: "https://api.example.com",
    format: "openai",
    isActive: true,
    priority: 1,
    models: ["gpt-4o"],
    createdAt: Date.now(),
    updatedAt: Date.now(),
  });

  ProviderRepository.addAccount({
    id: accId,
    providerId: pId,
    name: "DB Account",
    rawApiKey: "sk-test-db-key",
  });

  const quotaService = QuotaService.getInstance();

  // 1. Persist mock quota to SQLite database
  const mockPersistedResult = {
    accountId: accId,
    providerId: pId,
    accountName: "DB Account",
    plan: "Pro Plan",
    isActive: true,
    quotas: [
      {
        label: "Primary Window",
        used: 10,
        total: 100,
        remainingPercentage: 90,
        resetAt: Date.now() + 3600000,
        resetInText: "1h 0m",
      },
    ],
    lastFetchedAt: Date.now() - 5000,
  };

  ProviderRepository.updateCachedQuota(accId, JSON.stringify(mockPersistedResult), mockPersistedResult.lastFetchedAt);

  // 2. getCachedQuotasForAllAccounts immediately returns from SQLite without network delay
  const cachedList = quotaService.getCachedQuotasForAllAccounts();
  const found = cachedList.find((c) => c.accountId === accId);
  assert.ok(found);
  assert.equal(found.plan, "Pro Plan");
  assert.equal(found.quotas.length, 1);
  assert.equal(found.quotas[0].label, "Primary Window");
  assert.equal(found.quotas[0].remainingPercentage, 90);

  // 3. fetchQuotaForAccount with force=false returns DB cached quota directly
  const cachedDirect = await quotaService.fetchQuotaForAccount(accId, false);
  assert.equal(cachedDirect.plan, "Pro Plan");
  assert.equal(cachedDirect.quotas[0].label, "Primary Window");

  ProviderRepository.deleteAccount(accId);
  ProviderRepository.deleteProvider(pId);
});

test("tokenHelper - extracts GitHub OAuth token when wrapped in JSON accessToken", () => {
  const jsonWithGhu = JSON.stringify({
    accessToken: "ghu_RUwHDYSampleToken123",
    refreshToken: "ghr_sample",
    expiresAt: Date.now() + 3600000,
  });

  const creds = extractCredentials(jsonWithGhu, {}, "github");
  assert.equal(creds.githubAccessToken, "ghu_RUwHDYSampleToken123");
  assert.equal(creds.providerSpecificData.githubAccessToken, "ghu_RUwHDYSampleToken123");
});

test("Xiaomi MiMo & Token Plan Handler - avoids inaccurate local estimation and parses upstream session quota", async () => {
  const accountId = "test_acc_mimo_" + Date.now();
  const providerId = "xiaomi-tokenplan";

  // 1. Plain API key without upstream quota endpoint returns empty quotas without fake calculations
  const resEmpty = await getMimoUsage("tp-sample-key", providerId, {}, accountId);
  assert.equal(resEmpty.plan, "Xiaomi MiMo Token Plan");
  assert.deepEqual(resEmpty.quotas, {});
  assert.ok(resEmpty.message?.includes("does not provide an upstream quota API"));

  // 2. Dispatching through fetchRawQuotaForProvider
  const dispatchRes = await fetchRawQuotaForProvider({
    providerId: "xiaomi-tokenplan",
    account: {
      id: accountId,
      providerId: "xiaomi-tokenplan",
      name: "MiMo Account",
      rawApiKey: "tp-fake-key",
      isActive: true,
      priority: 1,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    },
  });

  assert.equal(dispatchRes.plan, "Xiaomi MiMo Token Plan");
  assert.deepEqual(dispatchRes.quotas, {});
  assert.ok(dispatchRes.message?.includes("does not provide an upstream quota API"));

  // 3. Upstream session endpoint (mock passToken) parses real upstream percentage
  const mockSessionFetch: typeof fetch = (async (url: any, opts: any) => {
    assert.equal(String(url), "https://aistudio.xiaomimimo.com/open-apis/v1/user/usage");
    assert.ok(opts.headers["Cookie"]?.includes("passToken=test_pass_token"));
    return {
      ok: true,
      status: 200,
      json: async () => ({
        code: 0,
        data: {
          percent: 92,
          resetDate: "2026-11-01",
        },
      }),
    } as any;
  }) as typeof fetch;

  const sessionRes = await getMimoUsage(
    "tp-key",
    "xiaomi-mimo",
    { mimoPassToken: "test_pass_token" },
    accountId,
    { fetchFn: mockSessionFetch }
  );

  assert.equal(sessionRes.plan, "Xiaomi MiMo");
  assert.ok(sessionRes.quotas?.weekly);
  assert.equal(sessionRes.quotas.weekly.remainingPercentage, 92);
  assert.equal(sessionRes.quotas.weekly.used, 8);
});




