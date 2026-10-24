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
    const verifier = params.codeVerifier || params.extraData?.codeVerifier;
    if (!nonce || !verifier) {
      return { ok: false, error: "Missing nonce or codeVerifier" };
    }

    const region = params.region || params.extraData?.region || params.extraData?._region;
    const isCn = region === "cn" || (params.provider || "").toLowerCase().includes("cn");
    const pollUrl = isCn
      ? "https://openapi.qoder.com.cn/api/v1/deviceToken/poll"
      : "https://openapi.qoder.sh/api/v1/deviceToken/poll";
    const userinfoUrl = isCn
      ? "https://openapi.qoder.com.cn/api/v1/userinfo"
      : "https://openapi.qoder.sh/api/v1/userinfo";

    const res = await fetch(pollUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({ nonce, code_verifier: verifier }),
    });

    if (res.status === 202 || res.status === 404) {
      return { ok: false, error: "authorization_pending" };
    }

    if (!res.ok) {
      return { ok: false, error: `Poll failed (${res.status})` };
    }

    const data: any = await res.json().catch(() => ({}));
    if (data.status === "pending" || !data.access_token) {
      return { ok: false, error: "authorization_pending" };
    }

    const accessToken = data.access_token;
    const refreshToken = data.refresh_token || "";
    const userId = data.user_id || data.userId || "";
    const machineId = params.extraData?._qoderMachineId || crypto.randomUUID();

    let accountName = isCn ? "Qoder CN User" : "Qoder User";
    let email: string | undefined;

    try {
      const uRes = await fetch(userinfoUrl, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          Accept: "application/json",
        },
      });
      if (uRes.ok) {
        const u: any = await uRes.json();
        accountName = u.name || u.email || accountName;
        email = u.email;
      }
    } catch {}

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
        tokenExpiresAt: Date.now() + 30 * 86400 * 1000,
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
};

export function registerRoutes(_router?: Router): void {
  OAuthHandlerRegistry.register("qoder", qoderOAuthHandler);
  OAuthHandlerRegistry.register("qoder-cn", qoderOAuthHandler);
  OAuthHandlerRegistry.register("qdcn", qoderOAuthHandler);
}
