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
const WINDSURF_REGISTER_URL = "https://register.windsurf.com/exa.seat_management_pb.SeatManagementService/RegisterUser";
const DEVIN_AUTH_CODE_URL = "https://app.devin.ai/auth/windsurf/show-auth-code";

function parseWindsurfCallback(raw: string): { firebaseIdToken?: string; code?: string } {
  const text = String(raw || "").trim();
  let queryStr = text;
  if (text.includes("?")) queryStr = text.slice(text.indexOf("?") + 1);
  if (text.startsWith("#")) queryStr = text.slice(1);
  const params = Object.fromEntries(new URLSearchParams(queryStr));
  const err = params["error"];
  if (err) {
    throw new Error(`Windsurf auth failed: ${err} (${params["error_description"] || ""})`);
  }
  const code = params["code"] || params["devin_code"];
  const token = params["access_token"] || params["token"];
  return { firebaseIdToken: token, code };
}

async function registerWindsurfUser(firebaseIdToken: string): Promise<{ apiKey: string; apiServerUrl: string; name?: string }> {
  const res = await fetch(WINDSURF_REGISTER_URL, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      "User-Agent": "Windsurf/Mapigate",
    },
    body: JSON.stringify({ firebase_id_token: firebaseIdToken }),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Windsurf RegisterUser failed (${res.status}): ${errText}`);
  }

  const data: any = await res.json();
  const apiKey = data?.apiKey || data?.api_key;
  if (!apiKey) throw new Error("Windsurf RegisterUser response missing apiKey");
  const apiServerUrl = data?.apiServerUrl || data?.api_server_url || "https://server.codeium.com";
  return { apiKey, apiServerUrl, name: data?.name };
}

async function exchangeDevinCode(code: string): Promise<{ apiKey: string; apiServerUrl: string; name?: string }> {
  const hosts = [
    "https://server.codeium.com",
    "https://windsurf.com/_backend",
  ];
  let lastError: Error | null = null;
  for (const host of hosts) {
    try {
      const res = await fetch(`${host}/exa.seat_management_pb.SeatManagementService/ExchangeDevinCode`, {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
          "User-Agent": "Windsurf/Mapigate",
        },
        body: JSON.stringify({ code }),
      });
      if (!res.ok) {
        const errText = await res.text();
        let errMsg = `HTTP ${res.status}`;
        try {
          const parsed = JSON.parse(errText);
          if (parsed.message) errMsg = parsed.message;
        } catch {}
        lastError = new Error(`ExchangeDevinCode failed: ${errMsg}`);
        continue;
      }
      const data: any = await res.json();
      const apiKey = data?.sessionToken || data?.session_token || data?.auth1Token || data?.auth1_token;
      if (!apiKey) throw new Error("Devin code exchange response missing session token");
      const apiServerUrl = "https://server.codeium.com";
      const name = data?.primaryOrgId || data?.accountId || "Devin Windsurf User";
      return { apiKey, apiServerUrl, name };
    } catch (err: any) {
      lastError = err;
    }
  }
  throw lastError || new Error("Failed to exchange Devin authorization code");
}

export const windsurfOAuthHandler: ProviderOAuthHandler = {
  id: "windsurf",

  async authorize(params: OAuthAuthorizeParams): Promise<OAuthAuthorizeResult> {
    return {
      authUrl: DEVIN_AUTH_CODE_URL,
      flowType: "authorization_code",
      redirectUri: params.redirectUri,
      state: params.state,
    };
  },

  async exchange(params: OAuthExchangeParams): Promise<OAuthExchangeResult> {
    const rawCode = String(params.code || "").trim();
    let apiKey = "";
    let apiServerUrl = "https://server.codeium.com";
    let accountName = "Windsurf User";

    if (rawCode.startsWith("sk-ws-") || rawCode.startsWith("auth1_") || rawCode.startsWith("apk_") || rawCode.startsWith("pat_")) {
      apiKey = rawCode;
    } else if (rawCode.includes("?") || rawCode.includes("access_token=") || rawCode.includes("code=")) {
      const { firebaseIdToken, code } = parseWindsurfCallback(rawCode);
      if (code) {
        const reg = await exchangeDevinCode(code);
        apiKey = reg.apiKey;
        apiServerUrl = reg.apiServerUrl;
        accountName = reg.name || accountName;
      } else if (firebaseIdToken) {
        const reg = await registerWindsurfUser(firebaseIdToken);
        apiKey = reg.apiKey;
        apiServerUrl = reg.apiServerUrl;
        accountName = reg.name || accountName;
      } else {
        throw new Error("Callback URL missing authorization code or access_token");
      }
    } else if (rawCode.startsWith("eyJ")) {
      // Raw firebase token
      const reg = await registerWindsurfUser(rawCode);
      apiKey = reg.apiKey;
      apiServerUrl = reg.apiServerUrl;
      accountName = reg.name || accountName;
    } else {
      // Devin authorization code from show-auth-code (or direct session token)
      try {
        const reg = await exchangeDevinCode(rawCode);
        apiKey = reg.apiKey;
        apiServerUrl = reg.apiServerUrl;
        accountName = reg.name || accountName;
      } catch {
        // Fallback: attempt registerWindsurfUser
        try {
          const reg = await registerWindsurfUser(rawCode);
          apiKey = reg.apiKey;
          apiServerUrl = reg.apiServerUrl;
          accountName = reg.name || accountName;
        } catch {
          // If both fail, treat as raw API key directly
          apiKey = rawCode;
        }
      }
    }

    ProviderRepository.ensureProviderExists("windsurf");
    const accountId = `acc_${crypto.randomUUID().slice(0, 8)}`;
    ProviderRepository.addAccount({
      id: accountId,
      providerId: "windsurf",
      name: accountName,
      rawApiKey: apiKey,
      providerSpecificData: {
        authMethod: "oauth",
        apiServerUrl,
      },
    });

    return {
      success: true,
      account: {
        id: accountId,
        name: accountName,
        providerId: "windsurf",
      },
    };
  },
};

export function registerRoutes(_router?: Router): void {
  OAuthHandlerRegistry.register("windsurf", windsurfOAuthHandler);
  OAuthHandlerRegistry.register("devin-desktop", windsurfOAuthHandler);
  OAuthHandlerRegistry.register("devin", windsurfOAuthHandler);
}
