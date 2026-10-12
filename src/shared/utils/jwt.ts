/**
 * Safely decodes and parses the JSON payload segment of a JWT token.
 * Supports standard Base64 and Base64URL encodings with automatic padding restoration.
 * Returns null if token is malformed, has fewer than 2 segments, or contains invalid JSON.
 */
export function parseJwtPayload<T = any>(token: string): T | null {
  try {
    if (!token || typeof token !== "string") {
      return null;
    }
    const parts = token.split(".");
    if (parts.length < 2) {
      return null;
    }
    let base64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    while (base64.length % 4 !== 0) {
      base64 += "=";
    }
    const json = Buffer.from(base64, "base64").toString("utf8");
    return JSON.parse(json) as T;
  } catch {
    return null;
  }
}
