import crypto from "node:crypto";
import * as nodeMachineId from "node-machine-id";
const machineIdSync: () => string =
  (nodeMachineId as any).machineIdSync ||
  (nodeMachineId as any).default?.machineIdSync ||
  (() => "");

export const ENCRYPT_ALGO = "aes-256-gcm";
export const NINE_ROUTER_SALT = "9router-mitm-pwd";

/**
 * Derives the 32-byte AES-256 key matching 9router's derivation algorithm.
 * Uses machine hardware ID + 9router-mitm-pwd salt.
 */
export function derive9routerKey(machineIdOverride?: string): Buffer {
  let raw = "";
  if (machineIdOverride !== undefined) {
    raw = machineIdOverride;
  } else {
    try {
      raw = machineIdSync() || "";
    } catch {
      raw = "";
    }
  }
  return crypto.createHash("sha256").update(raw + NINE_ROUTER_SALT).digest();
}

/**
 * Encrypts a string using 9router's AES-256-GCM format: ivHex:tagHex:dataHex.
 * Useful for testing and compatibility.
 */
export function encrypt9routerValue(plainText: string, machineIdOverride?: string): string {
  if (!plainText) return "";
  const key = derive9routerKey(machineIdOverride);
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ENCRYPT_ALGO, key, iv);
  const encrypted = Buffer.concat([cipher.update(plainText, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString("hex")}:${tag.toString("hex")}:${encrypted.toString("hex")}`;
}

/**
 * Decrypts a potential 9router-encrypted secret.
 * If the input does not match the 3-part hex format (iv:tag:data), or if decryption fails,
 * it returns the original value untouched (fail-open invariant).
 */
export function decrypt9routerValue(value: string, machineIdOverride?: string): string {
  if (!value || typeof value !== "string") return "";
  
  const trimmed = value.trim();
  const parts = trimmed.split(":");

  // 9router encryption format has exactly 3 parts: iv (12 bytes = 24 hex chars),
  // tag (16 bytes = 32 hex chars), and encrypted payload (hex)
  if (
    parts.length === 3 &&
    /^[0-9a-fA-F]{24}$/.test(parts[0]) &&
    /^[0-9a-fA-F]{32}$/.test(parts[1]) &&
    /^[0-9a-fA-F]+$/.test(parts[2])
  ) {
    try {
      const [ivHex, tagHex, dataHex] = parts;
      const key = derive9routerKey(machineIdOverride);
      const decipher = crypto.createDecipheriv(ENCRYPT_ALGO, key, Buffer.from(ivHex, "hex"));
      decipher.setAuthTag(Buffer.from(tagHex, "hex"));
      const decrypted = Buffer.concat([
        decipher.update(Buffer.from(dataHex, "hex")),
        decipher.final(),
      ]).toString("utf8");
      return decrypted;
    } catch {
      // Fail-open: return original if decryption failed
      return trimmed;
    }
  }

  // Already plain text
  return trimmed;
}

export interface NormalizedCredentials {
  name: string;
  rawApiKey: string;
  providerSpecificData: Record<string, any>;
}

/**
 * Normalizes 9router connection row and nested JSON data into Mapigate's expected credential shape.
 * Handles both plain API keys and OAuth tokens (Antigravity, GitHub Copilot, etc.).
 */
export function normalize9routerConnection(
  row: {
    id: string;
    provider: string;
    authType: string;
    name?: string | null;
    email?: string | null;
    priority?: number | null;
    isActive?: number | boolean | null;
    data: string | Record<string, any>;
    cachedQuotas?: string | Record<string, any> | null;
    createdAt?: string | null;
    updatedAt?: string | null;
  },
  machineIdOverride?: string
): NormalizedCredentials {
  let dataObj: Record<string, any> = {};
  if (typeof row.data === "string") {
    try {
      dataObj = JSON.parse(row.data);
    } catch {
      dataObj = {};
    }
  } else if (typeof row.data === "object" && row.data !== null) {
    dataObj = { ...row.data };
  }

  let quotasObj: Record<string, any> | null = null;
  if (typeof row.cachedQuotas === "string") {
    try {
      quotasObj = JSON.parse(row.cachedQuotas);
    } catch {
      quotasObj = null;
    }
  } else if (typeof row.cachedQuotas === "object") {
    quotasObj = row.cachedQuotas;
  }

  const isOAuth = row.authType === "oauth" || Boolean(dataObj.accessToken || dataObj.refreshToken);

  // Derive account display name
  const name =
    row.name ||
    row.email ||
    dataObj.email ||
    dataObj.displayName ||
    dataObj.providerSpecificData?.githubLogin ||
    dataObj.providerSpecificData?.email ||
    `${row.provider} Account`;

  const providerSpecificData: Record<string, any> = {
    ...(dataObj.providerSpecificData || {}),
  };

  if (quotasObj) {
    providerSpecificData.cachedQuotas = quotasObj;
  }

  if (row.email && !providerSpecificData.email) {
    providerSpecificData.email = row.email;
  }

  let rawApiKey = "";

  if (isOAuth) {
    const rawAccessToken = dataObj.accessToken ? decrypt9routerValue(String(dataObj.accessToken), machineIdOverride) : "";
    const rawRefreshToken = dataObj.refreshToken ? decrypt9routerValue(String(dataObj.refreshToken), machineIdOverride) : "";

    const oauthPayload: Record<string, any> = {
      accessToken: rawAccessToken,
      refreshToken: rawRefreshToken,
      expiresAt: dataObj.expiresAt || null,
      email: row.email || dataObj.email || null,
      projectId: dataObj.projectId || null,
      tokenType: dataObj.tokenType || "Bearer",
    };

    // Keep top-level OAuth helper fields in providerSpecificData as well
    if (rawRefreshToken && !providerSpecificData.refreshToken) {
      providerSpecificData.refreshToken = rawRefreshToken;
    }
    if (dataObj.expiresAt && !providerSpecificData.expiresAt) {
      providerSpecificData.expiresAt = dataObj.expiresAt;
    }
    if (dataObj.projectId && !providerSpecificData.projectId) {
      providerSpecificData.projectId = dataObj.projectId;
    }

    rawApiKey = JSON.stringify(oauthPayload);
  } else {
    // API Key flow
    const rawKey = dataObj.apiKey
      ? decrypt9routerValue(String(dataObj.apiKey), machineIdOverride)
      : (dataObj.token ? decrypt9routerValue(String(dataObj.token), machineIdOverride) : "");
    rawApiKey = rawKey;
  }

  return {
    name,
    rawApiKey,
    providerSpecificData,
  };
}
