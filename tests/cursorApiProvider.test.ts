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
  buildCursorApiAuthHeaders,
  verifyCursorApiKey,
  CursorApiAuthError,
  CURSOR_API_BASE_URL,
  CURSOR_API_VERIFY_PATH,
  CURSOR_API_MODELS_PATH,
} from "../src/providers/runtime/cursor-api/auth.js";
import { CursorApiProvider } from "../src/providers/runtime/cursor-api/provider.js";
import type { ProviderRequestContext } from "../src/providers/core/types.js";

test("Cursor API Provider - Metadata & Registry Configuration", () => {
  const cua = PROVIDER_REGISTRY["cursor-api"];
  assert.ok(cua, "cursor-api must be registered in PROVIDER_REGISTRY");
  assert.equal(cua.id, "cursor-api");
  assert.equal(cua.name, "Cursor API");
  assert.equal(cua.alias, "cua");
  assert.deepEqual(cua.aliases, ["cua", "cursor-api"]);
  assert.equal(cua.uiAlias, "cua");
  assert.equal(cua.color, "#00D4AA");
  assert.equal(cua.iconBg, "#ffffff");
  assert.equal(cua.image, "/assets/providers/cursor-api/icon.png");
  assert.equal(cua.website, "https://cursor.com/dashboard/api");
  assert.equal(cua.category, "apikey");
  assert.equal(cua.authType, "apikey");
  assert.equal(cua.baseUrl, "https://api.cursor.com");
  assert.deepEqual(cua.baseUrls, ["https://api.cursor.com"]);
  assert.equal(cua.validateUrl, "https://api.cursor.com/v1/models");
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

test("Cursor API Provider - Official Auth & Header Building", () => {
  assert.equal(isCursorApiKey("crsr_abc123xyz"), true);
  assert.equal(isCursorApiKey("crsr_live_key"), true);
  assert.equal(isCursorApiKey("key_service_account"), true);
  assert.equal(isCursorApiKey(""), false);
  assert.equal(isCursorApiKey(null), false);
  assert.equal(isCursorApiKey(undefined), false);

  const headers = buildCursorApiAuthHeaders("crsr_test_123");
  assert.equal(headers["Authorization"], "Bearer crsr_test_123");
  assert.equal(headers["Content-Type"], "application/json");
  assert.equal(headers["Accept"], "application/json");

  const emptyHeaders = buildCursorApiAuthHeaders("");
  assert.equal(emptyHeaders["Authorization"], undefined);
});

test("Cursor API Provider - verifyCursorApiKey against /v1/me", async () => {
  await assert.rejects(
    async () => {
      await verifyCursorApiKey("");
    },
    (err: any) => err instanceof CursorApiAuthError && err.status === 400
  );

  const mockSuccessFetch: typeof fetch = async (url, init) => {
    assert.equal(url, `${CURSOR_API_BASE_URL}${CURSOR_API_VERIFY_PATH}`);
    assert.equal(init?.method, "GET");
    assert.equal(
      (init?.headers as Record<string, string>)?.Authorization,
      "Bearer crsr_valid_test_key"
    );
    return new Response(
      JSON.stringify({
        apiKeyName: "Test Key",
        userId: 12345,
        userEmail: "developer@example.com",
      }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  };

  const user = await verifyCursorApiKey("crsr_valid_test_key", {
    fetchImpl: mockSuccessFetch as any,
  });
  assert.equal(user.userId, 12345);
  assert.equal(user.userEmail, "developer@example.com");

  const mockUnauthorizedFetch: typeof fetch = async () => {
    return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
  };
  await assert.rejects(
    async () => {
      await verifyCursorApiKey("crsr_invalid_key", { fetchImpl: mockUnauthorizedFetch as any });
    },
    (err: any) => err instanceof CursorApiAuthError && err.status === 401
  );

  const mockForbiddenFetch: typeof fetch = async () => {
    return new Response(JSON.stringify({ error: "Forbidden" }), { status: 403 });
  };
  await assert.rejects(
    async () => {
      await verifyCursorApiKey("crsr_free_key", { fetchImpl: mockForbiddenFetch as any });
    },
    (err: any) => err instanceof CursorApiAuthError && err.status === 403
  );
});

test("Cursor API Provider - Header Injection via Provider Context", async () => {
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
      rawApiKey: "crsr_official_key",
    } as any,
  };

  const headers = await provider.buildHeaders(fakeContext);
  assert.equal(headers["Authorization"], "Bearer crsr_official_key");
  assert.equal(headers["Content-Type"], "application/json");

  const iconPath = path.resolve(process.cwd(), "src/providers/runtime/cursor-api/assets/icon.png");
  assert.ok(fs.existsSync(iconPath), "cursor-api icon.png must exist");
  assert.ok(fs.statSync(iconPath).size > 0, "cursor-api icon.png must be non-empty");
});

test("Cursor API Provider - probeModels handles live models and auth checks", async () => {
  const provider = new CursorApiProvider();

  // Empty key fails fast
  const emptyRes = await provider.probeModels({
    apiKey: "",
    account: { id: "acc_empty", name: "Empty", rawApiKey: "" } as any,
  });
  assert.equal(emptyRes?.success, false);
  assert.match(emptyRes?.error || "", /Cursor API key is required/);

  // Invalid key fails
  const invalidRes = await provider.probeModels({
    apiKey: "crsr_invalid_key_testing_123",
    account: { id: "acc_inv", name: "Invalid", rawApiKey: "crsr_invalid_key_testing_123" } as any,
  });
  assert.equal(invalidRes?.success, false);
  assert.ok(invalidRes?.error);
});
