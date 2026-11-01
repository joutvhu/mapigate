export const SENSITIVE_KEY_NAMES = new Set([
  "refreshtoken",
  "secretaccesskey",
  "clientsecret",
  "privatekey",
  "password",
  "secretkey",
  "accesstoken",
  "githubaccesstoken",
  "copilottoken",
  "zcodejwttoken",
  "sessiontoken",
  "idtoken",
  "cookie",
  "jwt",
  "token",
  "apikey",
  "rawapikey",
  "secret",
]);

export function isSensitiveKey(key: string): boolean {
  if (!key || typeof key !== "string") return false;
  const normalized = key.toLowerCase().replace(/[-_]/g, "");
  if (SENSITIVE_KEY_NAMES.has(normalized)) return true;
  if (
    normalized.endsWith("token") ||
    normalized.endsWith("secret") ||
    normalized.endsWith("password") ||
    normalized.endsWith("privatekey") ||
    normalized.endsWith("apikey")
  ) {
    return true;
  }
  return false;
}

export function maskSensitivePsd(psd?: Record<string, any> | null): Record<string, any> | undefined {
  if (!psd || typeof psd !== "object") return undefined;

  const sanitized: Record<string, any> = {};
  for (const [k, v] of Object.entries(psd)) {
    if (typeof v === "string" && v.length > 0 && isSensitiveKey(k)) {
      sanitized[k] = "••••••••";
    } else if (v && typeof v === "object" && !Array.isArray(v)) {
      sanitized[k] = maskSensitivePsd(v);
    } else {
      sanitized[k] = v;
    }
  }
  return sanitized;
}

export function sanitizePsdForExport(psd?: Record<string, any> | null): Record<string, any> | undefined {
  if (!psd || typeof psd !== "object") return undefined;

  const sanitized: Record<string, any> = {};
  for (const [k, v] of Object.entries(psd)) {
    if (isSensitiveKey(k)) {
      continue;
    }
    if (v && typeof v === "object" && !Array.isArray(v)) {
      const nested = sanitizePsdForExport(v);
      if (nested && Object.keys(nested).length > 0) {
        sanitized[k] = nested;
      }
    } else {
      sanitized[k] = v;
    }
  }
  return Object.keys(sanitized).length > 0 ? sanitized : undefined;
}
