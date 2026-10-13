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

const WINDSURF_CLIENT_ID = "REDACTED_WINDSURF_CLIENT_ID";
const WINDSURF_REGISTER_URL = "https://register.windsurf.com/exa.seat_management_pb.SeatManagementService/RegisterUser";

function parseWindsurfCallback(raw: string): { firebaseIdToken: string } {
  const text = String(raw || "").trim();
  let queryStr = text;
  if (text.includes("?")) queryStr = text.slice(text.indexOf("?") + 1);
  if (text.startsWith("#")) queryStr = text.slice(1);
  const params = Object.fromEntries(new URLSearchParams(queryStr));
  const err = params["error"];
  if (err) {
    throw new Error(`Windsurf auth failed: ${err} (${params["error_description"] || ""})`);
  }
  const token = params["access_token"] || params["token"];
  if (!token) throw new Error("Windsurf callback missing access_token");
  return { firebaseIdToken: token };
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

export const windsurfOAuthHandler: ProviderOAuthHandler = {
  id: "windsurf",

  async authorize(params: OAuthAuthorizeParams): Promise<OAuthAuthorizeResult> {
    const p = new URLSearchParams({
      response_type: "token",
      client_id: WINDSURF_CLIENT_ID,
      redirect_uri: params.redirectUri,
      state: params.state || crypto.randomUUID(),
      prompt: "login",
      redirect_parameters_type: "query",
      workflow: "onboarding",
    });

    return {
      authUrl: `https://www.windsurf.com/windsurf/signin?${p.toString()}`,
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

    if (rawCode.startsWith("sk-ws-")) {
      apiKey = rawCode;
    } else if (rawCode.includes("?") || rawCode.includes("access_token=")) {
      const { firebaseIdToken } = parseWindsurfCallback(rawCode);
      const reg = await registerWindsurfUser(firebaseIdToken);
      apiKey = reg.apiKey;
      apiServerUrl = reg.apiServerUrl;
      accountName = reg.name || accountName;
    } else {
      // Raw firebase token
      const reg = await registerWindsurfUser(rawCode);
      apiKey = reg.apiKey;
      apiServerUrl = reg.apiServerUrl;
      accountName = reg.name || accountName;
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
}
