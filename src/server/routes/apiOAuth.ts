import { Router } from "express";
import crypto from "node:crypto";
import { ProviderRepository } from "../../storage/repositories/providerRepo.js";
import { OAuthHandlerRegistry } from "../../providers/core/oauthRegistry.js";
import { githubOAuthHandler } from "../../providers/runtime/github/oauth.js";
import { cursorOAuthHandler } from "../../providers/runtime/cursor/import.js";
import { kiroOAuthHandler } from "../../providers/runtime/kiro/import.js";
import { parseJwtPayload } from "../../shared/utils/jwt.js";
import { generatePKCE } from "../../shared/utils/pkce.js";

// Re-exports for backward compatibility
export { generateCodeVerifier, generateCodeChallenge, generateState, generatePKCE } from "../../shared/utils/pkce.js";
export { ANTIGRAVITY_CLIENT_ID, ANTIGRAVITY_CLIENT_SECRET, ANTIGRAVITY_SCOPES, refreshGoogleOAuthToken } from "../../providers/runtime/antigravity/oauth.js";
export { GOOGLE_OAUTH_CLIENT_ID, GOOGLE_OAUTH_CLIENT_SECRET, GOOGLE_OAUTH_SCOPES } from "../../providers/runtime/gemini/oauth.js";
export { CLAUDE_CLIENT_ID, CLAUDE_AUTHORIZE_URL, CLAUDE_TOKEN_URL, CLAUDE_SCOPES } from "../../providers/runtime/claude/oauth.js";
export { CODEX_CLIENT_ID, CODEX_AUTHORIZE_URL, CODEX_TOKEN_URL, CODEX_SCOPE, startCodexProxy, stopCodexProxy } from "../../providers/runtime/codex/oauth.js";
export { KIMI_CLIENT_ID, KIMI_DEVICE_CODE_URL, KIMI_TOKEN_URL, KIMI_AUTHORIZE_DEVICE_URL } from "../../providers/runtime/kimi/oauth.js";

OAuthHandlerRegistry.initializeBuiltins();
export const oauthRouter = Router();

const DEVICE_CODE_PROVIDERS = new Set([
  "kimi", "kimi-coding", "glm", "minimax-code", "minimax-code-global", "qoder", "qoder-cn", "grok-cli", "kilocode",
]);

// GET /api/oauth/:provider/authorize - Get authorization URL & PKCE metadata
oauthRouter.get("/:provider/authorize", async (req, res) => {
  const { provider } = req.params;
  const pId = provider.toLowerCase();
  const appPort = req.headers.host?.split(":")[1] || "20127";
  const redirectUri = (req.query.redirect_uri as string) || `http://localhost:${appPort}/callback`;
  const { codeVerifier, codeChallenge, state } = generatePKCE(32);
  const handler = OAuthHandlerRegistry.get(provider);

  if (DEVICE_CODE_PROVIDERS.has(pId) || (!handler.authorize && typeof handler.deviceCode === "function")) {
    return res.json({ authUrl: null, flowType: "device_code", redirectUri, state, codeVerifier });
  }
  if (typeof handler.authorize === "function") {
    try {
      const result = await handler.authorize({ provider: pId, redirectUri, appPort, codeVerifier, codeChallenge, state });
      return res.json(result);
    } catch (err: any) {
      return res.status(400).json({ error: err.message || `Provider '${provider}' does not support OAuth authorize endpoint` });
    }
  }
  res.status(400).json({ error: `Provider '${provider}' does not support OAuth authorize endpoint` });
});

// GET /api/oauth/:provider/device-code - Request device code for device flow providers
oauthRouter.get("/:provider/device-code", async (req, res) => {
  const { provider } = req.params;
  try {
    const handler = OAuthHandlerRegistry.get(provider);
    if (!handler.deviceCode) return res.status(400).json({ error: `Provider '${provider}' does not support device code endpoint` });
    res.json(await handler.deviceCode({ provider }));
  } catch (err: any) {
    res.status(err.message?.includes("does not support device code") ? 400 : 500).json({ error: err.message || "Failed to initiate device code" });
  }
});

// POST /api/oauth/:provider/poll - Poll for tokens in device code flow
oauthRouter.post("/:provider/poll", async (req, res) => {
  const { provider } = req.params;
  const { device_code, extraData } = req.body;
  if (!device_code) return res.status(400).json({ error: "Missing device_code" });
  try {
    const handler = OAuthHandlerRegistry.get(provider);
    if (!handler.poll) return res.status(400).json({ error: `Poll not supported for provider '${provider}'` });
    res.json(await handler.poll({ deviceCode: device_code, device_code, extraData }));
  } catch (err: any) {
    res.status(500).json({ error: err.message || "Failed to poll token" });
  }
});

// POST /api/oauth/:provider/exchange - Exchange authorization code for tokens and save account
oauthRouter.post("/:provider/exchange", async (req, res) => {
  const { provider } = req.params;
  const pId = provider.toLowerCase();
  const { code, redirectUri, codeVerifier, state } = req.body;
  if (!code || typeof code !== "string") return res.status(400).json({ error: "Missing authorization code or callback URL" });

  let rawCode = code.trim();
  let extractedCodeState = "";
  if (rawCode.includes("#")) {
    const parts = rawCode.split("#");
    rawCode = parts[0];
    extractedCodeState = parts[1] || "";
  }

  if (rawCode.includes("code=")) {
    try {
      const url = new URL(rawCode.startsWith("http") ? rawCode : `http://localhost/${rawCode}`);
      rawCode = url.searchParams.get("code") || rawCode;
    } catch {
      const match = rawCode.match(/[?&]code=([^&]+)/);
      if (match) rawCode = decodeURIComponent(match[1]);
    }
  }

  if (rawCode.startsWith("eyJ") && rawCode.includes(".")) {
    const payload = parseJwtPayload(rawCode);
    const accountName = payload?.email || payload?.name || `${provider} Account`;
    const accountId = `acc_${crypto.randomUUID().slice(0, 8)}`;
    ProviderRepository.ensureProviderExists(pId);
    ProviderRepository.addAccount({
      id: accountId,
      providerId: pId,
      name: accountName,
      rawApiKey: rawCode,
      providerSpecificData: { email: accountName, authMethod: "access_token" },
    });
    return res.json({ success: true, account: { id: accountId, name: accountName, providerId: pId } });
  }

  const appPort = req.headers.host?.split(":")[1] || "20127";
  const defaultRedirect = pId === "codex" ? "http://localhost:1455/auth/callback" : `http://localhost:${appPort}/callback`;
  const effectiveRedirectUri = redirectUri || defaultRedirect;

  try {
    const handler = OAuthHandlerRegistry.get(provider);
    if (!handler.exchange) return res.status(400).json({ error: `OAuth exchange not implemented for provider '${provider}'` });
    const result = await handler.exchange({
      provider: pId,
      code: rawCode,
      redirectUri: effectiveRedirectUri,
      codeVerifier,
      state: extractedCodeState || state,
      appPort,
    });
    if (!result.success) return res.status(400).json({ error: result.error || "OAuth exchange failed" });
    res.json(result);
  } catch (err: any) {
    res.status(err.message?.includes("not implemented") ? 400 : 500).json({ error: err.message || "Failed to exchange OAuth token" });
  }
});

// GitHub routes
oauthRouter.post("/github/device-code", async (_req, res) => {
  try { res.json(await githubOAuthHandler.deviceCode!()); }
  catch (err: any) { res.status(500).json({ error: err.message || "Failed to initiate GitHub device code" }); }
});
oauthRouter.post("/github/poll", async (req, res) => {
  const { device_code } = req.body;
  if (!device_code) return res.status(400).json({ error: "Missing device_code" });
  try { res.json(await githubOAuthHandler.poll!({ device_code, deviceCode: device_code })); }
  catch (err: any) { res.status(500).json({ error: err.message || "Failed to poll GitHub token" }); }
});
oauthRouter.post("/github/token", async (req, res) => {
  const { token, name } = req.body;
  if (!token || typeof token !== "string") return res.status(400).json({ error: "Token is required" });
  try {
    const result = await githubOAuthHandler.importAccount!({ token, name });
    if (!result.success) return res.status(400).json({ error: result.error || "Token is required" });
    res.json({ success: true, id: result.id, name: result.name });
  } catch (err: any) { res.status(500).json({ error: err.message || "Failed to import GitHub token" }); }
});

// Cursor routes
oauthRouter.get("/cursor/auto-import", async (_req, res) => {
  try { res.json(await cursorOAuthHandler.autoImport!()); }
  catch (err: any) { res.json({ found: false, error: err.message || "Could not read Cursor IDE database" }); }
});
oauthRouter.post("/cursor/import", async (req, res) => {
  const { accessToken, machineId, name } = req.body;
  if (!accessToken) return res.status(400).json({ error: "Access token is required" });
  try {
    const result = await cursorOAuthHandler.importAccount!({ accessToken, machineId, name });
    if (!result.success) return res.status(400).json({ error: result.error || "Failed to import Cursor account" });
    res.json({ success: true, id: result.id, name: result.name });
  } catch (err: any) { res.status(500).json({ error: err.message || "Failed to import Cursor account" }); }
});

// Kiro routes
oauthRouter.get("/kiro/auto-import", async (_req, res) => {
  try { res.json(await kiroOAuthHandler.autoImport!()); }
  catch (err: any) { res.json({ found: false, error: err.message || "Failed to scan AWS SSO cache" }); }
});
oauthRouter.post("/kiro/import", async (req, res) => {
  const { refreshToken, clientId, clientSecret, region, authMethod, profileArn, name } = req.body;
  if (!refreshToken) return res.status(400).json({ error: "Refresh token is required" });
  try {
    const result = await kiroOAuthHandler.importAccount!({ refreshToken, clientId, clientSecret, region, authMethod, profileArn, name });
    if (!result.success) return res.status(400).json({ error: result.error || "Failed to import Kiro account" });
    res.json({ success: true, id: result.id, name: result.name });
  } catch (err: any) { res.status(500).json({ error: err.message || "Failed to import Kiro account" }); }
});
oauthRouter.post("/kiro/api-key", async (req, res) => {
  const { apiKey, region, name } = req.body;
  if (!apiKey) return res.status(400).json({ error: "API key is required" });
  try {
    const result = await kiroOAuthHandler.importApiKey!({ apiKey, region, name });
    if (!result.success) return res.status(400).json({ error: result.error || "Failed to import Kiro API key" });
    res.json({ success: true, id: result.id, name: result.name });
  } catch (err: any) { res.status(500).json({ error: err.message || "Failed to import Kiro API key" }); }
});
