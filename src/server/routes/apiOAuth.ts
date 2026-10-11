import { Router } from "express";
import http from "node:http";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { DatabaseSync } from "node:sqlite";
import { ProviderRepository } from "../../storage/repositories/providerRepo.js";
import { getRegistryProvider } from "../../shared/constants/providerRegistry.js";

export const oauthRouter = Router();

// ==========================================
// PKCE & OAuth Helper Utilities
// ==========================================

export function generateCodeVerifier(bytes = 32): string {
  return crypto.randomBytes(bytes).toString("base64url");
}

export function generateCodeChallenge(verifier: string): string {
  return crypto.createHash("sha256").update(verifier).digest("base64url");
}

export function generateState(): string {
  return crypto.randomBytes(32).toString("base64url");
}

export function generatePKCE(bytes = 32) {
  const codeVerifier = generateCodeVerifier(bytes);
  const codeChallenge = generateCodeChallenge(codeVerifier);
  const state = generateState();
  return { codeVerifier, codeChallenge, state };
}

function parseJwtPayload(token: string): any {
  try {
    const parts = token.split(".");
    if (parts.length < 2) return null;
    const base64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const json = Buffer.from(base64, "base64").toString("utf8");
    return JSON.parse(json);
  } catch {
    return null;
  }
}

// Background loopback listener for Codex fixed port 1455
let codexProxyServer: http.Server | null = null;
let codexProxyTimeout: NodeJS.Timeout | null = null;

export function stopCodexProxy() {
  if (codexProxyTimeout) {
    clearTimeout(codexProxyTimeout);
    codexProxyTimeout = null;
  }
  if (codexProxyServer) {
    try {
      codexProxyServer.close();
    } catch {}
    codexProxyServer = null;
  }
}

export function startCodexProxy(appPort: number) {
  if (codexProxyServer) return;

  const server = http.createServer((req, res) => {
    const url = new URL(req.url || "/", "http://localhost");

    if (url.pathname !== "/callback" && url.pathname !== "/auth/callback") {
      res.writeHead(404);
      res.end("Not found");
      return;
    }

    // 302 redirect to app /callback so browser sends postMessage / storage event
    const redirectUrl = `http://localhost:${appPort}/callback${url.search}`;
    res.writeHead(302, { Location: redirectUrl });
    res.end();
    stopCodexProxy();
  });

  server.on("error", () => {
    stopCodexProxy();
  });

  try {
    server.listen(1455, "127.0.0.1", () => {
      codexProxyServer = server;
      codexProxyTimeout = setTimeout(() => stopCodexProxy(), 5 * 60 * 1000);
    });
  } catch {
    stopCodexProxy();
  }
}

// ==========================================
// Provider Constants
// ==========================================

export const ANTIGRAVITY_CLIENT_ID = "REDACTED_GOOGLE_CLIENT_ID.apps.googleusercontent.com";
export const ANTIGRAVITY_CLIENT_SECRET = "REDACTED_GOOGLE_CLIENT_SECRET";
export const ANTIGRAVITY_SCOPES = [
  "https://www.googleapis.com/auth/cloud-platform",
  "https://www.googleapis.com/auth/userinfo.email",
  "https://www.googleapis.com/auth/userinfo.profile",
  "https://www.googleapis.com/auth/cclog",
  "https://www.googleapis.com/auth/experimentsandconfigs",
];

export const GOOGLE_OAUTH_CLIENT_ID = "681255809395-oo8ft2oprdrnp9e3aqf6av3hmdib135j.apps.googleusercontent.com";
export const GOOGLE_OAUTH_CLIENT_SECRET = "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";
export const GOOGLE_OAUTH_SCOPES = [
  "https://www.googleapis.com/auth/cloud-platform",
  "https://www.googleapis.com/auth/userinfo.email",
];

export const CLAUDE_CLIENT_ID = "REDACTED_CLAUDE_CLIENT_ID";
export const CLAUDE_AUTHORIZE_URL = "https://claude.ai/oauth/authorize";
export const CLAUDE_TOKEN_URL = "https://api.anthropic.com/v1/oauth/token";
export const CLAUDE_SCOPES = [
  "org:create_api_key",
  "user:profile",
  "user:inference",
];

export const CODEX_CLIENT_ID = "REDACTED_CODEX_CLIENT_ID";
export const CODEX_AUTHORIZE_URL = "https://auth.openai.com/oauth/authorize";
export const CODEX_TOKEN_URL = "https://auth.openai.com/oauth/token";
export const CODEX_SCOPE = "openid profile email offline_access";

export const KIMI_CLIENT_ID = "REDACTED_KIMI_CLIENT_ID";
export const KIMI_DEVICE_CODE_URL = "https://auth.kimi.com/api/oauth/device_authorization";
export const KIMI_TOKEN_URL = "https://auth.kimi.com/api/oauth/token";
export const KIMI_AUTHORIZE_DEVICE_URL = "https://www.kimi.com/code/authorize_device";

export async function refreshGoogleOAuthToken(
  refreshToken: string,
  clientId = ANTIGRAVITY_CLIENT_ID,
  clientSecret = ANTIGRAVITY_CLIENT_SECRET
): Promise<{ accessToken: string; refreshToken?: string; expiresIn?: number } | null> {
  if (!refreshToken) return null;
  try {
    const res = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "application/json",
      },
      body: new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token: refreshToken,
        client_id: clientId,
        client_secret: clientSecret,
      }),
    });
    if (!res.ok) {
      console.warn("Google token refresh failed with status:", res.status);
      return null;
    }
    const data: any = await res.json();
    return {
      accessToken: data.access_token,
      refreshToken: data.refresh_token || refreshToken,
      expiresIn: Number(data.expires_in) || 3600,
    };
  } catch (err) {
    console.warn("Google token refresh network error:", err);
    return null;
  }
}

// ==========================================
// Dynamic OAuth Authorization Endpoints
// ==========================================

// GET /api/oauth/:provider/authorize - Get authorization URL & PKCE metadata
oauthRouter.get("/:provider/authorize", async (req, res) => {
  const { provider } = req.params;
  const pId = provider.toLowerCase();
  const appPort = req.headers.host?.split(":")[1] || "20127";
  const defaultRedirectUri = `http://localhost:${appPort}/callback`;
  const redirectUri = (req.query.redirect_uri as string) || defaultRedirectUri;

  const { codeVerifier, codeChallenge, state } = generatePKCE(32);

  // 1. Antigravity Google OAuth
  if (pId === "antigravity") {
    const params = new URLSearchParams({
      client_id: ANTIGRAVITY_CLIENT_ID,
      response_type: "code",
      redirect_uri: redirectUri,
      scope: ANTIGRAVITY_SCOPES.join(" "),
      code_challenge: codeChallenge,
      code_challenge_method: "S256",
      state,
      access_type: "offline",
      prompt: "consent",
    });
    const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
    res.json({
      authUrl,
      redirectUri,
      state,
      codeVerifier,
      codeChallenge,
      flowType: "authorization_code",
    });
    return;
  }

  // 2. Gemini / Gemini CLI Google OAuth
  if (pId === "gemini-cli" || pId === "gemini") {
    const params = new URLSearchParams({
      client_id: GOOGLE_OAUTH_CLIENT_ID,
      response_type: "code",
      redirect_uri: redirectUri,
      scope: GOOGLE_OAUTH_SCOPES.join(" "),
      code_challenge: codeChallenge,
      code_challenge_method: "S256",
      state,
      access_type: "offline",
      prompt: "consent",
    });
    const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
    res.json({
      authUrl,
      redirectUri,
      state,
      codeVerifier,
      codeChallenge,
      flowType: "authorization_code",
    });
    return;
  }

  // 3. Claude (Anthropic) PKCE flow
  if (pId === "claude") {
    const params = new URLSearchParams({
      code: "true",
      client_id: CLAUDE_CLIENT_ID,
      response_type: "code",
      redirect_uri: redirectUri,
      scope: CLAUDE_SCOPES.join(" "),
      code_challenge: codeChallenge,
      code_challenge_method: "S256",
      state,
    });
    const authUrl = `${CLAUDE_AUTHORIZE_URL}?${params.toString()}`;
    res.json({
      authUrl,
      redirectUri,
      state,
      codeVerifier,
      codeChallenge,
      flowType: "authorization_code_pkce",
    });
    return;
  }

  // 4. Codex (OpenAI) PKCE flow
  if (pId === "codex") {
    const codexRedirect = "http://localhost:1455/auth/callback";
    const params = {
      response_type: "code",
      client_id: CODEX_CLIENT_ID,
      redirect_uri: codexRedirect,
      scope: CODEX_SCOPE,
      code_challenge: codeChallenge,
      code_challenge_method: "S256",
      id_token_add_organizations: "true",
      codex_cli_simplified_flow: "true",
      originator: "codex_cli_rs",
      state,
    };
    // Ensure spaces in scope are encoded as %20 instead of + (OpenAI auth server requires %20)
    const queryString = Object.entries(params)
      .map(([k, v]) => `${k}=${encodeURIComponent(v)}`)
      .join("&");
    const authUrl = `${CODEX_AUTHORIZE_URL}?${queryString}`;

    // Start local proxy on port 1455 in background to capture the callback
    startCodexProxy(Number(appPort));

    res.json({
      authUrl,
      redirectUri: codexRedirect,
      state,
      codeVerifier,
      codeChallenge,
      flowType: "authorization_code_pkce",
    });
    return;
  }

  // 4b. Cline & ClinePass OAuth flow
  if (pId === "cline" || pId === "clinepass") {
    const reg = getRegistryProvider(pId);
    const authEndpoint = reg?.oauth?.authorizeUrl || "https://api.cline.bot/api/v1/auth/authorize";
    const params = new URLSearchParams({
      client_type: "extension",
      callback_url: redirectUri,
      redirect_uri: redirectUri,
      state,
    });
    const authUrl = `${authEndpoint}?${params.toString()}`;
    res.json({
      authUrl,
      redirectUri,
      state,
      flowType: "authorization_code",
    });
    return;
  }

  // 5. Device Code Flow Providers
  const deviceCodeProviders = [
    "kimi",
    "kimi-coding",
    "glm",
    "minimax-code",
    "minimax-code-global",
    "qoder",
    "qoder-cn",
    "grok-cli",
    "kilocode",
  ];
  if (deviceCodeProviders.includes(pId)) {
    res.json({
      authUrl: null,
      flowType: "device_code",
      redirectUri,
      state,
      codeVerifier,
    });
    return;
  }

  // 6. Generic registry provider with OAuth authorize URL
  const reg = getRegistryProvider(provider);
  if (reg?.oauth?.authorizeUrl) {
    const scopes = Array.isArray(reg.oauth.scopes)
      ? reg.oauth.scopes.join(" ")
      : (reg.oauth.scope || "");
    const params = new URLSearchParams({
      client_id: reg.oauth.clientId || "",
      response_type: "code",
      redirect_uri: redirectUri,
      state,
    });
    if (scopes) params.set("scope", scopes);
    if (reg.oauth.codeChallengeMethod || codeChallenge) {
      params.set("code_challenge", codeChallenge);
      params.set("code_challenge_method", reg.oauth.codeChallengeMethod || "S256");
    }
    const authUrl = `${reg.oauth.authorizeUrl}?${params.toString()}`;
    res.json({
      authUrl,
      redirectUri,
      state,
      codeVerifier,
      codeChallenge,
      flowType: "authorization_code",
    });
    return;
  }

  res.status(400).json({ error: `Provider '${provider}' does not support OAuth authorize endpoint` });
});

// GET /api/oauth/:provider/device-code - Request device code for device flow providers
oauthRouter.get("/:provider/device-code", async (req, res) => {
  const { provider } = req.params;
  const pId = provider.toLowerCase();

  try {
    if (pId === "kimi" || pId === "kimi-coding") {
      const resp = await fetch(KIMI_DEVICE_CODE_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Accept: "application/json",
          "User-Agent": "KimiCLI/1.0",
        },
        body: new URLSearchParams({ client_id: KIMI_CLIENT_ID }),
      });
      if (!resp.ok) {
        const errText = await resp.text();
        res.status(resp.status).json({ error: `Kimi device authorization failed: ${errText}` });
        return;
      }
      const data: any = await resp.json();
      res.json({
        device_code: data.device_code,
        user_code: data.user_code,
        verification_uri: data.verification_uri || KIMI_AUTHORIZE_DEVICE_URL,
        verification_uri_complete:
          data.verification_uri_complete || `${KIMI_AUTHORIZE_DEVICE_URL}?user_code=${data.user_code}`,
        expires_in: data.expires_in || 300,
        interval: data.interval || 5,
      });
      return;
    }

    if (pId === "glm") {
      const pollToken = crypto.randomBytes(32).toString("hex");
      const resp = await fetch("https://zcode.z.ai/api/v1/oauth/cli/init", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${pollToken}`,
        },
        body: JSON.stringify({ provider: "zai" }),
      });
      if (!resp.ok) {
        const errText = await resp.text();
        res.status(resp.status).json({ error: `ZCode OAuth init failed: ${errText}` });
        return;
      }
      const payload: any = await resp.json();
      const data = payload.data || {};
      res.json({
        device_code: data.flow_id,
        user_code: data.flow_id,
        verification_uri: data.authorize_url,
        verification_uri_complete: data.authorize_url,
        expires_in: 300,
        interval: data.poll_interval_sec || 3,
        _zcodePollToken: pollToken,
      });
      return;
    }

    if (pId === "minimax-code" || pId === "minimax-code-global") {
      const url =
        pId === "minimax-code"
          ? "https://account.minimax.io/oauth2/device/code"
          : "https://account.minimax.cn/oauth2/device/code";
      const resp = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Accept: "application/json",
        },
        body: new URLSearchParams({ client_id: "mcode-public" }),
      });
      if (resp.ok) {
        const data: any = await resp.json();
        res.json({
          device_code: data.device_code,
          user_code: data.user_code,
          verification_uri: data.verification_uri,
          verification_uri_complete: data.verification_uri_complete || data.verification_uri,
          expires_in: data.expires_in || 300,
          interval: data.interval || 5,
        });
        return;
      }
    }

    const reg = getRegistryProvider(provider);
    if (reg?.oauth?.deviceCodeUrl) {
      const resp = await fetch(reg.oauth.deviceCodeUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Accept: "application/json",
        },
        body: new URLSearchParams({ client_id: reg.oauth.clientId || "" }),
      });
      if (resp.ok) {
        const data = await resp.json();
        res.json(data);
        return;
      }
    }

    res.status(400).json({ error: `Provider '${provider}' does not support device code endpoint` });
  } catch (err: any) {
    res.status(500).json({ error: err.message || "Failed to initiate device code" });
  }
});

// POST /api/oauth/:provider/poll - Poll for tokens in device code flow
oauthRouter.post("/:provider/poll", async (req, res) => {
  const { provider } = req.params;
  const pId = provider.toLowerCase();
  const { device_code, extraData } = req.body;

  if (!device_code) {
    res.status(400).json({ error: "Missing device_code" });
    return;
  }

  try {
    if (pId === "kimi" || pId === "kimi-coding") {
      const resp = await fetch(KIMI_TOKEN_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Accept: "application/json",
        },
        body: new URLSearchParams({
          grant_type: "urn:ietf:params:oauth:grant-type:device_code",
          client_id: KIMI_CLIENT_ID,
          device_code,
        }),
      });

      const data: any = await resp.json().catch(() => ({}));
      if (data.error === "authorization_pending" || data.error === "slow_down") {
        res.json({ ok: false, error: "authorization_pending" });
        return;
      }
      if (data.error) {
        res.json({ ok: false, error: data.error, error_description: data.error_description });
        return;
      }
      if (data.access_token) {
        const accountId = `acc_${crypto.randomUUID().slice(0, 8)}`;
        const accountName = "Kimi Account";
        const storedToken = JSON.stringify({
          accessToken: data.access_token,
          refreshToken: data.refresh_token,
          expiresAt: Date.now() + (Number(data.expires_in) || 2592000) * 1000,
        });

        const existingProvider = ProviderRepository.getProviderById("kimi");
        if (!existingProvider) {
          const defaults = ProviderRepository.getProviderWithDefaults("kimi");
          if (defaults) ProviderRepository.saveProvider(defaults);
        }

        ProviderRepository.addAccount({
          id: accountId,
          providerId: "kimi",
          name: accountName,
          rawApiKey: storedToken,
          providerSpecificData: {
            authMethod: "device_code",
            refreshToken: data.refresh_token,
          },
        });

        res.json({ ok: true, success: true, account: { id: accountId, name: accountName, providerId: "kimi" } });
        return;
      }
      res.json({ ok: false, error: "authorization_pending" });
      return;
    }

    if (pId === "glm") {
      const pollToken = extraData?._zcodePollToken;
      if (!pollToken) {
        res.json({ ok: false, error: "access_denied", error_description: "Missing poll token" });
        return;
      }
      const resp = await fetch(`https://zcode.z.ai/api/v1/oauth/cli/poll/${encodeURIComponent(device_code)}`, {
        headers: { Authorization: `Bearer ${pollToken}` },
      });
      const data: any = await resp.json().catch(() => ({}));
      if (data.status === "ready" && (data.accessToken || data.token)) {
        const token = data.accessToken || data.token;
        const accountId = `acc_${crypto.randomUUID().slice(0, 8)}`;
        const accountName = data.user?.email || data.user?.name || "Z.AI GLM Account";

        const existingProvider = ProviderRepository.getProviderById("glm");
        if (!existingProvider) {
          const defaults = ProviderRepository.getProviderWithDefaults("glm");
          if (defaults) ProviderRepository.saveProvider(defaults);
        }

        ProviderRepository.addAccount({
          id: accountId,
          providerId: "glm",
          name: accountName,
          rawApiKey: token,
          providerSpecificData: {
            authMethod: "oauth",
            user: data.user,
          },
        });

        res.json({ ok: true, success: true, account: { id: accountId, name: accountName, providerId: "glm" } });
        return;
      }
      res.json({ ok: false, error: "authorization_pending" });
      return;
    }

    res.status(400).json({ error: `Poll not supported for provider '${provider}'` });
  } catch (err: any) {
    res.status(500).json({ error: err.message || "Failed to poll token" });
  }
});

// POST /api/oauth/:provider/exchange - Exchange authorization code for tokens and save account
oauthRouter.post("/:provider/exchange", async (req, res) => {
  const { provider } = req.params;
  const pId = provider.toLowerCase();
  const { code, redirectUri, codeVerifier, state } = req.body;

  if (!code || typeof code !== "string") {
    res.status(400).json({ error: "Missing authorization code or callback URL" });
    return;
  }

  // 1. Extract clean code if full callback URL was pasted
  let rawCode = code.trim();
  if (rawCode.includes("code=")) {
    try {
      const url = new URL(rawCode.startsWith("http") ? rawCode : `http://localhost/${rawCode}`);
      rawCode = url.searchParams.get("code") || rawCode;
    } catch {
      const match = rawCode.match(/[?&]code=([^&]+)/);
      if (match) rawCode = decodeURIComponent(match[1]);
    }
  }

  // Strip state suffix if present (e.g. code#state)
  let extractedCodeState = "";
  if (rawCode.includes("#")) {
    const parts = rawCode.split("#");
    rawCode = parts[0];
    extractedCodeState = parts[1] || "";
  }

  // 2. Direct raw JWT token paste (e.g. eyJ...)
  if (rawCode.startsWith("eyJ") && rawCode.includes(".")) {
    const payload = parseJwtPayload(rawCode);
    const accountName = payload?.email || payload?.name || `${provider} Account`;
    const accountId = `acc_${crypto.randomUUID().slice(0, 8)}`;

    const existingProvider = ProviderRepository.getProviderById(pId);
    if (!existingProvider) {
      const defaults = ProviderRepository.getProviderWithDefaults(pId);
      if (defaults) ProviderRepository.saveProvider(defaults);
    }

    ProviderRepository.addAccount({
      id: accountId,
      providerId: pId,
      name: accountName,
      rawApiKey: rawCode,
      providerSpecificData: {
        email: accountName,
        authMethod: "access_token",
      },
    });

    res.json({
      success: true,
      account: { id: accountId, name: accountName, providerId: pId },
    });
    return;
  }

  const appPort = req.headers.host?.split(":")[1] || "20127";
  const defaultRedirect =
    pId === "codex" ? "http://localhost:1455/auth/callback" : `http://localhost:${appPort}/callback`;
  const effectiveRedirectUri = redirectUri || defaultRedirect;

  // 3. Antigravity Google OAuth exchange
  if (pId === "antigravity") {
    try {
      const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Accept: "application/json",
        },
        body: new URLSearchParams({
          grant_type: "authorization_code",
          client_id: ANTIGRAVITY_CLIENT_ID,
          client_secret: ANTIGRAVITY_CLIENT_SECRET,
          code: rawCode,
          redirect_uri: effectiveRedirectUri,
        }),
      });

      if (!tokenRes.ok) {
        const errText = await tokenRes.text();
        res.status(400).json({ error: `Google OAuth exchange failed: ${errText}` });
        return;
      }

      const tokenData: any = await tokenRes.json();
      const accessToken = tokenData.access_token;
      if (!accessToken) {
        res.status(400).json({ error: "No access token received from Google" });
        return;
      }

      let accountName = "Antigravity Google Account";
      try {
        const userRes = await fetch("https://www.googleapis.com/oauth2/v2/userinfo?alt=json", {
          headers: { Authorization: `Bearer ${accessToken}` },
        });
        if (userRes.ok) {
          const userData: any = await userRes.json();
          if (userData.email) accountName = userData.email;
        }
      } catch (err) {
        console.warn("Failed to fetch Google userinfo:", err);
      }

      const existingProvider = ProviderRepository.getProviderById("antigravity");
      if (!existingProvider) {
        const defaults = ProviderRepository.getProviderWithDefaults("antigravity");
        if (defaults) ProviderRepository.saveProvider(defaults);
      }

      const accountId = `acc_${crypto.randomUUID().slice(0, 8)}`;
      const refreshToken = tokenData.refresh_token || undefined;
      const expiresIn = Number(tokenData.expires_in) || 3600;
      const expiresAt = Date.now() + expiresIn * 1000;

      const storedToken = JSON.stringify({
        accessToken,
        refreshToken,
        expiresAt,
      });

      ProviderRepository.addAccount({
        id: accountId,
        providerId: "antigravity",
        name: accountName,
        rawApiKey: storedToken,
        providerSpecificData: {
          email: accountName,
          refreshToken,
          expiresAt,
        },
      });

      res.json({
        success: true,
        account: { id: accountId, name: accountName, providerId: "antigravity" },
      });
      return;
    } catch (err: any) {
      res.status(500).json({ error: err.message || "Failed to exchange OAuth token" });
      return;
    }
  }

  // 4. Gemini / Gemini CLI Google OAuth exchange
  if (pId === "gemini-cli" || pId === "gemini") {
    try {
      const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Accept: "application/json",
        },
        body: new URLSearchParams({
          grant_type: "authorization_code",
          client_id: GOOGLE_OAUTH_CLIENT_ID,
          client_secret: GOOGLE_OAUTH_CLIENT_SECRET,
          code: rawCode,
          redirect_uri: effectiveRedirectUri,
        }),
      });

      if (!tokenRes.ok) {
        const errText = await tokenRes.text();
        res.status(400).json({ error: `Gemini OAuth exchange failed: ${errText}` });
        return;
      }

      const tokenData: any = await tokenRes.json();
      const accessToken = tokenData.access_token;
      if (!accessToken) {
        res.status(400).json({ error: "No access token received from Google" });
        return;
      }

      let accountName = "Gemini Google Account";
      try {
        const userRes = await fetch("https://www.googleapis.com/oauth2/v2/userinfo?alt=json", {
          headers: { Authorization: `Bearer ${accessToken}` },
        });
        if (userRes.ok) {
          const userData: any = await userRes.json();
          if (userData.email) accountName = userData.email;
        }
      } catch {}

      const existingProvider = ProviderRepository.getProviderById(pId);
      if (!existingProvider) {
        const defaults = ProviderRepository.getProviderWithDefaults(pId);
        if (defaults) ProviderRepository.saveProvider(defaults);
      }

      const accountId = `acc_${crypto.randomUUID().slice(0, 8)}`;
      const refreshToken = tokenData.refresh_token || undefined;
      const expiresIn = Number(tokenData.expires_in) || 3600;
      const expiresAt = Date.now() + expiresIn * 1000;

      const storedToken = JSON.stringify({
        accessToken,
        refreshToken,
        expiresAt,
      });

      ProviderRepository.addAccount({
        id: accountId,
        providerId: pId,
        name: accountName,
        rawApiKey: storedToken,
        providerSpecificData: {
          email: accountName,
          refreshToken,
          expiresAt,
        },
      });

      res.json({
        success: true,
        account: { id: accountId, name: accountName, providerId: pId },
      });
      return;
    } catch (err: any) {
      res.status(500).json({ error: err.message || "Failed to exchange Gemini token" });
      return;
    }
  }

  // 5. Claude (Anthropic) PKCE exchange
  if (pId === "claude") {
    try {
      const tokenRes = await fetch(CLAUDE_TOKEN_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({
          code: rawCode,
          state: extractedCodeState || state || undefined,
          grant_type: "authorization_code",
          client_id: CLAUDE_CLIENT_ID,
          redirect_uri: effectiveRedirectUri,
          code_verifier: codeVerifier,
        }),
      });

      if (!tokenRes.ok) {
        const errText = await tokenRes.text();
        res.status(400).json({ error: `Claude OAuth exchange failed: ${errText}` });
        return;
      }

      const tokenData: any = await tokenRes.json();
      const accessToken = tokenData.access_token;
      if (!accessToken) {
        res.status(400).json({ error: "No access token received from Claude" });
        return;
      }

      let accountName = "Claude Account";
      if (tokenData.id_token) {
        const payload = parseJwtPayload(tokenData.id_token);
        if (payload?.email) accountName = payload.email;
      }

      const existingProvider = ProviderRepository.getProviderById("claude");
      if (!existingProvider) {
        const defaults = ProviderRepository.getProviderWithDefaults("claude");
        if (defaults) ProviderRepository.saveProvider(defaults);
      }

      const accountId = `acc_${crypto.randomUUID().slice(0, 8)}`;
      const refreshToken = tokenData.refresh_token || undefined;
      const expiresIn = Number(tokenData.expires_in) || 3600;
      const expiresAt = Date.now() + expiresIn * 1000;

      const storedToken = JSON.stringify({
        accessToken,
        refreshToken,
        expiresAt,
        scope: tokenData.scope,
      });

      ProviderRepository.addAccount({
        id: accountId,
        providerId: "claude",
        name: accountName,
        rawApiKey: storedToken,
        providerSpecificData: {
          email: accountName,
          refreshToken,
          expiresAt,
        },
      });

      res.json({
        success: true,
        account: { id: accountId, name: accountName, providerId: "claude" },
      });
      return;
    } catch (err: any) {
      res.status(500).json({ error: err.message || "Failed to exchange Claude token" });
      return;
    }
  }

  // 6. Codex (OpenAI) PKCE exchange
  if (pId === "codex") {
    try {
      const codexRedirect = "http://localhost:1455/auth/callback";
      const tokenRes = await fetch(CODEX_TOKEN_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Accept: "application/json",
        },
        body: new URLSearchParams({
          grant_type: "authorization_code",
          client_id: CODEX_CLIENT_ID,
          code: rawCode,
          redirect_uri: codexRedirect,
          code_verifier: codeVerifier || "",
        }),
      });

      if (!tokenRes.ok) {
        const errText = await tokenRes.text();
        res.status(400).json({ error: `Codex OAuth exchange failed: ${errText}` });
        return;
      }

      const tokenData: any = await tokenRes.json();
      const accessToken = tokenData.access_token;
      if (!accessToken) {
        res.status(400).json({ error: "No access token received from Codex" });
        return;
      }

      let accountName = "Codex Account";
      let chatgptAccountId: string | undefined;
      let chatgptPlanType: string | undefined;
      if (tokenData.id_token) {
        const payload = parseJwtPayload(tokenData.id_token);
        const email = payload?.email || payload?.["https://api.openai.com/profile"]?.email;
        if (email) accountName = email;
        chatgptAccountId = payload?.["https://api.openai.com/auth"]?.chatgpt_account_id;
        chatgptPlanType = payload?.["https://api.openai.com/auth"]?.chatgpt_plan_type;
      }

      const existingProvider = ProviderRepository.getProviderById("codex");
      if (!existingProvider) {
        const defaults = ProviderRepository.getProviderWithDefaults("codex");
        if (defaults) ProviderRepository.saveProvider(defaults);
      }

      const accountId = `acc_${crypto.randomUUID().slice(0, 8)}`;
      const refreshToken = tokenData.refresh_token || undefined;
      const expiresIn = Number(tokenData.expires_in) || 3600;
      const expiresAt = Date.now() + expiresIn * 1000;

      const storedToken = JSON.stringify({
        accessToken,
        refreshToken,
        idToken: tokenData.id_token,
        expiresAt,
      });

      ProviderRepository.addAccount({
        id: accountId,
        providerId: "codex",
        name: accountName,
        rawApiKey: storedToken,
        providerSpecificData: {
          email: accountName,
          refreshToken,
          expiresAt,
          ...(chatgptAccountId ? { chatgptAccountId } : {}),
          ...(chatgptPlanType ? { chatgptPlanType } : {}),
        },
      });

      res.json({
        success: true,
        account: { id: accountId, name: accountName, providerId: "codex" },
      });
      return;
    } catch (err: any) {
      res.status(500).json({ error: err.message || "Failed to exchange Codex token" });
      return;
    }
  }

  // 6b. Cline & ClinePass exchange
  if (pId === "cline" || pId === "clinepass") {
    try {
      let accessToken = "";
      let refreshToken = "";
      let email = "";
      let expiresAt: number | undefined;
      let firstName = "";
      let lastName = "";

      // 1. Try decoding base64 JSON from code param (Cline's token payload)
      let decodedJson: any = null;
      try {
        let base64 = rawCode;
        const padding = 4 - (base64.length % 4);
        if (padding !== 4) base64 += "=".repeat(padding);
        const decoded = Buffer.from(base64, "base64").toString("utf8");
        const lastBrace = decoded.lastIndexOf("}");
        if (lastBrace !== -1) {
          decodedJson = JSON.parse(decoded.substring(0, lastBrace + 1));
        }
      } catch {}

      if (decodedJson && (decodedJson.accessToken || decodedJson.access_token)) {
        accessToken = decodedJson.accessToken || decodedJson.access_token;
        refreshToken = decodedJson.refreshToken || decodedJson.refresh_token || "";
        email = decodedJson.email || "";
        firstName = decodedJson.firstName || "";
        lastName = decodedJson.lastName || "";
        if (decodedJson.expiresAt) {
          expiresAt = new Date(decodedJson.expiresAt).getTime();
        }
      } else {
        // 2. Fetch from token endpoint
        const reg = getRegistryProvider(pId);
        const tokenUrl =
          reg?.oauth?.tokenExchangeUrl ||
          reg?.oauth?.tokenUrl ||
          "https://api.cline.bot/api/v1/auth/token";

        const tokenRes = await fetch(tokenUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
          },
          body: JSON.stringify({
            grant_type: "authorization_code",
            code: rawCode,
            client_type: "extension",
            redirect_uri: effectiveRedirectUri,
          }),
        });

        if (!tokenRes.ok) {
          const errText = await tokenRes.text();
          res.status(400).json({ error: `${pId} token exchange failed: ${errText}` });
          return;
        }

        const data: any = await tokenRes.json();
        accessToken = data.data?.accessToken || data.accessToken || "";
        refreshToken = data.data?.refreshToken || data.refreshToken || "";
        email = data.data?.userInfo?.email || data.email || "";
        if (data.data?.expiresAt || data.expiresAt) {
          expiresAt = new Date(data.data?.expiresAt || data.expiresAt).getTime();
        }
      }

      if (!accessToken) {
        res.status(400).json({ error: `No access token received from ${pId}` });
        return;
      }

      const accountName = email || `${pId.toUpperCase()} Account`;
      const accountId = `acc_${crypto.randomUUID().slice(0, 8)}`;
      const expiresInSec = expiresAt ? Math.max(60, Math.floor((expiresAt - Date.now()) / 1000)) : 3600;

      const existingProvider = ProviderRepository.getProviderById(pId);
      if (!existingProvider) {
        const defaults = ProviderRepository.getProviderWithDefaults(pId);
        if (defaults) ProviderRepository.saveProvider(defaults);
      }

      const storedToken = JSON.stringify({
        accessToken,
        refreshToken,
        expiresAt: expiresAt || Date.now() + expiresInSec * 1000,
        email,
      });

      ProviderRepository.addAccount({
        id: accountId,
        providerId: pId,
        name: accountName,
        rawApiKey: storedToken,
        providerSpecificData: {
          email,
          firstName,
          lastName,
          refreshToken,
          expiresAt,
        },
      });

      res.json({
        success: true,
        account: { id: accountId, name: accountName, providerId: pId },
      });
      return;
    } catch (err: any) {
      res.status(500).json({ error: err.message || `Failed to exchange ${pId} token` });
      return;
    }
  }

  // 7. Generic registry provider fallback
  const reg = getRegistryProvider(provider);
  if (reg?.oauth?.tokenUrl) {
    try {
      const isJson = reg.oauth.tokenUrlFormat === "json";
      let tokenRes: Response;
      if (isJson) {
        tokenRes = await fetch(reg.oauth.tokenUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
          },
          body: JSON.stringify({
            grant_type: "authorization_code",
            client_id: reg.oauth.clientId,
            client_secret: reg.oauth.clientSecret,
            code: rawCode,
            redirect_uri: effectiveRedirectUri,
            code_verifier: codeVerifier,
          }),
        });
      } else {
        tokenRes = await fetch(reg.oauth.tokenUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/x-www-form-urlencoded",
            Accept: "application/json",
          },
          body: new URLSearchParams({
            grant_type: "authorization_code",
            client_id: reg.oauth.clientId || "",
            ...(reg.oauth.clientSecret ? { client_secret: reg.oauth.clientSecret } : {}),
            code: rawCode,
            redirect_uri: effectiveRedirectUri,
            ...(codeVerifier ? { code_verifier: codeVerifier } : {}),
          }),
        });
      }

      if (!tokenRes.ok) {
        const errText = await tokenRes.text();
        res.status(400).json({ error: `OAuth exchange failed: ${errText}` });
        return;
      }

      const tokenData: any = await tokenRes.json();
      const accessToken = tokenData.access_token || tokenData.token;
      if (!accessToken) {
        res.status(400).json({ error: "No access token received from provider" });
        return;
      }

      const accountName = `${reg.name} Account`;
      const accountId = `acc_${crypto.randomUUID().slice(0, 8)}`;
      const refreshToken = tokenData.refresh_token || undefined;
      const expiresIn = Number(tokenData.expires_in) || 3600;
      const expiresAt = Date.now() + expiresIn * 1000;

      const storedToken = JSON.stringify({
        accessToken,
        refreshToken,
        expiresAt,
      });

      const existingProvider = ProviderRepository.getProviderById(pId);
      if (!existingProvider) {
        const defaults = ProviderRepository.getProviderWithDefaults(pId);
        if (defaults) ProviderRepository.saveProvider(defaults);
      }

      ProviderRepository.addAccount({
        id: accountId,
        providerId: pId,
        name: accountName,
        rawApiKey: storedToken,
        providerSpecificData: {
          refreshToken,
          expiresAt,
        },
      });

      res.json({
        success: true,
        account: { id: accountId, name: accountName, providerId: pId },
      });
      return;
    } catch (err: any) {
      res.status(500).json({ error: err.message || "Failed to exchange token" });
      return;
    }
  }

  res.status(400).json({ error: `OAuth exchange not implemented for provider '${provider}'` });
});

// ==========================================
// GitHub Copilot Device Code Flow Endpoints
// ==========================================

const GITHUB_COPILOT_CLIENT_ID = "Iv1.REDACTED_GITHUB_CLIENT_ID";

oauthRouter.post("/github/device-code", async (_req, res) => {
  try {
    const response = await fetch("https://github.com/login/device/code", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "application/json",
      },
      body: new URLSearchParams({
        client_id: GITHUB_COPILOT_CLIENT_ID,
        scope: "read:user",
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      res.status(response.status).json({ error: `GitHub device code error: ${errorText}` });
      return;
    }

    const data = await response.json();
    res.json(data);
  } catch (err: any) {
    res.status(500).json({ error: err.message || "Failed to initiate GitHub device code" });
  }
});

oauthRouter.post("/github/poll", async (req, res) => {
  const { device_code } = req.body;
  if (!device_code) {
    res.status(400).json({ error: "Missing device_code" });
    return;
  }

  try {
    const response = await fetch("https://github.com/login/oauth/access_token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "application/json",
      },
      body: new URLSearchParams({
        client_id: GITHUB_COPILOT_CLIENT_ID,
        device_code,
        grant_type: "urn:ietf:params:oauth:grant-type:device_code",
      }),
    });

    const data: any = await response.json().catch(() => ({}));
    if (data.error) {
      res.json({ ok: false, error: data.error, error_description: data.error_description });
      return;
    }

    if (data.access_token) {
      let copilotToken = "";
      let copilotTokenExpiresAt = 0;
      let accountName = "GitHub Copilot User";

      try {
        const copilotRes = await fetch("https://api.github.com/copilot_internal/v2/token", {
          headers: {
            Authorization: `Bearer ${data.access_token}`,
            Accept: "application/json",
            "X-GitHub-Api-Version": "2022-11-28",
            "User-Agent": "GithubCopilot/1.155.0",
          },
        });
        if (copilotRes.ok) {
          const cpData: any = await copilotRes.json();
          copilotToken = cpData.token || "";
          copilotTokenExpiresAt = cpData.expires_at || 0;
        }
      } catch (err) {
        console.warn("Failed to fetch Copilot internal token:", err);
      }

      try {
        const userRes = await fetch("https://api.github.com/user", {
          headers: {
            Authorization: `Bearer ${data.access_token}`,
            Accept: "application/json",
            "X-GitHub-Api-Version": "2022-11-28",
            "User-Agent": "GithubCopilot/1.155.0",
          },
        });
        if (userRes.ok) {
          const uData: any = await userRes.json();
          accountName = uData.login || uData.name || accountName;
        }
      } catch (err) {
        console.warn("Failed to fetch GitHub user info:", err);
      }

      const existingProvider = ProviderRepository.getProviderById("github");
      if (!existingProvider) {
        const defaults = ProviderRepository.getProviderWithDefaults("github");
        if (defaults) {
          ProviderRepository.saveProvider(defaults);
        }
      }

      const accountId = `acc_${crypto.randomUUID().slice(0, 8)}`;
      ProviderRepository.addAccount({
        id: accountId,
        providerId: "github",
        name: accountName,
        rawApiKey: data.access_token,
        providerSpecificData: {
          copilotToken,
          copilotTokenExpiresAt,
          githubAccessToken: data.access_token,
          refreshToken: data.refresh_token,
        },
      });

      res.json({ ok: true, success: true, account: { id: accountId, name: accountName } });
      return;
    }

    res.json({ ok: false, error: "authorization_pending" });
  } catch (err: any) {
    res.status(500).json({ error: err.message || "Failed to poll GitHub token" });
  }
});

oauthRouter.post("/github/token", async (req, res) => {
  const { token, name } = req.body;
  if (!token || typeof token !== "string") {
    res.status(400).json({ error: "Token is required" });
    return;
  }

  const cleanToken = token.trim();
  let copilotToken = cleanToken;
  let copilotTokenExpiresAt = 0;
  let accountName = name || "GitHub Copilot Key";

  try {
    const cpRes = await fetch("https://api.github.com/copilot_internal/v2/token", {
      headers: {
        Authorization: `Bearer ${cleanToken}`,
        Accept: "application/json",
        "X-GitHub-Api-Version": "2022-11-28",
        "User-Agent": "GithubCopilot/1.155.0",
      },
    });
    if (cpRes.ok) {
      const cpData: any = await cpRes.json();
      if (cpData.token) {
        copilotToken = cpData.token;
        copilotTokenExpiresAt = cpData.expires_at || 0;
      }
    }
  } catch {}

  const existingProvider = ProviderRepository.getProviderById("github");
  if (!existingProvider) {
    const defaults = ProviderRepository.getProviderWithDefaults("github");
    if (defaults) {
      ProviderRepository.saveProvider(defaults);
    }
  }

  const accountId = `acc_${crypto.randomUUID().slice(0, 8)}`;
  ProviderRepository.addAccount({
    id: accountId,
    providerId: "github",
    name: accountName,
    rawApiKey: cleanToken,
    providerSpecificData: {
      copilotToken,
      copilotTokenExpiresAt,
    },
  });

  res.json({ success: true, id: accountId, name: accountName });
});

// ==========================================
// Cursor IDE Auto-Import & Token Endpoints
// ==========================================

function getCursorCandidatePaths(): string[] {
  const home = os.homedir();
  const platform = process.platform;

  if (platform === "darwin") {
    return [
      path.join(home, "Library/Application Support/Cursor/User/globalStorage/state.vscdb"),
      path.join(home, "Library/Application Support/Cursor - Insiders/User/globalStorage/state.vscdb"),
    ];
  }

  if (platform === "win32") {
    const appData = process.env.APPDATA || path.join(home, "AppData", "Roaming");
    const localAppData = process.env.LOCALAPPDATA || path.join(home, "AppData", "Local");
    return [
      path.join(appData, "Cursor", "User", "globalStorage", "state.vscdb"),
      path.join(appData, "Cursor - Insiders", "User", "globalStorage", "state.vscdb"),
      path.join(localAppData, "Cursor", "User", "globalStorage", "state.vscdb"),
      path.join(localAppData, "Programs", "Cursor", "User", "globalStorage", "state.vscdb"),
    ];
  }

  return [
    path.join(home, ".config/Cursor/User/globalStorage/state.vscdb"),
    path.join(home, ".config/cursor/User/globalStorage/state.vscdb"),
  ];
}

function extractCursorTokens(dbPath: string): { accessToken: string | null; machineId: string | null } {
  const db = new DatabaseSync(dbPath, { readOnly: true });
  try {
    const query = (key: string): string | null => {
      try {
        const stmt = db.prepare("SELECT value FROM itemTable WHERE key = ? LIMIT 1");
        const row = stmt.get(key) as any;
        return row?.value || null;
      } catch {
        return null;
      }
    };

    const normalize = (val: any): string | null => {
      if (typeof val !== "string") return null;
      try {
        const p = JSON.parse(val);
        return typeof p === "string" ? p : val;
      } catch {
        return val;
      }
    };

    let accessToken: string | null = null;
    for (const k of ["cursorAuth/accessToken", "cursorAuth/token"]) {
      const r = query(k);
      if (r) {
        accessToken = normalize(r);
        if (accessToken) break;
      }
    }

    let machineId: string | null = null;
    for (const k of ["storage.serviceMachineId", "storage.machineId", "telemetry.machineId"]) {
      const r = query(k);
      if (r) {
        machineId = normalize(r);
        if (machineId) break;
      }
    }

    return { accessToken, machineId };
  } finally {
    try {
      db.close();
    } catch {}
  }
}

oauthRouter.get("/cursor/auto-import", (_req, res) => {
  const candidatePaths = getCursorCandidatePaths();
  let foundDbPath: string | null = null;

  for (const p of candidatePaths) {
    if (fs.existsSync(p)) {
      foundDbPath = p;
      break;
    }
  }

  if (!foundDbPath) {
    res.json({
      found: false,
      error: "Cursor database state.vscdb not found. Ensure Cursor IDE is installed and logged in.",
    });
    return;
  }

  try {
    const tokens = extractCursorTokens(foundDbPath);
    if (!tokens.accessToken) {
      res.json({
        found: false,
        error: "Cursor session token not found in state.vscdb. Please log into Cursor IDE.",
      });
      return;
    }

    res.json({
      found: true,
      accessToken: tokens.accessToken,
      machineId: tokens.machineId || "desktop-cursor-client",
    });
  } catch (err: any) {
    res.json({
      found: false,
      error: err.message || "Could not read Cursor IDE database",
    });
  }
});

oauthRouter.post("/cursor/import", (req, res) => {
  const { accessToken, machineId, name } = req.body;
  if (!accessToken) {
    res.status(400).json({ error: "Access token is required" });
    return;
  }

  const existingProvider = ProviderRepository.getProviderById("cursor");
  if (!existingProvider) {
    const defaults = ProviderRepository.getProviderWithDefaults("cursor");
    if (defaults) {
      ProviderRepository.saveProvider(defaults);
    }
  }

  const accountId = `acc_${crypto.randomUUID().slice(0, 8)}`;
  const accountName = name || "Cursor Desktop Account";

  ProviderRepository.addAccount({
    id: accountId,
    providerId: "cursor",
    name: accountName,
    rawApiKey: accessToken,
    providerSpecificData: {
      accessToken,
      machineId: machineId || "desktop-cursor-client",
    },
  });

  res.json({ success: true, id: accountId, name: accountName });
});

// ==========================================
// Kiro IDE Auto-Import & Token Endpoints
// ==========================================

oauthRouter.get("/kiro/auto-import", (_req, res) => {
  const cachePath = path.join(os.homedir(), ".aws", "sso", "cache");
  if (!fs.existsSync(cachePath)) {
    res.json({
      found: false,
      error: "AWS SSO cache not found at ~/.aws/sso/cache. Please sign into Kiro IDE first.",
    });
    return;
  }

  try {
    const files = fs.readdirSync(cachePath);
    let refreshToken: string | null = null;
    let tokenData: any = null;

    // Check kiro-auth-token.json first
    const directFile = path.join(cachePath, "kiro-auth-token.json");
    if (fs.existsSync(directFile)) {
      try {
        const content = fs.readFileSync(directFile, "utf-8");
        const parsed = JSON.parse(content);
        if (parsed.refreshToken && parsed.refreshToken.startsWith("aorAAAAAG")) {
          refreshToken = parsed.refreshToken;
          tokenData = parsed;
        }
      } catch {}
    }

    if (!refreshToken) {
      for (const file of files) {
        if (!file.endsWith(".json")) continue;
        try {
          const content = fs.readFileSync(path.join(cachePath, file), "utf-8");
          const parsed = JSON.parse(content);
          if (parsed.refreshToken && parsed.refreshToken.startsWith("aorAAAAAG")) {
            refreshToken = parsed.refreshToken;
            tokenData = parsed;
            break;
          }
        } catch {}
      }
    }

    if (!refreshToken) {
      res.json({
        found: false,
        error: "Kiro token starting with 'aorAAAAAG' not found in ~/.aws/sso/cache.",
      });
      return;
    }

    let clientId: string | null = null;
    let clientSecret: string | null = null;
    if (tokenData?.clientIdHash) {
      const clientFile = path.join(cachePath, `${tokenData.clientIdHash}.json`);
      if (fs.existsSync(clientFile)) {
        try {
          const cContent = fs.readFileSync(clientFile, "utf-8");
          const cParsed = JSON.parse(cContent);
          clientId = cParsed.clientId || null;
          clientSecret = cParsed.clientSecret || null;
        } catch {}
      }
    }

    let profileArn: string | null = null;
    const profilePaths = [
      path.join(process.env.APPDATA || path.join(os.homedir(), "AppData", "Roaming"), "Kiro", "User", "globalStorage", "kiro.kiroagent", "profile.json"),
      path.join(os.homedir(), ".config", "Kiro", "User", "globalStorage", "kiro.kiroagent", "profile.json"),
    ];
    for (const pp of profilePaths) {
      if (fs.existsSync(pp)) {
        try {
          const prContent = fs.readFileSync(pp, "utf-8");
          const prParsed = JSON.parse(prContent);
          if (prParsed.profileArn) {
            profileArn = prParsed.profileArn;
            break;
          }
        } catch {}
      }
    }

    res.json({
      found: true,
      refreshToken,
      clientId,
      clientSecret,
      region: tokenData?.region || "us-east-1",
      authMethod: tokenData?.authMethod || (clientId ? "idc" : "builder-id"),
      profileArn,
    });
  } catch (err: any) {
    res.json({
      found: false,
      error: err.message || "Failed to scan AWS SSO cache",
    });
  }
});

oauthRouter.post("/kiro/import", (req, res) => {
  const { refreshToken, clientId, clientSecret, region, authMethod, profileArn, name } = req.body;
  if (!refreshToken) {
    res.status(400).json({ error: "Refresh token is required" });
    return;
  }

  const existingProvider = ProviderRepository.getProviderById("kiro");
  if (!existingProvider) {
    const defaults = ProviderRepository.getProviderWithDefaults("kiro");
    if (defaults) {
      ProviderRepository.saveProvider(defaults);
    }
  }

  const accountId = `acc_${crypto.randomUUID().slice(0, 8)}`;
  const accountName = name || (clientId ? "Kiro Enterprise (IDC)" : "Kiro AWS Builder ID");

  ProviderRepository.addAccount({
    id: accountId,
    providerId: "kiro",
    name: accountName,
    rawApiKey: refreshToken,
    providerSpecificData: {
      refreshToken,
      clientId: clientId || null,
      clientSecret: clientSecret || null,
      region: region || "us-east-1",
      authMethod: authMethod || (clientId ? "idc" : "builder-id"),
      profileArn: profileArn || null,
    },
  });

  res.json({ success: true, id: accountId, name: accountName });
});

oauthRouter.post("/kiro/api-key", (req, res) => {
  const { apiKey, region, name } = req.body;
  if (!apiKey) {
    res.status(400).json({ error: "API key is required" });
    return;
  }

  const existingProvider = ProviderRepository.getProviderById("kiro");
  if (!existingProvider) {
    const defaults = ProviderRepository.getProviderWithDefaults("kiro");
    if (defaults) {
      ProviderRepository.saveProvider(defaults);
    }
  }

  const accountId = `acc_${crypto.randomUUID().slice(0, 8)}`;
  const accountName = name || "Kiro Headless API Key";

  ProviderRepository.addAccount({
    id: accountId,
    providerId: "kiro",
    name: accountName,
    rawApiKey: apiKey,
    providerSpecificData: {
      region: region || "us-east-1",
      authMethod: "api-key",
    },
  });

  res.json({ success: true, id: accountId, name: accountName });
});
