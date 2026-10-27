process.env.NODE_ENV = "test";

import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import app from "../src/server/index.js";
import { OAuthHandlerRegistry } from "../src/providers/core/oauthRegistry.js";
import { ProviderRepository } from "../src/storage/repositories/providerRepo.js";
import {
  generatePKCE,
  generateCodeVerifier,
  generateCodeChallenge,
  generateState,
} from "../src/shared/utils/pkce.js";
import {
  refreshGoogleOAuthToken,
  ANTIGRAVITY_CLIENT_ID,
  ANTIGRAVITY_CLIENT_SECRET,
  ANTIGRAVITY_SCOPES,
} from "../src/providers/runtime/antigravity/routes.js";
import {
  GOOGLE_OAUTH_CLIENT_ID,
  GOOGLE_OAUTH_CLIENT_SECRET,
  GOOGLE_OAUTH_SCOPES,
} from "../src/providers/runtime/gemini-cli/routes.js";
import {
  CLAUDE_CLIENT_ID,
  CLAUDE_AUTHORIZE_URL,
  CLAUDE_TOKEN_URL,
  CLAUDE_SCOPES,
} from "../src/providers/runtime/claude/routes.js";
import {
  CODEX_CLIENT_ID,
  CODEX_AUTHORIZE_URL,
  CODEX_TOKEN_URL,
  CODEX_SCOPE,
  startCodexProxy,
  stopCodexProxy,
} from "../src/providers/runtime/codex/routes.js";
import {
  KIMI_CLIENT_ID,
  KIMI_DEVICE_CODE_URL,
  KIMI_TOKEN_URL,
  KIMI_AUTHORIZE_DEVICE_URL,
} from "../src/providers/runtime/kimi/routes.js";

let server: http.Server;
let baseUrl: string;

before(async () => {
  server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", () => resolve()));
  const address = server.address() as { port: number };
  baseUrl = `http://127.0.0.1:${address.port}`;
});

after(() => {
  stopCodexProxy();
  if (server) {
    server.close();
  }
});

test("Backward Compatibility - Re-exported helpers and provider constants", () => {
  assert.equal(typeof generateCodeVerifier, "function");
  assert.equal(typeof generateCodeChallenge, "function");
  assert.equal(typeof generateState, "function");
  assert.equal(typeof generatePKCE, "function");
  assert.equal(typeof refreshGoogleOAuthToken, "function");
  assert.equal(typeof startCodexProxy, "function");
  assert.equal(typeof stopCodexProxy, "function");

  assert.ok(ANTIGRAVITY_CLIENT_ID.length > 0);
  assert.ok(ANTIGRAVITY_CLIENT_SECRET.length > 0);
  assert.ok(Array.isArray(ANTIGRAVITY_SCOPES));

  assert.ok(GOOGLE_OAUTH_CLIENT_ID.length > 0);
  assert.ok(GOOGLE_OAUTH_CLIENT_SECRET.length > 0);
  assert.ok(Array.isArray(GOOGLE_OAUTH_SCOPES));

  assert.ok(CLAUDE_CLIENT_ID.length > 0);
  assert.ok(CLAUDE_AUTHORIZE_URL.startsWith("https://"));
  assert.ok(CLAUDE_TOKEN_URL.startsWith("https://"));
  assert.ok(Array.isArray(CLAUDE_SCOPES));

  assert.ok(CODEX_CLIENT_ID.length > 0);
  assert.ok(CODEX_AUTHORIZE_URL.startsWith("https://"));
  assert.ok(CODEX_TOKEN_URL.startsWith("https://"));
  assert.ok(typeof CODEX_SCOPE === "string");

  assert.ok(KIMI_CLIENT_ID.length > 0);
  assert.ok(KIMI_DEVICE_CODE_URL.startsWith("https://"));
  assert.ok(KIMI_TOKEN_URL.startsWith("https://"));
  assert.ok(KIMI_AUTHORIZE_DEVICE_URL.startsWith("https://"));

  const pkce = generatePKCE(32);
  assert.ok(pkce.codeVerifier);
  assert.ok(pkce.codeChallenge);
  assert.ok(pkce.state);
});

test("GET /api/oauth/:provider/authorize - Built-in providers and device code flows", async () => {
  // 1. Claude (PKCE flow)
  const claudeRes = await fetch(`${baseUrl}/api/oauth/claude/authorize`);
  assert.equal(claudeRes.status, 200);
  const claudeData = (await claudeRes.json()) as any;
  assert.equal(claudeData.flowType, "authorization_code_pkce");
  assert.ok(claudeData.authUrl.includes("claude.ai"));
  assert.ok(claudeData.codeVerifier);
  assert.ok(claudeData.codeChallenge);
  assert.ok(claudeData.state);

  // 2. Antigravity (Standard Google OAuth)
  const antigravityRes = await fetch(`${baseUrl}/api/oauth/antigravity/authorize`);
  assert.equal(antigravityRes.status, 200);
  const antigravityData = (await antigravityRes.json()) as any;
  assert.equal(antigravityData.flowType, "authorization_code");
  assert.ok(antigravityData.authUrl.includes("accounts.google.com"));

  // 3. Gemini / Gemini-CLI alias
  const geminiRes = await fetch(`${baseUrl}/api/oauth/gemini/authorize`);
  assert.equal(geminiRes.status, 200);
  const geminiData = (await geminiRes.json()) as any;
  assert.equal(geminiData.flowType, "authorization_code");
  assert.ok(geminiData.authUrl.includes("accounts.google.com"));

  const geminiCliRes = await fetch(`${baseUrl}/api/oauth/gemini-cli/authorize`);
  assert.equal(geminiCliRes.status, 200);
  const geminiCliData = (await geminiCliRes.json()) as any;
  assert.equal(geminiCliData.flowType, "authorization_code");

  // 4. Codex (OpenAI PKCE flow & port 1455 proxy)
  const codexRes = await fetch(`${baseUrl}/api/oauth/codex/authorize`);
  assert.equal(codexRes.status, 200);
  const codexData = (await codexRes.json()) as any;
  assert.equal(codexData.flowType, "authorization_code_pkce");
  assert.ok(codexData.authUrl.includes("auth.openai.com"));
  assert.equal(codexData.redirectUri, "http://localhost:1455/auth/callback");
  stopCodexProxy();

  // 5. Device code flow providers
  for (const prov of ["kimi", "glm", "minimax-code", "qoder"]) {
    const res = await fetch(`${baseUrl}/api/oauth/${prov}/authorize`);
    assert.equal(res.status, 200);
    const data = (await res.json()) as any;
    assert.equal(data.flowType, "device_code");
    assert.equal(data.authUrl, null);
    assert.ok(data.codeVerifier);
  }

  // 6. Generic metadata fallback provider (iflow has authorizeUrl)
  const iflowRes = await fetch(`${baseUrl}/api/oauth/iflow/authorize`);
  assert.equal(iflowRes.status, 200);
  const iflowData = (await iflowRes.json()) as any;
  assert.equal(iflowData.flowType, "authorization_code");
  assert.ok(iflowData.authUrl.includes("iflow.cn/oauth"));

  // 7. Unsupported provider
  const unsuppRes = await fetch(`${baseUrl}/api/oauth/unsupported_provider_xyz/authorize`);
  assert.equal(unsuppRes.status, 400);
  const unsuppData = (await unsuppRes.json()) as any;
  assert.ok(unsuppData.error.includes("does not support OAuth authorize"));
});

test("GET /api/oauth/:provider/device-code - Delegation and validation", async () => {
  // Provider not supporting device code
  const claudeRes = await fetch(`${baseUrl}/api/oauth/claude/device-code`);
  assert.equal(claudeRes.status, 400);
  const claudeData = (await claudeRes.json()) as any;
  assert.ok(claudeData.error.includes("does not support device code"));

  // Register mock device code handler in OAuthHandlerRegistry
  OAuthHandlerRegistry.register("mock-device-provider", {
    id: "mock-device-provider",
    deviceCode: async () => ({
      device_code: "mock_dc_12345",
      user_code: "USER-1234",
      verification_uri: "https://example.com/verify",
      expires_in: 600,
      interval: 5,
    }),
  });

  const mockRes = await fetch(`${baseUrl}/api/oauth/mock-device-provider/device-code`);
  assert.equal(mockRes.status, 200);
  const mockData = (await mockRes.json()) as any;
  assert.equal(mockData.device_code, "mock_dc_12345");
  assert.equal(mockData.user_code, "USER-1234");
});

test("POST /api/oauth/:provider/poll - Polling tokens delegation and validation", async () => {
  // Missing device_code
  const missingRes = await fetch(`${baseUrl}/api/oauth/kimi/poll`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({}),
  });
  assert.equal(missingRes.status, 400);
  const missingData = (await missingRes.json()) as any;
  assert.equal(missingData.error, "Missing device_code");

  // Provider not supporting poll (e.g. claude has authorize/exchange, no poll)
  const noPollRes = await fetch(`${baseUrl}/api/oauth/claude/poll`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ device_code: "dc_test" }),
  });
  assert.equal(noPollRes.status, 400);
  const noPollData = (await noPollRes.json()) as any;
  assert.ok(noPollData.error.includes("Poll not supported"));

  // Register mock poll handler in OAuthHandlerRegistry
  OAuthHandlerRegistry.register("mock-poll-provider", {
    id: "mock-poll-provider",
    poll: async (params) => {
      if (params.device_code === "valid_code") {
        return { ok: true, success: true, account: { id: "acc_poll_1", name: "Poll User" } };
      }
      return { ok: false, error: "authorization_pending" };
    },
  });

  const pendingRes = await fetch(`${baseUrl}/api/oauth/mock-poll-provider/poll`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ device_code: "pending_code" }),
  });
  assert.equal(pendingRes.status, 200);
  const pendingData = (await pendingRes.json()) as any;
  assert.equal(pendingData.ok, false);
  assert.equal(pendingData.error, "authorization_pending");

  const successRes = await fetch(`${baseUrl}/api/oauth/mock-poll-provider/poll`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ device_code: "valid_code" }),
  });
  assert.equal(successRes.status, 200);
  const successData = (await successRes.json()) as any;
  assert.equal(successData.ok, true);
  assert.equal(successData.account.id, "acc_poll_1");
});

test("POST /api/oauth/:provider/exchange - Validation, sanitization, raw JWT, and delegation", async () => {
  // 1. Missing code
  const missingRes = await fetch(`${baseUrl}/api/oauth/claude/exchange`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({}),
  });
  assert.equal(missingRes.status, 400);
  const missingData = (await missingRes.json()) as any;
  assert.ok(missingData.error.includes("Missing authorization code"));

  // 2. Direct raw JWT token paste (eyJ...)
  const header = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url");
  const payload = Buffer.from(JSON.stringify({ email: "developer@example.com", name: "Dev User" })).toString("base64url");
  const rawJwt = `${header}.${payload}.mockSignature123`;

  const jwtRes = await fetch(`${baseUrl}/api/oauth/custom-jwt-prov/exchange`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ code: rawJwt }),
  });
  assert.equal(jwtRes.status, 200);
  const jwtData = (await jwtRes.json()) as any;
  assert.equal(jwtData.success, true);
  assert.equal(jwtData.account.name, "developer@example.com");
  assert.equal(jwtData.account.providerId, "custom-jwt-prov");

  // Verify saved in ProviderRepository
  const savedAcc = ProviderRepository.getAccountById(jwtData.account.id);
  assert.ok(savedAcc);
  assert.equal(savedAcc.rawApiKey, rawJwt);
  assert.equal(savedAcc.providerSpecificData?.email, "developer@example.com");

  // 3. Callback URL and state sanitization delegation
  let passedCode = "";
  let passedState = "";
  OAuthHandlerRegistry.register("mock-exchange-provider", {
    id: "mock-exchange-provider",
    exchange: async (params) => {
      passedCode = params.code;
      passedState = params.state || "";
      if (params.code === "secret_auth_code") {
        return { success: true, account: { id: "acc_ex_123", name: "Exchange Success" } };
      }
      return { success: false, error: "Invalid code provided" };
    },
  });

  const cleanExchangeRes = await fetch(`${baseUrl}/api/oauth/mock-exchange-provider/exchange`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      code: "http://localhost:20127/callback?code=secret_auth_code#received_state_xyz",
    }),
  });
  assert.equal(cleanExchangeRes.status, 200);
  const cleanData = (await cleanExchangeRes.json()) as any;
  assert.equal(cleanData.success, true);
  assert.equal(cleanData.account.id, "acc_ex_123");
  assert.equal(passedCode, "secret_auth_code");
  assert.equal(passedState, "received_state_xyz");

  // 4. Failed exchange returns 400
  const failedExchangeRes = await fetch(`${baseUrl}/api/oauth/mock-exchange-provider/exchange`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ code: "bad_code" }),
  });
  assert.equal(failedExchangeRes.status, 400);
  const failedData = (await failedExchangeRes.json()) as any;
  assert.equal(failedData.error, "Invalid code provided");

  // 5. Provider without exchange support
  const unsuppRes = await fetch(`${baseUrl}/api/oauth/minimax/exchange`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ code: "auth_code_123" }),
  });
  assert.equal(unsuppRes.status, 400);
});

test("GitHub Routes - Device-code, poll, and token import delegation", async () => {
  // 1. POST /api/oauth/github/device-code
  const originalFetch = globalThis.fetch;
  try {
    globalThis.fetch = (async (url: any, init: any) => {
      if (String(url).includes("login/device/code")) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            device_code: "gh_mock_dc_123",
            user_code: "GH-1234",
            verification_uri: "https://github.com/login/device",
            expires_in: 900,
            interval: 5,
          }),
        } as any;
      }
      return originalFetch(url, init);
    }) as typeof fetch;

    const deviceCodeRes = await fetch(`${baseUrl}/api/oauth/github/device-code`, {
      method: "POST",
    });
    assert.equal(deviceCodeRes.status, 200);
    const dcData = (await deviceCodeRes.json()) as any;
    assert.equal(dcData.device_code, "gh_mock_dc_123");
    assert.equal(dcData.user_code, "GH-1234");
  } finally {
    globalThis.fetch = originalFetch;
  }

  // 2. POST /api/oauth/github/poll - Missing code
  const pollMissingRes = await fetch(`${baseUrl}/api/oauth/github/poll`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({}),
  });
  assert.equal(pollMissingRes.status, 400);

  // 3. POST /api/oauth/github/token - Missing token
  const tokenMissingRes = await fetch(`${baseUrl}/api/oauth/github/token`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({}),
  });
  assert.equal(tokenMissingRes.status, 400);
  const tokenMissingData = (await tokenMissingRes.json()) as any;
  assert.equal(tokenMissingData.error, "Token is required");

  // 4. POST /api/oauth/github/token - Import token
  const importRes = await fetch(`${baseUrl}/api/oauth/github/token`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      token: "gho_mock_personal_token_999",
      name: "GitHub Test Account",
    }),
  });
  assert.equal(importRes.status, 200);
  const importData = (await importRes.json()) as any;
  assert.equal(importData.success, true);
  assert.equal(importData.name, "GitHub Test Account");

  // Verify saved in ProviderRepository
  const saved = ProviderRepository.getAccountById(importData.id);
  assert.ok(saved);
  assert.equal(saved.rawApiKey, "gho_mock_personal_token_999");
  assert.equal(saved.providerId, "github");
});

test("Cursor Routes - Auto-import and account import delegation", async () => {
  // 1. GET /api/oauth/cursor/auto-import
  const autoRes = await fetch(`${baseUrl}/api/oauth/cursor/auto-import`);
  assert.equal(autoRes.status, 200);
  const autoData = (await autoRes.json()) as any;
  assert.ok("found" in autoData);

  // 2. POST /api/oauth/cursor/import - Missing token
  const missingRes = await fetch(`${baseUrl}/api/oauth/cursor/import`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({}),
  });
  assert.equal(missingRes.status, 400);
  const missingData = (await missingRes.json()) as any;
  assert.equal(missingData.error, "Access token is required");

  // 3. POST /api/oauth/cursor/import - Successful import
  const importRes = await fetch(`${baseUrl}/api/oauth/cursor/import`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      accessToken: "cursor_session_mock_token_777",
      machineId: "mock-machine-id",
      name: "Cursor Workstation Account",
    }),
  });
  assert.equal(importRes.status, 200);
  const importData = (await importRes.json()) as any;
  assert.equal(importData.success, true);
  assert.equal(importData.name, "Cursor Workstation Account");

  // Verify saved in ProviderRepository
  const saved = ProviderRepository.getAccountById(importData.id);
  assert.ok(saved);
  assert.equal(saved.rawApiKey, "cursor_session_mock_token_777");
  assert.equal(saved.providerId, "cursor");
  assert.equal(saved.providerSpecificData?.machineId, "mock-machine-id");
});

test("Kiro Routes - Auto-import, account import, and api-key delegation", async () => {
  // 1. GET /api/oauth/kiro/auto-import
  const autoRes = await fetch(`${baseUrl}/api/oauth/kiro/auto-import`);
  assert.equal(autoRes.status, 200);
  const autoData = (await autoRes.json()) as any;
  assert.ok("found" in autoData);

  // 2. POST /api/oauth/kiro/import - Missing refresh token
  const importMissingRes = await fetch(`${baseUrl}/api/oauth/kiro/import`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({}),
  });
  assert.equal(importMissingRes.status, 400);
  const importMissingData = (await importMissingRes.json()) as any;
  assert.equal(importMissingData.error, "Refresh token or access token is required");

  // 3. POST /api/oauth/kiro/import - Successful import
  const importRes = await fetch(`${baseUrl}/api/oauth/kiro/import`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      refreshToken: "aorAAAAAG_mock_kiro_refresh_token",
      clientId: "mock_client_id",
      clientSecret: "mock_client_secret",
      region: "us-west-2",
      authMethod: "idc",
      name: "Kiro Enterprise Test",
    }),
  });
  assert.equal(importRes.status, 200);
  const importData = (await importRes.json()) as any;
  assert.equal(importData.success, true);
  assert.equal(importData.name, "Kiro Enterprise Test");

  const savedAccount = ProviderRepository.getAccountById(importData.id);
  assert.ok(savedAccount);
  assert.equal(savedAccount.rawApiKey, "aorAAAAAG_mock_kiro_refresh_token");
  assert.equal(savedAccount.providerId, "kiro");
  assert.equal(savedAccount.providerSpecificData?.region, "us-west-2");

  // 4. POST /api/oauth/kiro/api-key - Missing API key
  const apiKeyMissingRes = await fetch(`${baseUrl}/api/oauth/kiro/api-key`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({}),
  });
  assert.equal(apiKeyMissingRes.status, 400);
  const apiKeyMissingData = (await apiKeyMissingRes.json()) as any;
  assert.equal(apiKeyMissingData.error, "API key is required");

  // 5. POST /api/oauth/kiro/api-key - Successful import
  const apiKeyRes = await fetch(`${baseUrl}/api/oauth/kiro/api-key`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      apiKey: "kiro_headless_api_key_888",
      region: "eu-central-1",
      name: "Kiro Headless Test",
    }),
  });
  assert.equal(apiKeyRes.status, 200);
  const apiKeyData = (await apiKeyRes.json()) as any;
  assert.equal(apiKeyData.success, true);
  assert.equal(apiKeyData.name, "Kiro Headless Test");

  const savedKey = ProviderRepository.getAccountById(apiKeyData.id);
  assert.ok(savedKey);
  assert.equal(savedKey.rawApiKey, "kiro_headless_api_key_888");
  assert.equal(savedKey.providerSpecificData?.authMethod, "api-key");
  assert.equal(savedKey.providerSpecificData?.region, "eu-central-1");
});

test("Generic OAuth Handler Fallback in Registry", () => {
  const genericHandler = OAuthHandlerRegistry.get("some-unregistered-service");
  assert.ok(genericHandler);
  assert.equal(genericHandler.id, "some-unregistered-service");
});
