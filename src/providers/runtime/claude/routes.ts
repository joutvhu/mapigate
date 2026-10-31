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
} from "../../core/oauthTypes.js";
import { resolvePublicCred } from "../../../shared/utils/publicCreds.js";

export const CLAUDE_CLIENT_ID = resolvePublicCred("claude_client_id");
export const CLAUDE_AUTHORIZE_URL = "https://claude.ai/oauth/authorize";
export const CLAUDE_TOKEN_URL = "https://api.anthropic.com/v1/oauth/token";
export const CLAUDE_SCOPES = [
  "org:create_api_key",
  "user:profile",
  "user:inference",
];

export const claudeOAuthHandler: ProviderOAuthHandler = {
  id: "claude",

  authorize(params: OAuthAuthorizeParams): OAuthAuthorizeResult {
    let { codeVerifier, codeChallenge, state } = params;
    if (!codeVerifier || !codeChallenge) {
      const pkce = generatePKCE(32);
      codeVerifier = pkce.codeVerifier;
      codeChallenge = pkce.codeChallenge;
      if (!state) state = pkce.state;
    }

    const urlParams = new URLSearchParams({
      code: "true",
      client_id: CLAUDE_CLIENT_ID,
      response_type: "code",
      redirect_uri: params.redirectUri,
      scope: CLAUDE_SCOPES.join(" "),
      code_challenge: codeChallenge,
      code_challenge_method: "S256",
      state: state || "",
    });

    return {
      authUrl: `${CLAUDE_AUTHORIZE_URL}?${urlParams.toString()}`,
      redirectUri: params.redirectUri,
      state,
      codeVerifier,
      codeChallenge,
      flowType: "authorization_code_pkce",
    };
  },

  async exchange(params: OAuthExchangeParams): Promise<OAuthExchangeResult> {
    let rawCode = params.code.trim();
    let extractedCodeState = "";
    if (rawCode.includes("#")) {
      const parts = rawCode.split("#");
      rawCode = parts[0];
      extractedCodeState = parts[1] || "";
    }

    const tokenRes = await fetch(CLAUDE_TOKEN_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        code: rawCode,
        state: extractedCodeState || params.state || undefined,
        grant_type: "authorization_code",
        client_id: CLAUDE_CLIENT_ID,
        redirect_uri: params.redirectUri,
        code_verifier: params.codeVerifier,
      }),
    });

    if (!tokenRes.ok) {
      const errText = await tokenRes.text();
      return { success: false, error: `Claude OAuth exchange failed: ${errText}` };
    }

    const tokenData: any = await tokenRes.json();
    const accessToken = tokenData.access_token;
    if (!accessToken) {
      return { success: false, error: "No access token received from Claude" };
    }

    let accountName = "Claude Account";
    if (tokenData.id_token) {
      const payload = parseJwtPayload<any>(tokenData.id_token);
      if (payload?.email) accountName = payload.email;
    }

    ProviderRepository.ensureProviderExists("claude");
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

    return {
      success: true,
      account: { id: accountId, name: accountName, providerId: "claude" },
    };
  },
};

export function registerRoutes(_router?: Router): void {
  OAuthHandlerRegistry.register("claude", claudeOAuthHandler);
}
