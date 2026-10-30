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

const PRIVATE_KEY_PREFIX = "zed-rsa-pkcs1:";

function b64url(value: string | Buffer): string {
  return Buffer.from(value).toString("base64url");
}

function b64urlPadded(buf: Buffer): string {
  return buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_");
}

function fromB64url(value: string): string {
  return Buffer.from(String(value || ""), "base64url").toString("utf8");
}

export function encodeZedPrivateKeyVerifier(privateKeyPem: string): string {
  return `${PRIVATE_KEY_PREFIX}${b64url(privateKeyPem)}`;
}

export function decodeZedPrivateKeyVerifier(verifier: string): string {
  const value = String(verifier || "");
  if (!value.startsWith(PRIVATE_KEY_PREFIX)) {
    throw new Error("Missing Zed private key verifier; restart the login flow");
  }
  return fromB64url(value.slice(PRIVATE_KEY_PREFIX.length));
}

export function parseZedCallbackPayload(input: string): { userId: string; encryptedAccessToken: string } {
  const raw = String(input || "").trim();
  if (!raw) throw new Error("Missing Zed callback URL");

  let data: Record<string, string> = {};
  try {
    data = JSON.parse(raw);
  } catch {
    try {
      const query = raw.includes("?") ? raw.slice(raw.indexOf("?") + 1) : raw.replace(/^\?/, "");
      const url = new URL(`http://127.0.0.1/?${query}`);
      url.searchParams.forEach((v, k) => {
        data[k] = v;
      });
    } catch {
      throw new Error("Invalid Zed callback URL");
    }
  }

  const userId = data.user_id || data.userId;
  const encryptedAccessToken = data.access_token || data.accessToken || data.token;
  if (!userId || !encryptedAccessToken) {
    throw new Error("Zed callback must include user_id and access_token");
  }
  return { userId: String(userId), encryptedAccessToken: String(encryptedAccessToken) };
}

export function decryptZedAccessToken(encryptedAccessToken: string, privateKeyVerifier: string): string {
  const privateKey = decodeZedPrivateKeyVerifier(privateKeyVerifier);
  const encrypted = Buffer.from(String(encryptedAccessToken), "base64url");

  try {
    return crypto
      .privateDecrypt(
        { key: privateKey, padding: crypto.constants.RSA_PKCS1_OAEP_PADDING, oaepHash: "sha256" },
        encrypted
      )
      .toString("utf8");
  } catch (oaepError: any) {
    try {
      const text = crypto
        .privateDecrypt(
          { key: privateKey, padding: crypto.constants.RSA_PKCS1_PADDING },
          encrypted
        )
        .toString("utf8");
      if (text.includes("\uFFFD")) {
        throw new Error(`Failed to decrypt Zed access token: ${oaepError.message}`);
      }
      return text;
    } catch (err: any) {
      throw new Error(`Failed to decrypt Zed access token: ${oaepError.message || err.message}`);
    }
  }
}

export const zedOAuthHandler: ProviderOAuthHandler = {
  id: "zed",

  async authorize(params: OAuthAuthorizeParams): Promise<OAuthAuthorizeResult> {
    const { publicKey, privateKey } = crypto.generateKeyPairSync("rsa", {
      modulusLength: 2048,
      publicKeyEncoding: { type: "pkcs1", format: "der" },
      privateKeyEncoding: { type: "pkcs1", format: "pem" },
    });

    const nativeAppPort = Number(params.appPort) || Number(process.env.PORT) || 20127;
    const systemId = crypto.randomUUID();
    const publicKeyString = b64urlPadded(publicKey);
    const signInUrl = new URL("https://zed.dev/native_app_signin");
    signInUrl.searchParams.set("native_app_port", String(nativeAppPort));
    signInUrl.searchParams.set("native_app_public_key", publicKeyString);
    signInUrl.searchParams.set("system_id", systemId);

    return {
      authUrl: signInUrl.toString(),
      flowType: "authorization_code",
      redirectUri: params.redirectUri,
      state: params.state || systemId,
      codeVerifier: encodeZedPrivateKeyVerifier(privateKey),
      systemId,
    };
  },

  async exchange(params: OAuthExchangeParams): Promise<OAuthExchangeResult> {
    const { userId, encryptedAccessToken } = parseZedCallbackPayload(params.code);
    const verifier = params.codeVerifier || "";
    if (!verifier) {
      throw new Error("Missing Zed codeVerifier (RSA private key verifier)");
    }
    const accessToken = decryptZedAccessToken(encryptedAccessToken, verifier);
    const systemId = params.state || crypto.randomUUID();

    let accountName = "Zed User";
    let email: string | undefined;
    let organizationId = "";

    try {
      const userRes = await fetch("https://cloud.zed.dev/client/users/me", {
        headers: {
          Accept: "application/json",
          Authorization: `${userId} ${accessToken}`,
        },
      });
      if (userRes.ok) {
        const u: any = await userRes.json();
        const user = u?.user || u;
        accountName = user?.name || user?.github_login || user?.email || accountName;
        email = user?.email;
        const orgs = u?.organizations || [];
        const personalOrg = orgs.find((o: any) => o?.is_personal) || orgs[0];
        organizationId = personalOrg?.id || u?.default_organization_id || "";
      }
    } catch {}

    ProviderRepository.ensureProviderExists("zed");
    const accountId = `acc_${crypto.randomUUID().slice(0, 8)}`;
    ProviderRepository.addAccount({
      id: accountId,
      providerId: "zed",
      name: accountName,
      rawApiKey: accessToken,
      providerSpecificData: {
        authMethod: "oauth",
        userId,
        systemId,
        organizationId,
        email,
      },
    });

    return {
      success: true,
      account: {
        id: accountId,
        name: accountName,
        providerId: "zed",
      },
    };
  },
};

export function registerRoutes(_router?: Router): void {
  OAuthHandlerRegistry.register("zed", zedOAuthHandler);
}
