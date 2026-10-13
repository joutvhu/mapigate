import crypto from "node:crypto";
import type { Router } from "express";
import { OAuthHandlerRegistry } from "../../core/oauthRegistry.js";
import { ProviderRepository } from "../../../storage/repositories/providerRepo.js";
import type {
  ProviderOAuthHandler,
  OAuthAuthorizeParams,
  OAuthAuthorizeResult,
  OAuthExchangeParams,
  OAuthExchangeResult,
} from "../../core/oauthTypes.js";

const CLINEPASS_AUTHORIZE_URL = "https://api.cline.bot/api/v1/auth/authorize";
const CLINEPASS_TOKEN_URL = "https://api.cline.bot/api/v1/auth/token";

export const clinepassOAuthHandler: ProviderOAuthHandler = {
  id: "clinepass",

  async authorize(params: OAuthAuthorizeParams): Promise<OAuthAuthorizeResult> {
    const q = new URLSearchParams({
      client_type: "extension",
      callback_url: params.redirectUri,
      redirect_uri: params.redirectUri,
    });

    return {
      authUrl: `${CLINEPASS_AUTHORIZE_URL}?${q.toString()}`,
      flowType: "authorization_code",
      redirectUri: params.redirectUri,
      state: params.state,
    };
  },

  async exchange(params: OAuthExchangeParams): Promise<OAuthExchangeResult> {
    const raw = String(params.code || "").trim();
    let accessToken = "";
    let refreshToken = "";
    let email = "ClinePass User";

    try {
      let base64 = raw;
      const padding = 4 - (base64.length % 4);
      if (padding !== 4) base64 += "=".repeat(padding);
      const decoded = Buffer.from(base64, "base64").toString("utf-8");
      const lastBrace = decoded.lastIndexOf("}");
      if (lastBrace === -1) throw new Error("No JSON in code");
      const tokenData = JSON.parse(decoded.substring(0, lastBrace + 1));
      accessToken = tokenData.accessToken;
      refreshToken = tokenData.refreshToken || "";
      email = tokenData.email || email;
    } catch {
      const res = await fetch(CLINEPASS_TOKEN_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({
          grant_type: "authorization_code",
          code: raw,
          client_type: "extension",
          redirect_uri: params.redirectUri,
        }),
      });

      if (!res.ok) {
        const err = await res.text();
        throw new Error(`ClinePass token exchange failed (${res.status}): ${err}`);
      }

      const data: any = await res.json();
      accessToken = data.data?.accessToken || data.accessToken;
      refreshToken = data.data?.refreshToken || data.refreshToken || "";
      email = data.data?.userInfo?.email || email;
    }

    if (!accessToken) throw new Error("No access_token obtained for ClinePass");

    ProviderRepository.ensureProviderExists("clinepass");
    const accountId = `acc_${crypto.randomUUID().slice(0, 8)}`;

    ProviderRepository.addAccount({
      id: accountId,
      providerId: "clinepass",
      name: email,
      rawApiKey: accessToken,
      providerSpecificData: {
        authMethod: "oauth",
        email,
        refreshToken,
      },
    });

    return {
      success: true,
      account: {
        id: accountId,
        name: email,
        providerId: "clinepass",
      },
    };
  },
};

export function registerRoutes(_router?: Router): void {
  OAuthHandlerRegistry.register("clinepass", clinepassOAuthHandler);
}
