import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import app from "../src/server/index.js";
import { getRegistryProvider } from "../src/shared/constants/providerRegistry.js";
import { ProviderRepository } from "../src/storage/repositories/providerRepo.js";
import { LoadBalancer } from "../src/core/router/loadBalancer.js";
import { OpenAiCompatibleProvider } from "../src/providers/core/base/openAiProvider.js";
import { AnthropicCompatibleProvider } from "../src/providers/core/base/anthropicProvider.js";
import { extractTokenFromAccount, checkBinaryInstalled } from "../src/providers/core/base/baseProvider.js";
import type { ProviderRequestContext } from "../src/providers/core/types.js";

test("No-API-Key Providers - Metadata Configuration", () => {
  // 1. opencode
  const oc = getRegistryProvider("opencode");
  assert.ok(oc, "opencode must exist in registry");
  assert.equal(oc.authType, "none");
  assert.equal(oc.requiresApiKey, false);
  assert.equal(oc.noAuth, true);

  // 2. ollama-local
  const ollama = getRegistryProvider("ollama-local");
  assert.ok(ollama, "ollama-local must exist in registry");
  assert.equal(ollama.category, "freeTier");
  assert.equal(ollama.authType, "none");
  assert.equal(ollama.requiresApiKey, false);
  assert.equal(ollama.isLocal, true);
  assert.equal(ollama.defaultBaseUrl, "http://localhost:11434/api/chat");

  // 3. lm-studio
  const lms = getRegistryProvider("lm-studio");
  assert.ok(lms, "lm-studio must exist in registry");
  assert.equal(lms.category, "freeTier");
  assert.equal(lms.authType, "none");
  assert.equal(lms.requiresApiKey, false);
  assert.equal(lms.isLocal, true);
  assert.equal(lms.baseUrl, "http://localhost:1234/v1");
  assert.equal(lms.defaultBaseUrl, "http://localhost:1234/v1");

  // 4. jan
  const jan = getRegistryProvider("jan");
  assert.ok(jan, "jan must exist in registry");
  assert.equal(jan.category, "freeTier");
  assert.equal(jan.authType, "none");
  assert.equal(jan.requiresApiKey, false);
  assert.equal(jan.isLocal, true);
  assert.equal(jan.baseUrl, "http://localhost:1337/v1");
  assert.equal(jan.defaultBaseUrl, "http://localhost:1337/v1");
});

test("No-API-Key Providers - Header Construction Without Empty Authorization", async () => {
  const openaiProv = new OpenAiCompatibleProvider({
    id: "lm-studio",
    name: "LM Studio",
    requiresApiKey: false,
    isLocal: true,
  });

  const baseContext: ProviderRequestContext = {
    req: { headers: {} } as any,
    targetModel: "local-model",
    clientFormat: "openai",
    targetFormat: "openai",
    body: {},
    provider: {
      id: "lm-studio",
      name: "LM Studio",
      baseUrl: "http://localhost:1234/v1",
      format: "openai",
      isActive: true,
      priority: 1,
      models: ["local-model"],
      requiresApiKey: false,
      isLocal: true,
      authType: "none",
      createdAt: Date.now(),
      updatedAt: Date.now(),
    },
    requestId: "test-req-1",
    startTime: Date.now(),
    clientTool: "test",
    rawModel: "local-model",
    rtkStats: { compressedTokens: 0, tokensSaved: 0 },
  };

  // 1. Without account / without key -> no Authorization header
  const headersNoAccount = await openaiProv.buildHeaders(baseContext);
  assert.equal(headersNoAccount["Authorization"], undefined, "Must not attach Authorization when key is absent");
  assert.equal(headersNoAccount["Content-Type"], "application/json");

  // 2. With empty account key -> no Authorization header
  const contextEmptyKey = {
    ...baseContext,
    account: { id: "acc_1", providerId: "lm-studio", name: "Local", rawApiKey: "", apiKeyEncrypted: "", isActive: true, rateLimitHits: 0 },
  };
  const headersEmptyKey = await openaiProv.buildHeaders(contextEmptyKey);
  assert.equal(headersEmptyKey["Authorization"], undefined, "Must not attach Authorization when rawApiKey is empty string");

  // 3. If user explicitly provided an API key, attach Authorization header
  const contextWithKey = {
    ...baseContext,
    account: { id: "acc_2", providerId: "lm-studio", name: "Local", rawApiKey: "custom-local-token", apiKeyEncrypted: "", isActive: true, rateLimitHits: 0 },
  };
  const headersWithKey = await openaiProv.buildHeaders(contextWithKey);
  assert.equal(headersWithKey["Authorization"], "Bearer custom-local-token");

  // 4. Anthropic compatible provider with no key -> no x-api-key or Authorization
  const anthropicProv = new AnthropicCompatibleProvider({
    id: "anthropic-local",
    requiresApiKey: false,
    isLocal: true,
  });
  const anthropicHeaders = await anthropicProv.buildHeaders(baseContext);
  assert.equal(anthropicHeaders["x-api-key"], undefined, "Must not attach x-api-key when key is absent");
  assert.equal(anthropicHeaders["Authorization"], undefined);
  assert.equal(anthropicHeaders["anthropic-version"], "2023-06-01");
});

test("No-API-Key Providers - Custom Account Base URL Resolution", () => {
  const openaiProv = new OpenAiCompatibleProvider({
    id: "lm-studio",
    name: "LM Studio",
    requiresApiKey: false,
    isLocal: true,
  });

  const baseContext: ProviderRequestContext = {
    req: { headers: {} } as any,
    targetModel: "local-model",
    clientFormat: "openai",
    targetFormat: "openai",
    body: {},
    provider: {
      id: "lm-studio",
      name: "LM Studio",
      baseUrl: "http://localhost:1234/v1",
      format: "openai",
      isActive: true,
      priority: 1,
      models: ["local-model"],
      requiresApiKey: false,
      isLocal: true,
      authType: "none",
      createdAt: Date.now(),
      updatedAt: Date.now(),
    },
    requestId: "test-req-url",
    startTime: Date.now(),
    clientTool: "test",
    rawModel: "local-model",
    rtkStats: { compressedTokens: 0, tokensSaved: 0 },
  };

  // 1. Without account -> uses context.provider.baseUrl
  const defaultUrl = openaiProv.buildUrl(baseContext);
  assert.equal(defaultUrl, "http://localhost:1234/v1/chat/completions");

  // 2. With account having custom baseUrl -> prioritizes account.providerSpecificData.baseUrl
  const customContext: ProviderRequestContext = {
    ...baseContext,
    account: {
      id: "acc_custom_1",
      providerId: "lm-studio",
      name: "LAN LM Studio",
      rawApiKey: "",
      apiKeyEncrypted: "",
      isActive: true,
      rateLimitHits: 0,
      providerSpecificData: {
        baseUrl: "http://192.168.1.50:1234/v1",
      },
    },
  };
  const customUrl = openaiProv.buildUrl(customContext);
  assert.equal(customUrl, "http://192.168.1.50:1234/v1/chat/completions");

  // 3. With custom baseUrl lacking /v1
  const customNoV1Context: ProviderRequestContext = {
    ...baseContext,
    account: {
      id: "acc_custom_2",
      providerId: "lm-studio",
      name: "LAN LM Studio Without V1",
      rawApiKey: "",
      apiKeyEncrypted: "",
      isActive: true,
      rateLimitHits: 0,
      providerSpecificData: {
        baseUrl: "http://192.168.1.50:1234",
      },
    },
  };
  const customNoV1Url = openaiProv.buildUrl(customNoV1Context);
  assert.equal(customNoV1Url, "http://192.168.1.50:1234/v1/chat/completions");

  // 4. Anthropic compatible provider with custom account baseUrl
  const anthropicProv = new AnthropicCompatibleProvider({
    id: "anthropic-local",
    requiresApiKey: false,
    isLocal: true,
  });
  const anthropicCustomContext: ProviderRequestContext = {
    ...baseContext,
    provider: {
      ...baseContext.provider,
      format: "claude",
    },
    account: {
      id: "acc_custom_3",
      providerId: "anthropic-local",
      name: "Custom Anthropic Host",
      rawApiKey: "",
      apiKeyEncrypted: "",
      isActive: true,
      rateLimitHits: 0,
      providerSpecificData: {
        baseUrl: "http://192.168.1.60:8000/v1",
      },
    },
  };
  const anthropicCustomUrl = anthropicProv.buildUrl(anthropicCustomContext);
  assert.equal(anthropicCustomUrl, "http://192.168.1.60:8000/v1/messages");
});

test("No-API-Key Providers - Virtual Account Resolution & Load Balancing", () => {
  // Virtual account resolution for lm-studio
  const lmsAccounts = ProviderRepository.getAccountsByProvider("lm-studio");
  assert.ok(lmsAccounts.length >= 1, "Must return at least 1 virtual account for lm-studio");
  assert.equal(lmsAccounts[0].providerId, "lm-studio");
  assert.equal(lmsAccounts[0].isActive, true);

  // Virtual account resolution for jan
  const janAccounts = ProviderRepository.getAccountsByProvider("jan");
  assert.ok(janAccounts.length >= 1, "Must return at least 1 virtual account for jan");
  assert.equal(janAccounts[0].providerId, "jan");

  // Virtual account resolution for ollama-local
  const ollamaAccounts = ProviderRepository.getAccountsByProvider("ollama-local");
  assert.ok(ollamaAccounts.length >= 1, "Must return at least 1 virtual account for ollama-local");
  assert.equal(ollamaAccounts[0].providerId, "ollama-local");

  // LoadBalancer picks synthetic account seamlessly
  const pickedLms = LoadBalancer.pickAccount("lm-studio");
  assert.ok(pickedLms, "LoadBalancer must pick account for lm-studio");
  assert.equal(pickedLms.isActive, true);

  const pickedJan = LoadBalancer.pickAccount("jan");
  assert.ok(pickedJan, "LoadBalancer must pick account for jan");
  assert.equal(pickedJan.isActive, true);
});

test("No-API-Key Providers - Express Endpoints & HTTP Flow", async () => {
  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", () => resolve()));
  const address = server.address() as { port: number };
  const baseUrl = `http://127.0.0.1:${address.port}`;

  try {
    // 1. POST /api/providers/validate allows zero-key providers without apiKey
    const valLmsRes = await fetch(`${baseUrl}/api/providers/validate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ provider: "lm-studio", providerSpecificData: { baseUrl: "http://localhost:1234/v1" } }),
    });
    assert.equal(valLmsRes.status, 200);

    const valJanRes = await fetch(`${baseUrl}/api/providers/validate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ provider: "jan", providerSpecificData: { baseUrl: "http://localhost:1337/v1" } }),
    });
    assert.equal(valJanRes.status, 200);

    // 2. POST /api/providers/:id/accounts allows creating account with empty apiKey
    const addAccountRes = await fetch(`${baseUrl}/api/providers/lm-studio/accounts`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "My Local LM Studio",
        apiKey: "",
        providerSpecificData: { baseUrl: "http://localhost:1234/v1" },
      }),
    });
    assert.equal(addAccountRes.status, 200);
    const addData = await addAccountRes.json();
    assert.equal(addData.success, true);
    assert.ok(addData.id);

    // 3. GET /api/models/available?connectedOnly=true treats no-key providers as connected
    const availRes = await fetch(`${baseUrl}/api/models/available?connectedOnly=true`);
    assert.equal(availRes.status, 200);
    const availableModels = (await availRes.json()) as any[];

    const opencodeModels = availableModels.filter((m) => m.providerId === "opencode" || m.providerId === "oc");
    assert.ok(opencodeModels.length > 0, "opencode models must be available");
    assert.equal(opencodeModels[0].hasConnectedAccount, true);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

test("Token Unpacking & Binary Inspection Safety", async () => {
  // 1. extractTokenFromAccount cleanly extracts token from JSON stored by OAuth
  const jsonAccount = {
    id: "acc_oauth_1",
    providerId: "codex",
    name: "ChatGPT OAuth",
    rawApiKey: JSON.stringify({
      accessToken: "ya29.secret_token_12345",
      refreshToken: "refresh_token_67890",
      expiresAt: Date.now() + 3600000,
    }),
    isActive: true,
  };
  const extractedToken = extractTokenFromAccount(jsonAccount);
  assert.equal(extractedToken, "ya29.secret_token_12345", "Must extract accessToken from stringified JSON");

  // 2. buildHeaders with OAuth JSON account sets clean Bearer token
  const openaiProv = new OpenAiCompatibleProvider({ id: "codex", name: "Codex" });
  const headers = await openaiProv.buildHeaders({
    req: { headers: {} } as any,
    targetModel: "gpt-4o",
    clientFormat: "openai",
    targetFormat: "openai",
    body: {},
    provider: { id: "codex", name: "Codex", baseUrl: "https://api.openai.com/v1", format: "openai", isActive: true, priority: 1, models: ["gpt-4o"], createdAt: 0, updatedAt: 0 },
    account: jsonAccount,
    requestId: "req_test",
    startTime: Date.now(),
    clientTool: "test",
    rawModel: "gpt-4o",
    rtkStats: { compressedTokens: 0, tokensSaved: 0 },
  });
  assert.equal(headers["Authorization"], "Bearer ya29.secret_token_12345", "Authorization header must not contain JSON string");

  // 3. checkBinaryInstalled rejects command injection characters
  const safeCheck = await checkBinaryInstalled("node");
  assert.equal(typeof safeCheck, "boolean");

  const maliciousCheck = await checkBinaryInstalled("node; echo pwned");
  assert.equal(maliciousCheck, false, "Must reject command injection input");

  const maliciousCheck2 = await checkBinaryInstalled("claude & calc.exe");
  assert.equal(maliciousCheck2, false, "Must reject ampersand injection input");
});

test("Catalog Provider Validation - uses registry baseUrl without error", async () => {
  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", () => resolve()));
  const address = server.address() as { port: number };
  const baseUrl = `http://127.0.0.1:${address.port}`;

  const originalFetch = global.fetch;
  let requestedUrl = "";
  global.fetch = (async (url: any) => {
    requestedUrl = String(url);
    return new Response(JSON.stringify({ data: [{ id: "deepseek-ai/DeepSeek-V3" }] }), { status: 200 });
  }) as any;

  try {
    const res = await originalFetch(`${baseUrl}/api/providers/validate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        provider: "deepinfra",
        apiKey: "test-deepinfra-token",
      }),
    });
    assert.equal(res.status, 200);
    const body = (await res.json()) as any;
    assert.equal(body.valid, true);
    assert.ok(
      requestedUrl.includes("api.deepinfra.com/v1/openai/models"),
      `Must probe deepinfra models endpoint, got ${requestedUrl}`
    );
  } finally {
    global.fetch = originalFetch;
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

