export const DEFAULT_ALLOWED_HOSTS = "10.*, 172.16-31.*, 192.168.*, 169.254.*, *.local";

export function isHostPatternMatch(pattern: string, hostname: string): boolean {
  const p = pattern.trim().toLowerCase();
  const h = hostname.trim().toLowerCase();
  if (!p || !h) return false;
  if (p === "*" || p === h) return true;

  // Handle special private ranges like 172.16-31.*
  if (p === "172.16-31.*" || p === "172.16-31.*.*") {
    return /^172\.(1[6-9]|2\d|3[0-1])\.\d{1,3}\.\d{1,3}$/.test(h);
  }

  // Handle IP prefix wildcards like 10.*, 192.168.*, 169.254.*
  const ipPrefixMatch = p.match(/^(\d{1,3}(?:\.\d{1,3})*)\.\*+$/);
  if (ipPrefixMatch) {
    const prefixParts = ipPrefixMatch[1].split(".");
    const hostParts = h.split(".");
    if (hostParts.length !== 4) return false;
    for (let i = 0; i < prefixParts.length; i++) {
      if (hostParts[i] !== prefixParts[i]) return false;
    }
    return hostParts.every((part) => {
      const n = Number(part);
      return /^\d{1,3}$/.test(part) && n >= 0 && n <= 255;
    });
  }

  // Handle wildcard like *.local
  if (p.includes("*")) {
    const escaped = p
      .replace(/[.+?^${}()|[\]\\]/g, "\\$&")
      .replace(/\*/g, ".*");
    return new RegExp(`^${escaped}$`).test(h);
  }

  return false;
}

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
