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

const GITLAB_DEFAULT_BASE_URL = "https://gitlab.com";
const GITLAB_SCOPE = "api read_user";

export const gitlabOAuthHandler: ProviderOAuthHandler = {
  id: "gitlab",

  async authorize(params: OAuthAuthorizeParams): Promise<OAuthAuthorizeResult> {
    const baseUrl = params.baseUrl || GITLAB_DEFAULT_BASE_URL;
    const clientId = params.clientId || "";

    const q = new URLSearchParams({
      client_id: clientId,
      redirect_uri: params.redirectUri,
      response_type: "code",
      state: params.state || crypto.randomUUID(),
      scope: GITLAB_SCOPE,
      code_challenge: params.codeChallenge || "",
      code_challenge_method: "S256",
    });

    return {
      authUrl: `${baseUrl}/oauth/authorize?${q.toString()}`,
      flowType: "authorization_code_pkce",
      redirectUri: params.redirectUri,
      state: params.state,
      codeVerifier: params.codeVerifier,
    };
  },

  async exchange(params: OAuthExchangeParams): Promise<OAuthExchangeResult> {
    const baseUrl = params.baseUrl || GITLAB_DEFAULT_BASE_URL;
    const clientId = params.clientId || "";
    const clientSecret = params.clientSecret || "";

    const body = new URLSearchParams({
      client_id: clientId,
      grant_type: "authorization_code",
      code: params.code,
      redirect_uri: params.redirectUri,
      code_verifier: params.codeVerifier || "",
    });
    if (clientSecret) body.set("client_secret", clientSecret);

    const res = await fetch(`${baseUrl}/oauth/token`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
      body: body.toString(),
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`GitLab token exchange failed (${res.status}): ${err}`);
    }

    const tokens: any = await res.json();
    const accessToken = tokens.access_token;
    if (!accessToken) throw new Error("GitLab token exchange returned no access_token");

    let accountName = "GitLab User";
    let email: string | undefined;

    try {
      const uRes = await fetch(`${baseUrl}/api/v4/user`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (uRes.ok) {
        const u: any = await uRes.json();
        accountName = u.name || u.username || accountName;
        email = u.email || u.public_email;
      }
    } catch {}

    ProviderRepository.ensureProviderExists("gitlab");
    const accountId = `acc_${crypto.randomUUID().slice(0, 8)}`;

    ProviderRepository.addAccount({
      id: accountId,
      providerId: "gitlab",
      name: accountName,
      rawApiKey: accessToken,
      providerSpecificData: {
        authMethod: "oauth",
        email,
        baseUrl,
        clientId,
        refreshToken: tokens.refresh_token,
        tokenExpiresAt: tokens.expires_in ? Date.now() + tokens.expires_in * 1000 : undefined,
      },
    });

    return {
      success: true,
      account: {
        id: accountId,
        name: accountName,
        providerId: "gitlab",
      },
    };
  },
};

export function registerRoutes(_router?: Router): void {
  OAuthHandlerRegistry.register("gitlab", gitlabOAuthHandler);
}
