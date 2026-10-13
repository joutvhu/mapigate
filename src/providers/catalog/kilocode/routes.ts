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

const KILOCODE_INITIATE_URL = "https://api.kilo.ai/api/device-auth/codes";
const KILOCODE_POLL_URL = "https://api.kilo.ai/api/device-auth/codes";

export const kilocodeOAuthHandler: ProviderOAuthHandler = {
  id: "kilocode",

  async deviceCode(_params?: DeviceCodeParams): Promise<DeviceCodeResult> {
    const res = await fetch(KILOCODE_INITIATE_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`KiloCode device code failed (${res.status}): ${err}`);
    }

    const data: any = await res.json();
    return {
      device_code: data.code,
      user_code: data.code,
      verification_uri: data.verificationUrl,
      verification_uri_complete: data.verificationUrl,
      expires_in: data.expiresIn || 300,
      interval: 3,
    };
  },

  async poll(params: DevicePollParams): Promise<DevicePollResult> {
    const deviceCode = params.deviceCode || params.device_code;
    if (!deviceCode) return { ok: false, error: "Missing device_code" };

    const res = await fetch(`${KILOCODE_POLL_URL}/${deviceCode}`);
    if (res.status === 202) return { ok: false, error: "authorization_pending" };
    if (res.status === 403) return { ok: false, error: "access_denied" };
    if (res.status === 410) return { ok: false, error: "expired_token" };
    if (!res.ok) return { ok: false, error: `poll_failed_${res.status}` };

    const data: any = await res.json().catch(() => ({}));
    if (data.status === "approved" && data.token) {
      let orgId: string | undefined;
      try {
        const pRes = await fetch("https://api.kilo.ai/api/profile", {
          headers: { Authorization: `Bearer ${data.token}` },
        });
        if (pRes.ok) {
          const prof: any = await pRes.json();
          orgId = prof.organizations?.[0]?.id;
        }
      } catch {}

      ProviderRepository.ensureProviderExists("kilocode");
      const accountId = `acc_${crypto.randomUUID().slice(0, 8)}`;
      const accountName = data.userEmail || "KiloCode User";

      ProviderRepository.addAccount({
        id: accountId,
        providerId: "kilocode",
        name: accountName,
        rawApiKey: data.token,
        providerSpecificData: {
          authMethod: "device_code",
          email: data.userEmail,
          orgId,
        },
      });

      return {
        ok: true,
        success: true,
        account: {
          id: accountId,
          name: accountName,
          providerId: "kilocode",
        },
      };
    }

    return { ok: false, error: "authorization_pending" };
  },
};

export function registerRoutes(_router?: Router): void {
  OAuthHandlerRegistry.register("kilocode", kilocodeOAuthHandler);
}
