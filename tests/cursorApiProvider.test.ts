import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import {
  PROVIDER_REGISTRY,
  getRegistryProvider,
  getAllRegistryProviders,
} from "../src/shared/constants/providerRegistry.js";
import { ProviderRegistry } from "../src/providers/core/registry.js";
import {
  isCursorApiKey,
  readJwtExpiryMs,
  exchangeCursorApiKey,
  resolveCursorSessionToken,
  invalidateCursorSessionToken,
  __resetCursorApiKeyAuthForTest,
  CursorApiKeyExchangeError,
  CURSOR_API_KEY_EXCHANGE_URL,
  REFRESH_SKEW_MS,
} from "../src/providers/runtime/cursor-api/auth.js";
import { CursorApiProvider } from "../src/providers/runtime/cursor-api/provider.js";
import type { ProviderRequestContext } from "../src/providers/core/types.js";

function makeFakeJwt(expSeconds: number): string {
  const header = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url");
  const payload = Buffer.from(
    JSON.stringify({ sub: "user-123", exp: expSeconds, type: "api_key_token" })
  ).toString("base64url");
  return `${header}.${payload}.fake-sig`;
}

test("Cursor API Provider - Metadata & Registry Configuration", () => {
  const cua = PROVIDER_REGISTRY["cursor-api"];
  assert.ok(cua, "cursor-api must be registered in PROVIDER_REGISTRY");
  assert.equal(cua.id, "cursor-api");
  assert.equal(cua.name, "Cursor API");
  assert.equal(cua.alias, "cua");
  assert.deepEqual(cua.aliases, ["cua", "cursor-api"]);
  assert.equal(cua.uiAlias, "cua");
  assert.equal(cua.color, "#00D4AA");
  assert.equal(cua.iconBg, "#00D4AA");
  assert.equal(cua.image, "/assets/providers/cursor-api/icon.png");
  assert.equal(cua.website, "https://cursor.com/dashboard/api");
  assert.equal(cua.category, "apikey");
  assert.equal(cua.authType, "apikey");
  assert.equal(cua.baseUrl, "https://api2.cursor.sh");
  assert.equal(cua.format, "openai");
  assert.equal(cua.passthroughModels, true);

  const modelIds = cua.models.map((m) => m.id);
  assert.ok(modelIds.includes("claude-3.5-sonnet"), "Must include claude-3.5-sonnet");
  assert.ok(modelIds.includes("claude-3.7-sonnet"), "Must include claude-3.7-sonnet");
  assert.ok(modelIds.includes("gpt-4o"), "Must include gpt-4o");
  assert.ok(modelIds.includes("o1"), "Must include o1");
  assert.ok(modelIds.includes("o3-mini"), "Must include o3-mini");
  assert.ok(modelIds.includes("deepseek-r1"), "Must include deepseek-r1");
});

test("Cursor API Provider - Resolution by ID and Aliases", () => {
  const byId = getRegistryProvider("cursor-api");
  assert.ok(byId, "Resolvable by 'cursor-api'");
  assert.equal(byId.id, "cursor-api");

  const byUpperId = getRegistryProvider("CURSOR-API");
  assert.ok(byUpperId, "Resolvable case-insensitively");
  assert.equal(byUpperId.id, "cursor-api");

  const byAlias = getRegistryProvider("cua");
  assert.ok(byAlias, "Resolvable by alias 'cua'");
  assert.equal(byAlias.id, "cursor-api");

  const byUpperAlias = getRegistryProvider("CUA");
  assert.ok(byUpperAlias, "Resolvable by uppercase alias 'CUA'");
  assert.equal(byUpperAlias.id, "cursor-api");

  const all = getAllRegistryProviders();
  assert.ok(all.some((p) => p.id === "cursor-api"), "Present in getAllRegistryProviders");

  const runtimeInstance = ProviderRegistry.get("cursor-api");
  assert.ok(runtimeInstance, "ProviderRegistry.get('cursor-api') returns instance");
  assert.equal(runtimeInstance.id, "cursor-api");
});

test("Cursor API Provider - Auth Validation & JWT Expiry Extraction", () => {
  assert.equal(isCursorApiKey("crsr_abc123xyz"), true);
  assert.equal(isCursorApiKey("crsr_"), true);
  assert.equal(isCursorApiKey("sk-ant-api-key"), false);
  assert.equal(isCursorApiKey(""), false);
  assert.equal(isCursorApiKey(null), false);
  assert.equal(isCursorApiKey(undefined), false);

  const expSec = Math.floor(Date.now() / 1000) + 3600;
  const token = makeFakeJwt(expSec);
  assert.equal(readJwtExpiryMs(token), expSec * 1000);
  assert.equal(readJwtExpiryMs("invalid.token"), null);
  assert.equal(readJwtExpiryMs("not-a-jwt"), null);
});

test("Cursor API Provider - Token Exchange Logic with Mock Fetch", async () => {
  __resetCursorApiKeyAuthForTest();

  await assert.rejects(
    async () => {
      await exchangeCursorApiKey("sk-invalid-key");
    },
    (err: any) => err instanceof CursorApiKeyExchangeError && err.status === 400
  );

  const targetExpSec = Math.floor(Date.now() / 1000) + 3600;
  const fakeAccessToken = makeFakeJwt(targetExpSec);

  const mockFetch: typeof fetch = async (url, init) => {
    assert.equal(url, CURSOR_API_KEY_EXCHANGE_URL);
    assert.equal(init?.method, "POST");
    assert.equal(
      (init?.headers as Record<string, string>)?.authorization,
      "Bearer crsr_test_key_123"
    );
    return new Response(
      JSON.stringify({ accessToken: fakeAccessToken, refreshToken: "refresh-token-456" }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  };

  const exchanged = await exchangeCursorApiKey("crsr_test_key_123", {
    fetchImpl: mockFetch as any,
  });
  assert.equal(exchanged.accessToken, fakeAccessToken);
  assert.equal(exchanged.refreshToken, "refresh-token-456");
  assert.equal(exchanged.expiresAt, targetExpSec * 1000);

  const rejectingFetch: typeof fetch = async () => {
    return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
  };
  await assert.rejects(
    async () => {
      await exchangeCursorApiKey("crsr_bad_key", { fetchImpl: rejectingFetch as any });
    },
    (err: any) => err instanceof CursorApiKeyExchangeError && err.status === 401
  );
});

test("Cursor API Provider - Session Caching & Skew", async () => {
  __resetCursorApiKeyAuthForTest();

  let fetchCallCount = 0;
  const targetExpSec = Math.floor(Date.now() / 1000) + 3600;
  const fakeAccessToken = makeFakeJwt(targetExpSec);

  const countingFetch: typeof fetch = async () => {
    fetchCallCount++;
    return new Response(
      JSON.stringify({ accessToken: fakeAccessToken, refreshToken: null }),
      { status: 200 }
    );
  };

  const session1 = await resolveCursorSessionToken("crsr_cache_test", {
    fetchImpl: countingFetch as any,
  });
  assert.equal(fetchCallCount, 1);
  assert.equal(session1.accessToken, fakeAccessToken);

  const session2 = await resolveCursorSessionToken("crsr_cache_test", {
    fetchImpl: countingFetch as any,
  });
  assert.equal(fetchCallCount, 1);
  assert.equal(session2.accessToken, fakeAccessToken);

  const simulatedNearFuture = targetExpSec * 1000 - (REFRESH_SKEW_MS - 1000);
  await resolveCursorSessionToken("crsr_cache_test", {
    fetchImpl: countingFetch as any,
    now: () => simulatedNearFuture,
  });
  assert.equal(fetchCallCount, 2);

  invalidateCursorSessionToken("crsr_cache_test");
  await resolveCursorSessionToken("crsr_cache_test", { fetchImpl: countingFetch as any });
  assert.equal(fetchCallCount, 3);
});

test("Cursor API Provider - In-flight Deduplication", async () => {
  __resetCursorApiKeyAuthForTest();

  let fetchCallCount = 0;
  const targetExpSec = Math.floor(Date.now() / 1000) + 3600;
  const fakeAccessToken = makeFakeJwt(targetExpSec);

  const delayedFetch: typeof fetch = async () => {
    fetchCallCount++;
    await new Promise((resolve) => setTimeout(resolve, 50));
    return new Response(
      JSON.stringify({ accessToken: fakeAccessToken, refreshToken: null }),
      { status: 200 }
    );
  };

  const [res1, res2] = await Promise.all([
    resolveCursorSessionToken("crsr_concurrent_key", { fetchImpl: delayedFetch as any }),
    resolveCursorSessionToken("crsr_concurrent_key", { fetchImpl: delayedFetch as any }),
  ]);

  assert.equal(fetchCallCount, 1, "Concurrent requests must be deduplicated into 1 upstream call");
  assert.equal(res1.accessToken, fakeAccessToken);
  assert.equal(res2.accessToken, fakeAccessToken);
});

test("Cursor API Provider - Header Injection & Auth Refresh on 401", async () => {
  __resetCursorApiKeyAuthForTest();

  const targetExpSec = Math.floor(Date.now() / 1000) + 3600;
  const fakeToken1 = makeFakeJwt(targetExpSec);
  const fakeToken2 = makeFakeJwt(targetExpSec + 1000);
  let exchangeCount = 0;

  const mockFetch: typeof fetch = async () => {
    exchangeCount++;
    const token = exchangeCount === 1 ? fakeToken1 : fakeToken2;
    return new Response(
      JSON.stringify({ accessToken: token, refreshToken: null }),
      { status: 200 }
    );
  };

  await resolveCursorSessionToken("crsr_refresh_key", { fetchImpl: mockFetch as any });

  const provider = new CursorApiProvider();
  const fakeContext: ProviderRequestContext = {
    req: { headers: {} } as any,
    targetModel: "claude-3.5-sonnet",
    clientFormat: "openai",
    provider: PROVIDER_REGISTRY["cursor-api"],
    account: {
      id: "acc_1",
      name: "Cursor Account",
      provider: "cursor-api",
      rawApiKey: "crsr_refresh_key",
    } as any,
  };

  const headers = await provider.buildHeaders(fakeContext);
  assert.equal(headers["Authorization"], `Bearer ${fakeToken1}`);
  assert.equal(headers["Content-Type"], "application/json");

  const ignored = await provider.handleAuthRefresh(fakeContext, 500);
  assert.equal(ignored, false);

  invalidateCursorSessionToken("crsr_refresh_key");
  const refreshedToken = await resolveCursorSessionToken("crsr_refresh_key", {
    fetchImpl: mockFetch as any,
  });
  assert.equal(refreshedToken.accessToken, fakeToken2);

  const iconPath = path.resolve(process.cwd(), "src/providers/runtime/cursor-api/assets/icon.png");
  assert.ok(fs.existsSync(iconPath), "cursor-api icon.png must exist");
  assert.ok(fs.statSync(iconPath).size > 0, "cursor-api icon.png must be non-empty");
});
