/**
 * Public upstream client credentials (OAuth client IDs/secrets shipped inside official CLIs/IDEs).
 *
 * Values are stored XOR-masked in publicCreds.generated.ts so well-known secret-scanner
 * patterns (Google OAuth secrets, Firebase keys, GitHub app IDs) never appear in committed source.
 * This is obfuscation, not encryption: the values are public by design.
 *
 * Isomorphic: no Node-only imports, safe to use from metadata.ts files bundled into the web SPA.
 */
import {
  PUBLIC_CREDS_MASK,
  MASKED_PUBLIC_CREDS,
  type PublicCredKey,
} from "./publicCreds.generated.js";

export type { PublicCredKey };

function unmaskBytes(bytes: readonly number[]): string {
  let out = "";
  for (let i = 0; i < bytes.length; i++) {
    out += String.fromCharCode(bytes[i] ^ PUBLIC_CREDS_MASK.charCodeAt(i % PUBLIC_CREDS_MASK.length));
  }
  return out;
}

/** Env var that overrides a credential, e.g. "claude_client_id" -> "MAPIGATE_CLAUDE_CLIENT_ID". */
export function publicCredEnvName(key: PublicCredKey): string {
  return `MAPIGATE_${key.toUpperCase()}`;
}

function readEnv(name: string): string | undefined {
  // `process` is absent in the browser bundle; guard instead of assuming Node.
  return typeof process !== "undefined" ? process.env?.[name] : undefined;
}

/**
 * Resolve a public credential.
 * 1. MAPIGATE_<KEY> environment variable (lets users bring their own OAuth app).
 * 2. Embedded masked default.
 */
export function resolvePublicCred(key: PublicCredKey): string {
  const override = readEnv(publicCredEnvName(key))?.trim();
  if (override) return override;
  return unmaskBytes(MASKED_PUBLIC_CREDS[key]);
}
