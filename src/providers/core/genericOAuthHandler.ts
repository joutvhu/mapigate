import crypto from "node:crypto";
import { getRegistryProvider } from "./metadataRegistry.js";
import { ProviderRepository } from "../../storage/repositories/providerRepo.js";
import type {
  ProviderOAuthHandler,
  OAuthAuthorizeParams,
  OAuthAuthorizeResult,
  OAuthExchangeParams,
  OAuthExchangeResult,
  DeviceCodeParams,
  DeviceCodeResult,
} from "./oauthTypes.js";

/**
 * Generic OAuth Handler for providers configured via metadata registry.
 * Dispatches authorize, device code, and token exchange based on provider metadata settings.
 */
export class GenericOAuthHandler implements ProviderOAuthHandler {
  public readonly id?: string;

  constructor(id?: string) {
    this.id = id;
  }

  public async authorize(params: OAuthAuthorizeParams): Promise<OAuthAuthorizeResult> {
    const providerId = this.id || params.provider;
    const reg = getRegistryProvider(providerId);

    if (!reg?.oauth?.authorizeUrl) {
      throw new Error(`Provider '${providerId}' does not support OAuth authorize endpoint`);
    }

    const scopes = Array.isArray(reg.oauth.scopes)
      ? reg.oauth.scopes.join(" ")
      : (reg.oauth.scope || "");

    const urlParams = new URLSearchParams({
      client_id: reg.oauth.clientId || "",
      response_type: "code",
      redirect_uri: params.redirectUri,
      state: params.state || "",
    });

    if (scopes) {
      urlParams.set("scope", scopes);
    }

    if (reg.oauth.codeChallengeMethod || params.codeChallenge) {
      if (params.codeChallenge) {
        urlParams.set("code_challenge", params.codeChallenge);
      }
      urlParams.set("code_challenge_method", reg.oauth.codeChallengeMethod || "S256");
    }

    const authUrl = `${reg.oauth.authorizeUrl}?${urlParams.toString()}`;

    return {
      authUrl,
      redirectUri: params.redirectUri,
      state: params.state,
      codeVerifier: params.codeVerifier,
      codeChallenge: params.codeChallenge,
      flowType: "authorization_code",
    };
  }

  public async deviceCode(params?: DeviceCodeParams): Promise<DeviceCodeResult> {
    const providerId = this.id || params?.provider;
    if (!providerId) {
      throw new Error("Missing provider ID for device code request");
    }
    const reg = getRegistryProvider(providerId);

    if (!reg?.oauth?.deviceCodeUrl) {
      throw new Error(`Provider '${providerId}' does not support device code endpoint`);
    }

    const resp = await fetch(reg.oauth.deviceCodeUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "application/json",
      },
      body: new URLSearchParams({ client_id: reg.oauth.clientId || "" }),
    });

    if (!resp.ok) {
      const errText = await resp.text();
      throw new Error(`Device code request failed (${resp.status}): ${errText}`);
    }

    const data = (await resp.json()) as DeviceCodeResult;
    return data;
  }

  public async exchange(params: OAuthExchangeParams): Promise<OAuthExchangeResult> {
    const providerId = (this.id || params.provider).toLowerCase();
    const reg = getRegistryProvider(providerId);

    if (!reg?.oauth?.tokenUrl) {
      throw new Error(`OAuth exchange not implemented for provider '${providerId}'`);
    }

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
          code: params.code,
          redirect_uri: params.redirectUri,
          code_verifier: params.codeVerifier,
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
          code: params.code,
          redirect_uri: params.redirectUri,
          ...(params.codeVerifier ? { code_verifier: params.codeVerifier } : {}),
        }),
      });
    }

    if (!tokenRes.ok) {
      const errText = await tokenRes.text();
      return { success: false, error: `OAuth exchange failed: ${errText}` };
    }

    const tokenData: any = await tokenRes.json();
    const accessToken = tokenData.access_token || tokenData.token;
    if (!accessToken) {
      return { success: false, error: "No access token received from provider" };
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

    ProviderRepository.ensureProviderExists(providerId);

    ProviderRepository.addAccount({
      id: accountId,
      providerId,
      name: accountName,
      rawApiKey: storedToken,
      providerSpecificData: {
        refreshToken,
        expiresAt,
      },
    });

    return {
      success: true,
      account: { id: accountId, name: accountName, providerId },
    };
  }
}
