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

const KIMCHI_WEB_URL = "https://app.kimchi.dev";
const KIMCHI_VALIDATION_URL = "https://api.cast.ai/v1/llm/openai/supported-providers";
const KIMCHI_USERINFO_URL = "https://app.kimchi.dev/api/v1/me";

export const kimchiOAuthHandler: ProviderOAuthHandler = {
  id: "kimchi",

  async authorize(params: OAuthAuthorizeParams): Promise<OAuthAuthorizeResult> {
    const q = new URLSearchParams({
      callback: params.redirectUri,
      state: params.state || crypto.randomUUID(),
    });

    return {
      authUrl: `${KIMCHI_WEB_URL}/cli-auth?${q.toString()}`,
      flowType: "authorization_code",
      redirectUri: params.redirectUri,
      state: params.state,
    };
  },

  async exchange(params: OAuthExchangeParams): Promise<OAuthExchangeResult> {
    const accessToken = String(params.code || "").trim();
    if (!accessToken) throw new Error("Missing Kimchi token");

    const valRes = await fetch(KIMCHI_VALIDATION_URL, {
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
    });

    if (!valRes.ok) {
      throw new Error(`Kimchi token validation failed (${valRes.status})`);
    }

    let accountName = "Kimchi User";
    let email: string | undefined;
    try {
      const uRes = await fetch(KIMCHI_USERINFO_URL, {
        headers: {
          Accept: "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
      });
      if (uRes.ok) {
        const u: any = await uRes.json();
        accountName = u.name || u.username || u.email || accountName;
        email = u.email;
      }
    } catch {}

    ProviderRepository.ensureProviderExists("kimchi");
    const accountId = `acc_${crypto.randomUUID().slice(0, 8)}`;

    ProviderRepository.addAccount({
      id: accountId,
      providerId: "kimchi",
      name: accountName,
      rawApiKey: accessToken,
      providerSpecificData: {
        authMethod: "browser_token",
        email,
      },
    });

    return {
      success: true,
      account: {
        id: accountId,
        name: accountName,
        providerId: "kimchi",
      },
    };
  },
};

export function registerRoutes(_router?: Router): void {
  OAuthHandlerRegistry.register("kimchi", kimchiOAuthHandler);
}
