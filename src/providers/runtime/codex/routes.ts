import http from "node:http";
import crypto from "node:crypto";
import type { Router } from "express";
import { ProviderRepository } from "../../../storage/repositories/providerRepo.js";
import { OAuthHandlerRegistry } from "../../core/oauthRegistry.js";
import { parseJwtPayload } from "../../../shared/utils/jwt.js";
import { generatePKCE } from "../../../shared/utils/pkce.js";
import type {
  ProviderOAuthHandler,
  OAuthAuthorizeParams,
  OAuthAuthorizeResult,
  OAuthExchangeParams,
  OAuthExchangeResult,
  OAuthRefreshTokenParams,
  OAuthRefreshTokenResult,
} from "../../core/oauthTypes.js";
import { resolvePublicCred } from "../../../shared/utils/publicCreds.js";

export const CODEX_CLIENT_ID = resolvePublicCred("codex_client_id");
export const CODEX_AUTHORIZE_URL = "https://auth.openai.com/oauth/authorize";
export const CODEX_TOKEN_URL = "https://auth.openai.com/oauth/token";
export const CODEX_SCOPE = "openid profile email offline_access";

let codexProxyServer: http.Server | null = null;
let codexProxyTimeout: NodeJS.Timeout | null = null;

export function stopCodexProxy(): void {
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

export function startCodexProxy(appPort: number): void {
  if (codexProxyServer) return;

  const server = http.createServer((req, res) => {
    const url = new URL(req.url || "/", "http://localhost");

    if (url.pathname !== "/callback" && url.pathname !== "/auth/callback") {
      res.writeHead(404);
      res.end("Not found");
      return;
    }

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

export const codexOAuthHandler: ProviderOAuthHandler = {
  id: "codex",

  authorize(params: OAuthAuthorizeParams): OAuthAuthorizeResult {
    let { codeVerifier, codeChallenge, state } = params;
    if (!codeVerifier || !codeChallenge) {
      const pkce = generatePKCE(32);
      codeVerifier = pkce.codeVerifier;
      codeChallenge = pkce.codeChallenge;
      if (!state) state = pkce.state;
    }

    const codexRedirect = "http://localhost:1455/auth/callback";
    const authParams = {
      response_type: "code",
      client_id: CODEX_CLIENT_ID,
      redirect_uri: codexRedirect,
      scope: CODEX_SCOPE,
      code_challenge: codeChallenge,
      code_challenge_method: "S256",
      id_token_add_organizations: "true",
      codex_cli_simplified_flow: "true",
      originator: "codex_cli_rs",
      state: state || "",
    };

    const queryString = Object.entries(authParams)
      .map(([k, v]) => `${k}=${encodeURIComponent(v)}`)
      .join("&");
    const authUrl = `${CODEX_AUTHORIZE_URL}?${queryString}`;

    const appPort = Number(params.appPort) || Number(process.env.PORT) || 20127;
    startCodexProxy(appPort);

    return {
      authUrl,
      redirectUri: codexRedirect,
      state,
      codeVerifier,
      codeChallenge,
      flowType: "authorization_code_pkce",
    };
  },

  async exchange(params: OAuthExchangeParams): Promise<OAuthExchangeResult> {
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
        code: params.code,
        redirect_uri: codexRedirect,
        code_verifier: params.codeVerifier || "",
      }),
    });

    if (!tokenRes.ok) {
      const errText = await tokenRes.text();
      return { success: false, error: `Codex OAuth exchange failed: ${errText}` };
    }

    const tokenData: any = await tokenRes.json();
    const accessToken = tokenData.access_token;
    if (!accessToken) {
      return { success: false, error: "No access token received from Codex" };
    }

    let accountName = "Codex Account";
    let chatgptAccountId: string | undefined;
    let chatgptPlanType: string | undefined;
    if (tokenData.id_token) {
      const payload = parseJwtPayload<any>(tokenData.id_token);
      const email = payload?.email || payload?.["https://api.openai.com/profile"]?.email;
      if (email) accountName = email;
      chatgptAccountId = payload?.["https://api.openai.com/auth"]?.chatgpt_account_id;
      chatgptPlanType = payload?.["https://api.openai.com/auth"]?.chatgpt_plan_type;
    }

    ProviderRepository.ensureProviderExists("codex");
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

    return {
      success: true,
      account: { id: accountId, name: accountName, providerId: "codex" },
    };
  },

  async refreshToken(params: OAuthRefreshTokenParams): Promise<OAuthRefreshTokenResult | null> {
    const token = params.refreshToken;
    if (!token) return null;
    const res = await fetch(CODEX_TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
      body: new URLSearchParams({
        grant_type: "refresh_token",
        client_id: CODEX_CLIENT_ID,
        refresh_token: token,
      }),
    });
    if (!res.ok) return null;
    const data: any = await res.json();
    return {
      accessToken: data.access_token,
      refreshToken: data.refresh_token || token,
      expiresIn: Number(data.expires_in) || 3600,
    };
  },
};

export function registerRoutes(_router?: Router): void {
  OAuthHandlerRegistry.register("codex", codexOAuthHandler);
}
