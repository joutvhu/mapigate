import crypto from "node:crypto";
import type { Router } from "express";
import { ProviderRepository } from "../../../storage/repositories/providerRepo.js";
import { OAuthHandlerRegistry } from "../../core/oauthRegistry.js";
import type {
  ProviderOAuthHandler,
  OAuthAuthorizeParams,
  OAuthAuthorizeResult,
  OAuthExchangeParams,
  OAuthExchangeResult,
} from "../../core/oauthTypes.js";
import {
  ANTIGRAVITY_CLIENT_ID,
  ANTIGRAVITY_CLIENT_SECRET,
  ANTIGRAVITY_SCOPES,
  loadCodeAssist,
  onboardUser,
} from "../antigravity/routes.js";

// Exported for backward compatibility with tests and consumers
export const GOOGLE_OAUTH_CLIENT_ID = ANTIGRAVITY_CLIENT_ID;
export const GOOGLE_OAUTH_CLIENT_SECRET = ANTIGRAVITY_CLIENT_SECRET;
export const GOOGLE_OAUTH_SCOPES = ANTIGRAVITY_SCOPES;

export const geminiCliOAuthHandler: ProviderOAuthHandler = {
  id: "gemini-cli",

  authorize(params: OAuthAuthorizeParams): OAuthAuthorizeResult {
    const urlParams = new URLSearchParams({
      client_id: ANTIGRAVITY_CLIENT_ID,
      response_type: "code",
      redirect_uri: params.redirectUri,
      scope: ANTIGRAVITY_SCOPES.join(" "),
      state: params.state || "",
      access_type: "offline",
      prompt: "consent",
    });
    return {
      authUrl: `https://accounts.google.com/o/oauth2/v2/auth?${urlParams.toString()}`,
      redirectUri: params.redirectUri,
      state: params.state,
      flowType: "authorization_code",
    };
  },

  async exchange(params: OAuthExchangeParams): Promise<OAuthExchangeResult> {
    const pId = (params.provider || "gemini-cli").toLowerCase();

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
        code: params.code,
        redirect_uri: params.redirectUri,
      }),
    });

    if (!tokenRes.ok) {
      const errText = await tokenRes.text();
      return { success: false, error: `Gemini CLI OAuth exchange failed: ${errText}` };
    }

    const tokenData: any = await tokenRes.json();
    const accessToken = tokenData.access_token;
    if (!accessToken) {
      return { success: false, error: "No access token received from Google" };
    }

    let accountName = "Gemini CLI Google Account";
    try {
      const userRes = await fetch("https://www.googleapis.com/oauth2/v2/userinfo?alt=json", {
        headers: { Authorization: `Bearer ${accessToken}`, "x-request-source": "local" },
      });
      if (userRes.ok) {
        const userData: any = await userRes.json();
        if (userData.email) accountName = userData.email;
      }
    } catch {}

    const { projectId, tierId } = await loadCodeAssist(accessToken);
    if (projectId) onboardUser(accessToken, tierId);

    ProviderRepository.ensureProviderExists(pId);
    const accountId = `acc_${crypto.randomUUID().slice(0, 8)}`;
    const refreshToken = tokenData.refresh_token || undefined;
    const expiresIn = Number(tokenData.expires_in) || 3600;
    const expiresAt = Date.now() + expiresIn * 1000;

    const storedToken = JSON.stringify({
      accessToken,
      refreshToken,
      expiresAt,
      projectId: projectId || undefined,
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
        projectId: projectId || undefined,
        tierId: tierId || undefined,
      },
    });

    return {
      success: true,
      account: { id: accountId, name: accountName, providerId: pId },
    };
  },
};

export function registerRoutes(_router?: Router): void {
  OAuthHandlerRegistry.register("gemini-cli", geminiCliOAuthHandler);
  // Also register alias gemini for backward compatibility with oauth requests
  OAuthHandlerRegistry.register("gemini", geminiCliOAuthHandler);
}
