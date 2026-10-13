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

const IFLOW_CLIENT_ID = "REDACTED_IFLOW_CLIENT_ID";
const IFLOW_CLIENT_SECRET = "REDACTED_IFLOW_CLIENT_SECRET";
const IFLOW_AUTHORIZE_URL = "https://iflow.cn/oauth";
const IFLOW_TOKEN_URL = "https://iflow.cn/oauth/token";
const IFLOW_USER_INFO_URL = "https://iflow.cn/api/oauth/getUserInfo";

export const iflowOAuthHandler: ProviderOAuthHandler = {
  id: "iflow",

  async authorize(params: OAuthAuthorizeParams): Promise<OAuthAuthorizeResult> {
    const q = new URLSearchParams({
      loginMethod: "phone",
      type: "phone",
      redirect: params.redirectUri,
      state: params.state || crypto.randomUUID(),
      client_id: IFLOW_CLIENT_ID,
    });

    return {
      authUrl: `${IFLOW_AUTHORIZE_URL}?${q.toString()}`,
      flowType: "authorization_code",
      redirectUri: params.redirectUri,
      state: params.state,
    };
  },

  async exchange(params: OAuthExchangeParams): Promise<OAuthExchangeResult> {
    const basicAuth = Buffer.from(`${IFLOW_CLIENT_ID}:${IFLOW_CLIENT_SECRET}`).toString("base64");
    const res = await fetch(IFLOW_TOKEN_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "application/json",
        Authorization: `Basic ${basicAuth}`,
      },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code: params.code,
        redirect_uri: params.redirectUri,
        client_id: IFLOW_CLIENT_ID,
        client_secret: IFLOW_CLIENT_SECRET,
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`iFlow token exchange failed (${res.status}): ${err}`);
    }

    const tokens: any = await res.json();
    const accessToken = tokens.access_token;
    if (!accessToken) throw new Error("iFlow token exchange returned no access_token");

    const userRes = await fetch(`${IFLOW_USER_INFO_URL}?accessToken=${encodeURIComponent(accessToken)}`, {
      headers: { Accept: "application/json" },
    });

    if (!userRes.ok) {
      const err = await userRes.text();
      throw new Error(`iFlow getUserInfo failed: ${err}`);
    }

    const userJson: any = await userRes.json();
    if (!userJson.success || !userJson.data?.apiKey) {
      throw new Error(`iFlow user info missing apiKey: ${userJson.message || "Unknown error"}`);
    }

    const apiKey = userJson.data.apiKey;
    const email = userJson.data.email || userJson.data.phone || "iFlow User";
    const displayName = userJson.data.nickname || userJson.data.name || email;

    ProviderRepository.ensureProviderExists("iflow");
    const accountId = `acc_${crypto.randomUUID().slice(0, 8)}`;

    ProviderRepository.addAccount({
      id: accountId,
      providerId: "iflow",
      name: displayName,
      rawApiKey: apiKey,
      providerSpecificData: {
        authMethod: "oauth",
        email,
        accessToken,
        refreshToken: tokens.refresh_token,
        tokenExpiresAt: tokens.expires_in ? Date.now() + tokens.expires_in * 1000 : undefined,
      },
    });

    return {
      success: true,
      account: {
        id: accountId,
        name: displayName,
        providerId: "iflow",
      },
    };
  },
};

export function registerRoutes(_router?: Router): void {
  OAuthHandlerRegistry.register("iflow", iflowOAuthHandler);
}
