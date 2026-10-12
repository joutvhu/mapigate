import crypto from "node:crypto";
import type { Router } from "express";
import { ProviderRepository } from "../../../storage/repositories/providerRepo.js";
import { OAuthHandlerRegistry } from "../../core/oauthRegistry.js";
import { getRegistryProvider } from "../../core/metadataRegistry.js";
import type {
  ProviderOAuthHandler,
  OAuthAuthorizeParams,
  OAuthAuthorizeResult,
  OAuthExchangeParams,
  OAuthExchangeResult,
} from "../../core/oauthTypes.js";

export function parseClineBase64Token(rawCode: string): any | null {
  try {
    let base64 = rawCode;
    const padding = 4 - (base64.length % 4);
    if (padding !== 4) base64 += "=".repeat(padding);
    const decoded = Buffer.from(base64, "base64").toString("utf8");
    const lastBrace = decoded.lastIndexOf("}");
    if (lastBrace !== -1) {
      return JSON.parse(decoded.substring(0, lastBrace + 1));
    }
  } catch {}
  return null;
}

export const clineOAuthHandler: ProviderOAuthHandler = {
  id: "cline",

  authorize(params: OAuthAuthorizeParams): OAuthAuthorizeResult {
    const pId = (params.provider || "cline").toLowerCase();
    const reg = getRegistryProvider(pId);
    const authEndpoint = reg?.oauth?.authorizeUrl || "https://api.cline.bot/api/v1/auth/authorize";

    const urlParams = new URLSearchParams({
      client_type: "extension",
      callback_url: params.redirectUri,
      redirect_uri: params.redirectUri,
      state: params.state || "",
    });

    return {
      authUrl: `${authEndpoint}?${urlParams.toString()}`,
      redirectUri: params.redirectUri,
      state: params.state,
      flowType: "authorization_code",
    };
  },

  async exchange(params: OAuthExchangeParams): Promise<OAuthExchangeResult> {
    const pId = (params.provider || "cline").toLowerCase();
    const rawCode = params.code.trim();

    let accessToken = "";
    let refreshToken = "";
    let email = "";
    let expiresAt: number | undefined;
    let firstName = "";
    let lastName = "";

    const decodedJson = parseClineBase64Token(rawCode);
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
          redirect_uri: params.redirectUri,
        }),
      });

      if (!tokenRes.ok) {
        const errText = await tokenRes.text();
        return { success: false, error: `${pId} token exchange failed: ${errText}` };
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
      return { success: false, error: `No access token received from ${pId}` };
    }

    const accountName = email || `${pId.toUpperCase()} Account`;
    const accountId = `acc_${crypto.randomUUID().slice(0, 8)}`;
    const expiresInSec = expiresAt ? Math.max(60, Math.floor((expiresAt - Date.now()) / 1000)) : 3600;

    ProviderRepository.ensureProviderExists(pId);

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

    return {
      success: true,
      account: { id: accountId, name: accountName, providerId: pId },
    };
  },
};

export function registerRoutes(_router?: Router): void {
  OAuthHandlerRegistry.register("cline", clineOAuthHandler);
}
