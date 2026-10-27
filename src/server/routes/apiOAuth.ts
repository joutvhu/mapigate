import { Router } from "express";
import crypto from "node:crypto";
import { ProviderRepository } from "../../storage/repositories/providerRepo.js";
import { OAuthHandlerRegistry } from "../../providers/core/oauthRegistry.js";
import { registerAllProviderRoutes } from "../../providers/generated/routesRegistry.generated.js";
import { parseJwtPayload } from "../../shared/utils/jwt.js";
import { generatePKCE } from "../../shared/utils/pkce.js";
import { serverLifecycle } from "../lifecycle.js";

export const oauthRouter = Router();

// Register all provider-specific custom routes and OAuth handlers
registerAllProviderRoutes(oauthRouter);

const DEVICE_CODE_PROVIDERS = new Set([
  "kimi", "kimi-coding", "glm", "minimax-code", "minimax-code-global", "qoder", "qoder-cn", "grok-cli", "kilocode",
]);

// GET /api/oauth/:provider/authorize - Get authorization URL & PKCE metadata
oauthRouter.get("/:provider/authorize", async (req, res) => {
  const { provider } = req.params;
  const pId = provider.toLowerCase();
  const appPort = req.headers.host?.split(":")[1] || String(serverLifecycle.getPort());
  const redirectUri = (req.query.redirect_uri as string) || `http://localhost:${appPort}/callback`;
  const region = (req.query.region as string) || undefined;
  const { codeVerifier, codeChallenge, state } = generatePKCE(32);
  const handler = OAuthHandlerRegistry.get(provider);

  if (DEVICE_CODE_PROVIDERS.has(pId) || (!handler.authorize && typeof handler.deviceCode === "function")) {
    return res.json({ authUrl: null, flowType: "device_code", redirectUri, state, codeVerifier, region });
  }
  if (typeof handler.authorize === "function") {
    try {
      const result = await handler.authorize({ provider: pId, redirectUri, appPort, codeVerifier, codeChallenge, state, region });
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
  const region = (req.query.region as string) || undefined;
  try {
    const handler = OAuthHandlerRegistry.get(provider);
    if (!handler.deviceCode) return res.status(400).json({ error: `Provider '${provider}' does not support device code endpoint` });
    res.json(await handler.deviceCode({ provider, region }));
  } catch (err: any) {
    res.status(err.message?.includes("does not support device code") ? 400 : 500).json({ error: err.message || "Failed to initiate device code" });
  }
});

// POST /api/oauth/:provider/poll - Poll for tokens in device code flow
oauthRouter.post("/:provider/poll", async (req, res) => {
  const { provider } = req.params;
  const { device_code, extraData, codeVerifier, code_verifier } = req.body;
  const region = req.body.region || extraData?.region || undefined;
  if (!device_code) return res.status(400).json({ error: "Missing device_code" });
  try {
    const handler = OAuthHandlerRegistry.get(provider);
    if (!handler.poll) return res.status(400).json({ error: `Poll not supported for provider '${provider}'` });
    res.json(await handler.poll({
      deviceCode: device_code,
      device_code,
      codeVerifier: codeVerifier || code_verifier,
      region,
      extraData: { ...(extraData || {}), ...(region ? { region } : {}) },
    }));
  } catch (err: any) {
    res.status(500).json({ error: err.message || "Failed to poll token" });
  }
});

// POST /api/oauth/:provider/exchange - Exchange authorization code for tokens and save account
oauthRouter.post("/:provider/exchange", async (req, res) => {
  const { provider } = req.params;
  const pId = provider.toLowerCase();
  const { code, redirectUri, codeVerifier, state, region } = req.body;
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
      providerSpecificData: {
        email: accountName,
        authMethod: "access_token",
        ...(region ? { region } : {}),
      },
    });
    return res.json({ success: true, account: { id: accountId, name: accountName, providerId: pId } });
  }

  const appPort = req.headers.host?.split(":")[1] || String(serverLifecycle.getPort());
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
      region,
    });
    if (!result.success) return res.status(400).json({ error: result.error || "OAuth exchange failed" });
    res.json(result);
  } catch (err: any) {
    res.status(err.message?.includes("not implemented") ? 400 : 500).json({ error: err.message || "Failed to exchange OAuth token" });
  }
});
