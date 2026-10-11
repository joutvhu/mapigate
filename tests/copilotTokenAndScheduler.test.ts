import test from "node:test";
import assert from "node:assert/strict";
import {
  isCopilotTokenExpiring,
  normalizeExpiryMs,
  fetchCopilotInternalToken,
  refreshGitHubOAuthToken,
  refreshCopilotToken,
  ensureFreshCopilotCredentials,
  COPILOT_TOKEN_EXPIRY_BUFFER_MS,
} from "../src/core/auth/copilotToken.js";
import {
  TokenScheduler,
  DEFAULT_SCHEDULER_INTERVAL_MS,
  DEFAULT_EXPIRY_LEAD_MS,
} from "../src/core/scheduler/tokenScheduler.js";
import {
  extractCredentials,
  ensureFreshCredentials,
  isTokenExpired,
} from "../src/core/usage/tokenHelper.js";
import { ProviderRepository } from "../src/storage/repositories/providerRepo.js";

test("CopilotToken - normalizeExpiryMs handles seconds, ms, and invalid timestamps", () => {
  assert.equal(normalizeExpiryMs(undefined), null);
  assert.equal(normalizeExpiryMs(null), null);
  assert.equal(normalizeExpiryMs(0), null);
  assert.equal(normalizeExpiryMs(-500), null);
  assert.equal(normalizeExpiryMs(NaN), null);

  // Seconds timestamp (< 1e12)
  const seconds = 1740000000;
  assert.equal(normalizeExpiryMs(seconds), 1740000000000);

  // Milliseconds timestamp (>= 1e12)
  const ms = 1740000000000;
  assert.equal(normalizeExpiryMs(ms), 1740000000000);
});

test("CopilotToken - isCopilotTokenExpiring detects expired, expiring, and valid tokens", () => {
  // Missing or invalid -> always expiring
  assert.equal(isCopilotTokenExpiring(null), true);
  assert.equal(isCopilotTokenExpiring(0), true);

  const now = Date.now();

  // Expired in the past
  const pastSeconds = Math.floor((now - 10000) / 1000);
  assert.equal(isCopilotTokenExpiring(pastSeconds), true);

  // Expiring in 2 minutes (inside default 5 min buffer)
  const soonSeconds = Math.floor((now + 2 * 60 * 1000) / 1000);
  assert.equal(isCopilotTokenExpiring(soonSeconds), true);

  // Expiring in 20 minutes (outside default 5 min buffer)
  const safeSeconds = Math.floor((now + 20 * 60 * 1000) / 1000);
  assert.equal(isCopilotTokenExpiring(safeSeconds), false);

  // Custom buffer (e.g. 30 minutes)
  assert.equal(isCopilotTokenExpiring(safeSeconds, 30 * 60 * 1000), true);
});

test("CopilotToken - fetchCopilotInternalToken calls GitHub API and returns token & expiresAt", async () => {
  let requestedUrl = "";
  let requestHeaders: any = {};

  const mockFetch: typeof fetch = (async (url: any, init: any) => {
    requestedUrl = String(url);
    requestHeaders = init?.headers || {};
    return {
      ok: true,
      status: 200,
      json: async () => ({
        token: "tid=mock_token_123;exp=1740000000",
        expires_at: 1740000000,
      }),
    } as any;
  }) as typeof fetch;

  const result = await fetchCopilotInternalToken("gho_test_oauth_token", mockFetch);

  assert.ok(result);
  assert.equal(result.token, "tid=mock_token_123;exp=1740000000");
  assert.equal(result.expiresAt, 1740000000);
  assert.equal(requestedUrl, "https://api.github.com/copilot_internal/v2/token");
  assert.equal(requestHeaders["Authorization"], "Bearer gho_test_oauth_token");
  assert.equal(requestHeaders["Editor-Version"], "vscode/1.100.0");
});

test("CopilotToken - fetchCopilotInternalToken handles error responses gracefully", async () => {
  const mockFetch: typeof fetch = (async () => {
    return {
      ok: false,
      status: 401,
      text: async () => "Bad credentials",
    } as any;
  }) as typeof fetch;

  const result = await fetchCopilotInternalToken("invalid_token", mockFetch);
  assert.equal(result, null);
});

test("CopilotToken - refreshGitHubOAuthToken calls token endpoint and returns new tokens", async () => {
  const mockFetch: typeof fetch = (async (_url: any, init: any) => {
    assert.equal(init?.method, "POST");
    return {
      ok: true,
      status: 200,
      json: async () => ({
        access_token: "gho_new_access_token",
        refresh_token: "ghr_new_refresh_token",
        expires_in: 28800,
      }),
    } as any;
  }) as typeof fetch;

  const result = await refreshGitHubOAuthToken("ghr_old_refresh_token", undefined, undefined, mockFetch);
  assert.ok(result);
  assert.equal(result.accessToken, "gho_new_access_token");
  assert.equal(result.refreshToken, "ghr_new_refresh_token");
  assert.equal(result.expiresIn, 28800);
});

test("CopilotToken - refreshCopilotToken reuses existing valid token when not forced", async () => {
  let fetchCalled = false;
  const mockFetch: typeof fetch = (async () => {
    fetchCalled = true;
    return {} as any;
  }) as typeof fetch;

  const futureSeconds = Math.floor((Date.now() + 60 * 60 * 1000) / 1000);
  const result = await refreshCopilotToken(
    {
      copilotToken: "existing_valid_token",
      copilotTokenExpiresAt: futureSeconds,
      githubAccessToken: "gho_test",
    },
    { force: false, fetchFn: mockFetch }
  );

  assert.equal(fetchCalled, false);
  assert.ok(result);
  assert.equal(result.copilotToken, "existing_valid_token");
  assert.equal(result.copilotTokenExpiresAt, futureSeconds);
});

test("CopilotToken - refreshCopilotToken fetches new token when expiring or forced", async () => {
  let fetchCount = 0;
  const mockFetch: typeof fetch = (async () => {
    fetchCount++;
    return {
      ok: true,
      status: 200,
      json: async () => ({
        token: "fresh_copilot_token",
        expires_at: 1740009999,
      }),
    } as any;
  }) as typeof fetch;

  const result = await refreshCopilotToken(
    {
      copilotToken: "expiring_copilot_token",
      copilotTokenExpiresAt: Math.floor((Date.now() + 60 * 1000) / 1000), // expiring in 1m
      githubAccessToken: "gho_test",
    },
    { force: false, fetchFn: mockFetch }
  );

  assert.equal(fetchCount, 1);
  assert.ok(result);
  assert.equal(result.copilotToken, "fresh_copilot_token");
  assert.equal(result.copilotTokenExpiresAt, 1740009999);
});

test("CopilotToken - refreshCopilotToken falls back to refresh_token if initial call fails", async () => {
  const calls: string[] = [];
  const mockFetch: typeof fetch = (async (url: any) => {
    const urlStr = String(url);
    calls.push(urlStr);

    if (urlStr.includes("copilot_internal")) {
      if (calls.length === 1) {
        // First copilot token attempt fails
        return { ok: false, status: 401, text: async () => "Expired" } as any;
      }
      // Second attempt succeeds after refreshing parent token
      return {
        ok: true,
        status: 200,
        json: async () => ({ token: "minted_after_oauth_refresh", expires_at: 1740008888 }),
      } as any;
    }

    if (urlStr.includes("access_token")) {
      return {
        ok: true,
        status: 200,
        json: async () => ({ access_token: "refreshed_gho_token", refresh_token: "new_ghr_token" }),
      } as any;
    }

    return { ok: false, status: 500 } as any;
  }) as typeof fetch;

  const result = await refreshCopilotToken(
    {
      githubAccessToken: "stale_gho",
      refreshToken: "valid_ghr",
    },
    { force: true, fetchFn: mockFetch }
  );

  assert.ok(result);
  assert.equal(result.copilotToken, "minted_after_oauth_refresh");
  assert.equal(result.githubAccessToken, "refreshed_gho_token");
  assert.equal(result.refreshToken, "new_ghr_token");
});

test("CopilotToken - ensureFreshCopilotCredentials updates SQLite account in repository", async () => {
  // Setup a test provider and account
  const providerId = "github";
  const accountId = `test_cp_acc_${Date.now()}`;

  const existingProvider = ProviderRepository.getProviderById(providerId);
  if (!existingProvider) {
    const defaults = ProviderRepository.getProviderWithDefaults(providerId);
    if (defaults) ProviderRepository.saveProvider(defaults);
  }

  ProviderRepository.addAccount({
    id: accountId,
    providerId,
    name: "Test Copilot Account",
    rawApiKey: "gho_test_user_pat",
    providerSpecificData: {
      githubAccessToken: "gho_test_user_pat",
      copilotToken: "stale_token",
      copilotTokenExpiresAt: Math.floor((Date.now() - 10000) / 1000), // expired
    },
  });

  const mockFetch: typeof fetch = (async () => {
    return {
      ok: true,
      status: 200,
      json: async () => ({
        token: "persisted_fresh_token",
        expires_at: 1740007777,
      }),
    } as any;
  }) as typeof fetch;

  const account = ProviderRepository.getAllAccounts().find((a) => a.id === accountId);
  assert.ok(account);

  const res = await ensureFreshCopilotCredentials(account, { fetchFn: mockFetch });
  assert.ok(res);
  assert.equal(res.copilotToken, "persisted_fresh_token");
  assert.equal(res.copilotTokenExpiresAt, 1740007777);

  // Check persisted in database
  const updated = ProviderRepository.getAllAccounts().find((a) => a.id === accountId);
  assert.ok(updated);
  assert.equal(updated.providerSpecificData?.copilotToken, "persisted_fresh_token");
  assert.equal(updated.providerSpecificData?.copilotTokenExpiresAt, 1740007777);

  // Cleanup test account
  ProviderRepository.deleteAccount(accountId);
});

test("TokenScheduler - Lifecycle start, stop, and status tracking", () => {
  const scheduler = new TokenScheduler({ intervalMs: 3000, leadMs: 60000 });
  assert.equal(scheduler.isRunning(), false);

  const initialStatus = scheduler.getStatus();
  assert.equal(initialStatus.isRunning, false);
  assert.equal(initialStatus.intervalMs, 3000);
  assert.equal(initialStatus.leadMs, 60000);

  scheduler.start();
  assert.equal(scheduler.isRunning(), true);
  assert.equal(scheduler.getStatus().isRunning, true);

  scheduler.stop();
  assert.equal(scheduler.isRunning(), false);
  assert.equal(scheduler.getStatus().isRunning, false);
});

test("TokenScheduler - runTick refreshes expiring Copilot & Antigravity accounts", async () => {
  const scheduler = new TokenScheduler({ leadMs: 10 * 60 * 1000 });

  const now = Date.now();
  const accounts = [
    {
      id: "acc_cp_expiring",
      providerId: "github",
      name: "Expiring Copilot",
      isActive: true,
      rawApiKey: "gho_test_1",
      providerSpecificData: {
        githubAccessToken: "gho_test_1",
        copilotToken: "cp_expiring_soon",
        copilotTokenExpiresAt: Math.floor((now + 2 * 60 * 1000) / 1000), // in 2m -> inside 10m lead
      },
    },
    {
      id: "acc_cp_valid",
      providerId: "github",
      name: "Valid Copilot",
      isActive: true,
      rawApiKey: "gho_test_2",
      providerSpecificData: {
        githubAccessToken: "gho_test_2",
        copilotToken: "cp_valid_token",
        copilotTokenExpiresAt: Math.floor((now + 60 * 60 * 1000) / 1000), // in 1 hour -> valid
      },
    },
    {
      id: "acc_non_oauth",
      providerId: "openai",
      name: "Plain API Key",
      isActive: true,
      rawApiKey: "sk-plain-key",
      providerSpecificData: {},
    },
  ];

  // Run tick with mocked accounts
  const tickResult = await scheduler.runTick({ accounts, now });

  assert.equal(tickResult.total, 3);
  // Valid copilot and non-oauth accounts should be skipped
  assert.ok(tickResult.skipped >= 1);
  assert.equal(scheduler.getStatus().tickCount, 1);
  assert.ok(scheduler.getStatus().lastTickAt !== null);
});

test("TokenScheduler - runTick fail-open design prevents errors from throwing", async () => {
  const scheduler = new TokenScheduler();

  const malformedAccounts = [
    {
      id: "acc_broken",
      providerId: "github",
      name: "Broken PSD",
      isActive: true,
      get providerSpecificData() {
        throw new Error("Simulated unexpected getter failure");
      },
    },
  ];

  // Must not throw
  const result = await scheduler.runTick({ accounts: malformedAccounts });
  assert.equal(result.total, 1);
  assert.equal(result.failed, 1);
  assert.equal(result.refreshed, 0);
});

test("tokenHelper - extractCredentials and ensureFreshCredentials integrate with GitHub Copilot", async () => {
  const psd = {
    copilotToken: "cp_extracted_token",
    copilotTokenExpiresAt: 1740005555,
  };

  const creds = extractCredentials("gho_oauth_secret", psd);
  assert.equal(creds.accessToken, "cp_extracted_token");
  assert.equal(creds.apiKey, "cp_extracted_token");
  assert.equal(creds.expiresAt, 1740005555000);

  // isTokenExpired normalizes seconds timestamps
  const pastSeconds = Math.floor((Date.now() - 10000) / 1000);
  assert.equal(isTokenExpired(pastSeconds), true);

  const futureSeconds = Math.floor((Date.now() + 3600 * 1000) / 1000);
  assert.equal(isTokenExpired(futureSeconds), false);
});
