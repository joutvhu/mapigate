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

const TRAE_CLIENT_ID = "REDACTED_TRAE_CLIENT_ID";
const TRAE_CLIENT_SECRET = "-";
const TRAE_GUIDANCE_URLS = [
  "https://api.marscode.com/cloudide/api/v3/trae/GetLoginGuidance",
  "https://api.trae.ai/cloudide/api/v3/trae/GetLoginGuidance",
  "https://www.trae.ai/cloudide/api/v3/trae/GetLoginGuidance",
];
const TRAE_EXCHANGE_URL = "https://api.marscode.com/cloudide/api/v3/trae/oauth/ExchangeToken";
const TRAE_USER_INFO_URL = "https://api.marscode.com/cloudide/api/v3/trae/GetUserInfo";

async function fetchTraeLoginGuidance(loginTraceId: string): Promise<string> {
  const body = JSON.stringify({ loginTraceID: loginTraceId, login_trace_id: loginTraceId });
  let lastErr = "no successful response";
  for (const url of TRAE_GUIDANCE_URLS) {
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
          "User-Agent": "Trae/1.0.0 Mapigate",
        },
        body,
      });
      if (!res.ok) {
        lastErr = `${url} HTTP ${res.status}`;
        continue;
      }
      const data: any = await res.json();
      const loginHost =
        data?.Result?.LoginHost ||
        data?.Result?.loginHost ||
        data?.Result?.LoginURL ||
        data?.result?.loginHost ||
        data?.data?.Result?.LoginHost ||
        data?.data?.loginHost ||
        data?.LoginHost ||
        data?.loginHost;
      if (loginHost) return String(loginHost);
      lastErr = `${url} missing LoginHost`;
    } catch (e: any) {
      lastErr = `${url} ${e.message}`;
    }
  }
  throw new Error(`Trae GetLoginGuidance failed: ${lastErr}`);
}

function buildTraeVerificationUrl(loginHost: string, loginTraceId: string, callbackUrl: string, machineId: string): string {
  const cleanHost = loginHost.startsWith("http") ? loginHost : `https://${loginHost.replace(/^\/+/, "")}`;
  const url = new URL(cleanHost);
  url.pathname = "/authorization";
  const p = url.searchParams;
  p.set("login_version", "1");
  p.set("auth_from", "trae");
  p.set("login_channel", "native_ide");
  p.set("plugin_version", "local");
  p.set("auth_type", "local");
  p.set("client_id", TRAE_CLIENT_ID);
  p.set("redirect", "0");
  p.set("login_trace_id", loginTraceId);
  p.set("auth_callback_url", callbackUrl);
  p.set("machine_id", machineId);
  p.set("device_id", "0");
  p.set("x_device_id", "0");
  p.set("x_machine_id", machineId);
  p.set("x_device_brand", "unknown");
  p.set("x_device_type", "unknown");
  p.set("x_os_version", "unknown");
  p.set("x_env", "");
  p.set("x_app_version", "3.5.54");
  p.set("x_app_type", "stable");
  return url.toString();
}

function parseTraeCallback(raw: string): { refreshToken: string; loginHost: string; cloudideToken?: string } {
  const text = String(raw || "").trim();
  let queryStr = text;
  if (text.includes("?")) queryStr = text.slice(text.indexOf("?") + 1);
  if (text.startsWith("#")) queryStr = text.slice(1);
  const params = Object.fromEntries(new URLSearchParams(queryStr));
  const pick = (keys: string[]) => {
    for (const k of keys) {
      const v = params[k];
      if (v && String(v).trim()) return String(v).trim();
    }
    return null;
  };
  const err = pick(["error", "error_code", "errorCode"]);
  if (err) {
    const desc = pick(["error_description", "error_desc", "message"]);
    throw new Error(desc ? `Trae auth failed: ${err} (${desc})` : `Trae auth failed: ${err}`);
  }

  let userJwt: any = null;
  const rawJwt = pick(["userJwt", "user_jwt"]);
  if (rawJwt) {
    try { userJwt = JSON.parse(rawJwt); } catch {}
  }

  const cloudideToken =
    userJwt?.Token ||
    userJwt?.token ||
    pick(["x-cloudide-token", "xCloudideToken", "accessToken", "access_token", "token"]) ||
    undefined;

  const refreshToken =
    userJwt?.RefreshToken ||
    userJwt?.refreshToken ||
    pick(["refreshToken", "refresh_token", "RefreshToken", "data"]);

  if (!cloudideToken && !refreshToken) {
    throw new Error("Trae callback missing refreshToken");
  }

  const loginHost = pick(["loginHost", "login_host", "LoginHost", "host", "consoleHost"]) || "api.marscode.com";
  return { refreshToken: refreshToken || "", loginHost, cloudideToken };
}

export const traeOAuthHandler: ProviderOAuthHandler = {
  id: "trae",

  async authorize(params: OAuthAuthorizeParams): Promise<OAuthAuthorizeResult> {
    const loginTraceId = crypto.randomUUID();
    const machineId = crypto.randomUUID();
    const loginHost = await fetchTraeLoginGuidance(loginTraceId);

    const appPort = Number(params.appPort) || Number(process.env.PORT) || 20127;
    const callbackUrl = `http://127.0.0.1:${appPort}/authorize`;
    const authUrl = buildTraeVerificationUrl(loginHost, loginTraceId, callbackUrl, machineId);
    return {
      authUrl,
      flowType: "authorization_code",
      redirectUri: callbackUrl,
      state: params.state || loginTraceId,
      codeVerifier: machineId,
    };
  },

  async exchange(params: OAuthExchangeParams): Promise<OAuthExchangeResult> {
    const raw = String(params.code || "").trim();
    let accessToken = "";
    let refreshToken = "";
    let loginHost = "api.marscode.com";
    let expiresAt: any = null;

    if (raw.startsWith("eyJ") && raw.includes(".")) {
      accessToken = raw;
    } else {
      const parsed = parseTraeCallback(raw);
      refreshToken = parsed.refreshToken;
      loginHost = parsed.loginHost;
      if (parsed.cloudideToken) {
        accessToken = parsed.cloudideToken;
      } else if (refreshToken) {
        const exchangeRes = await fetch(TRAE_EXCHANGE_URL, {
          method: "POST",
          headers: {
            Accept: "application/json",
            "Content-Type": "application/json",
            "User-Agent": "Trae/1.0.0 Mapigate",
          },
          body: JSON.stringify({
            ClientID: TRAE_CLIENT_ID,
            RefreshToken: refreshToken,
            ClientSecret: TRAE_CLIENT_SECRET,
            UserID: "",
          }),
        });

        if (!exchangeRes.ok) {
          const errText = await exchangeRes.text();
          throw new Error(`Trae token exchange failed (${exchangeRes.status}): ${errText}`);
        }

        const exchangeData: any = await exchangeRes.json();
        const result = exchangeData?.Result || exchangeData?.result || exchangeData?.data || exchangeData;
        accessToken = result?.AccessToken || result?.accessToken;
        refreshToken = result?.RefreshToken || result?.refreshToken || refreshToken;
        expiresAt = result?.ExpiresAt || result?.expiresAt;
      }
    }

    if (!accessToken) {
      throw new Error("Trae exchange did not return access token");
    }

    let accountName = "Trae User";
    let email: string | undefined;
    try {
      const userRes = await fetch(TRAE_USER_INFO_URL, {
        headers: {
          Accept: "application/json",
          "Authorization": `Cloud-IDE-JWT ${accessToken}`,
          "x-cloudide-token": accessToken,
        },
      });
      if (userRes.ok) {
        const uData: any = await userRes.json();
        const u = uData?.Result || uData?.result || uData?.data || uData;
        accountName = u?.Name || u?.name || u?.Username || u?.username || accountName;
        email = u?.Email || u?.email;
      }
    } catch {}

    ProviderRepository.ensureProviderExists("trae");
    const accountId = `acc_${crypto.randomUUID().slice(0, 8)}`;
    ProviderRepository.addAccount({
      id: accountId,
      providerId: "trae",
      name: accountName,
      rawApiKey: accessToken,
      providerSpecificData: {
        authMethod: "oauth",
        email,
        loginHost,
        refreshToken,
        tokenExpiresAt: expiresAt ? Number(expiresAt) * 1000 : Date.now() + 14 * 86400 * 1000,
      },
    });

    return {
      success: true,
      account: {
        id: accountId,
        name: accountName,
        providerId: "trae",
      },
    };
  },
};

export function registerRoutes(_router?: Router): void {
  OAuthHandlerRegistry.register("trae", traeOAuthHandler);
}
