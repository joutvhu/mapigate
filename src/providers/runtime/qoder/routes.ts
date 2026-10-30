import crypto from "node:crypto";
import type { Router } from "express";
import { OAuthHandlerRegistry } from "../../core/oauthRegistry.js";
import { ProviderRepository } from "../../../storage/repositories/providerRepo.js";
import type {
  ProviderOAuthHandler,
  DeviceCodeParams,
  DeviceCodeResult,
  DevicePollParams,
  DevicePollResult,
  OAuthExchangeParams,
  OAuthExchangeResult,
} from "../../core/oauthTypes.js";

function base64Url(buf: Buffer): string {
  return buf.toString("base64").replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}

export const qoderOAuthHandler: ProviderOAuthHandler = {
  id: "qoder",

  async deviceCode(params?: DeviceCodeParams): Promise<DeviceCodeResult> {
    const region = params?.region || params?.extraData?.region;
    const isCn = region === "cn" || (params?.provider || "").toLowerCase().includes("cn");
    const loginBase = isCn ? "https://qoder.com.cn/device/selectAccounts" : "https://qoder.com/device/selectAccounts";
    const verifier = base64Url(crypto.randomBytes(32));
    const challenge = base64Url(crypto.createHash("sha256").update(verifier).digest());
    const nonce = crypto.randomUUID();
    const machineId = crypto.randomUUID();

    const q = new URLSearchParams({
      challenge,
      challenge_method: "S256",
      machine_id: machineId,
      nonce,
    });

    return {
      device_code: nonce,
      user_code: nonce.slice(0, 8).toUpperCase(),
      verification_uri: loginBase,
      verification_uri_complete: `${loginBase}?${q.toString()}`,
      expires_in: 300,
      interval: 2,
      codeVerifier: verifier,
      _qoderNonce: nonce,
      _qoderMachineId: machineId,
      _region: isCn ? "cn" : "intl",
    };
  },

  async poll(params: DevicePollParams): Promise<DevicePollResult> {
    const nonce = params.deviceCode || params.device_code || params.extraData?._qoderNonce;
    const verifier = params.codeVerifier || params.extraData?.codeVerifier || params.extraData?._qoderVerifier;
    if (!nonce || !verifier) {
      return { ok: false, error: "Missing nonce or codeVerifier" };
    }

    const region = params.region || params.extraData?.region || params.extraData?._region;
    const isCn = region === "cn" || (params.provider || "").toLowerCase().includes("cn");
    const pollBase = isCn
      ? "https://openapi.qoder.com.cn/api/v1/deviceToken/poll"
      : "https://openapi.qoder.sh/api/v1/deviceToken/poll";
    const userinfoUrl = isCn
      ? "https://openapi.qoder.com.cn/api/v1/userinfo"
      : "https://openapi.qoder.sh/api/v1/userinfo";

    const pollUrl = `${pollBase}?nonce=${encodeURIComponent(nonce)}&verifier=${encodeURIComponent(verifier)}&challenge_method=S256`;

    const res = await fetch(pollUrl, {
      method: "GET",
      headers: {
        Accept: "application/json",
        "User-Agent": "Go-http-client/2.0",
      },
    });

    if (res.status === 202 || res.status === 404) {
      return { ok: false, error: "authorization_pending" };
    }

    if (!res.ok) {
      const errBody: any = await res.json().catch(() => null);
      const msg = errBody?.errorMessage || errBody?.message;
      return { ok: false, error: msg ? `Poll failed: ${msg}` : `Poll failed (${res.status})` };
    }

    const data: any = await res.json().catch(() => ({}));
    if (data.status === "pending") {
      return { ok: false, error: "authorization_pending" };
    }

    const accessToken = data.token || data.access_token;
    if (!accessToken) {
      return { ok: false, error: "authorization_pending" };
    }

    const refreshToken = data.refresh_token || "";
    let userId = data.user_id || data.userId || "";
    const machineId = params.extraData?._qoderMachineId || crypto.randomUUID();

    let accountName = isCn ? "Qoder CN User" : "Qoder User";
    let email: string | undefined;

    try {
      const uRes = await fetch(userinfoUrl, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          Accept: "application/json",
          "User-Agent": "Go-http-client/2.0",
        },
      });
      if (uRes.ok) {
        const u: any = await uRes.json();
        accountName = (u.name || u.username || u.email || accountName).trim();
        email = u.email ? String(u.email).trim() : undefined;
        if (!userId && (u.id || u.user_id)) {
          userId = u.id || u.user_id;
        }
      }
    } catch {}

    let tokenExpiresAt = Date.now() + 30 * 86400 * 1000;
    if (typeof data.expires_at === "number") {
      tokenExpiresAt = data.expires_at;
    } else if (typeof data.expires_in === "number") {
      tokenExpiresAt = Date.now() + data.expires_in * 1000;
    }

    ProviderRepository.ensureProviderExists("qoder");
    const accountId = `acc_${crypto.randomUUID().slice(0, 8)}`;

    ProviderRepository.addAccount({
      id: accountId,
      providerId: "qoder",
      name: accountName,
      rawApiKey: accessToken,
      providerSpecificData: {
        authMethod: "device",
        userId,
        machineId,
        email,
        refreshToken,
        tokenExpiresAt,
        region: isCn ? "cn" : "intl",
      },
    });

    return {
      ok: true,
      success: true,
      account: {
        id: accountId,
        name: accountName,
        providerId: "qoder",
      },
    };
  },

  async exchange(params: OAuthExchangeParams): Promise<OAuthExchangeResult> {
    const raw = String(params.code || "").trim();
    let token = raw;
    let userId = "";
    let refreshToken = "";

    try {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === "object") {
        token = parsed.token || parsed.access_token || parsed.apiKey || token;
        userId = parsed.user_id || parsed.userId || "";
        refreshToken = parsed.refresh_token || "";
      }
    } catch {}

    if (!token) {
      return { success: false, error: "Missing Qoder token" };
    }

    const region = params.region;
    const isCn = region === "cn" || (params.provider || "").toLowerCase().includes("cn");
    const userinfoUrl = isCn
      ? "https://openapi.qoder.com.cn/api/v1/userinfo"
      : "https://openapi.qoder.sh/api/v1/userinfo";

    let accountName = isCn ? "Qoder CN User" : "Qoder User";
    let email: string | undefined;

    try {
      const uRes = await fetch(userinfoUrl, {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/json",
          "User-Agent": "Go-http-client/2.0",
        },
      });
      if (uRes.ok) {
        const u: any = await uRes.json();
        accountName = (u.name || u.username || u.email || accountName).trim();
        email = u.email ? String(u.email).trim() : undefined;
        if (!userId && (u.id || u.user_id)) {
          userId = u.id || u.user_id;
        }
      }
    } catch {}

    ProviderRepository.ensureProviderExists("qoder");
    const accountId = `acc_${crypto.randomUUID().slice(0, 8)}`;

    ProviderRepository.addAccount({
      id: accountId,
      providerId: "qoder",
      name: accountName,
      rawApiKey: token,
      providerSpecificData: {
        authMethod: "manual",
        userId,
        machineId: crypto.randomUUID(),
        email,
        refreshToken,
        tokenExpiresAt: Date.now() + 30 * 86400 * 1000,
        region: isCn ? "cn" : "intl",
      },
    });

    return {
      success: true,
      account: {
        id: accountId,
        name: accountName,
        providerId: "qoder",
      },
    };
  },
};

export function registerRoutes(_router?: Router): void {
  OAuthHandlerRegistry.register("qoder", qoderOAuthHandler);
  OAuthHandlerRegistry.register("qoder-cn", qoderOAuthHandler);
  OAuthHandlerRegistry.register("qdcn", qoderOAuthHandler);
}
