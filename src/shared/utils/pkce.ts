import crypto from "node:crypto";

export interface PKCEResult {
  codeVerifier: string;
  codeChallenge: string;
  state: string;
}

/**
 * Generates a cryptographically random Base64URL-encoded code verifier for PKCE.
 */
export function generateCodeVerifier(bytes = 32): string {
  return crypto.randomBytes(bytes).toString("base64url");
}

/**
 * Computes the SHA-256 code challenge from a code verifier for PKCE.
 */
export function generateCodeChallenge(verifier: string): string {
  return crypto.createHash("sha256").update(verifier).digest("base64url");
}

/**
 * Generates a random Base64URL state string for OAuth CSRF protection.
 */
export function generateState(): string {
  return crypto.randomBytes(32).toString("base64url");
}

/**
 * Generates a complete PKCE parameter bundle (codeVerifier, codeChallenge, state).
 */
export function generatePKCE(bytes = 32): PKCEResult {
  const codeVerifier = generateCodeVerifier(bytes);
  const codeChallenge = generateCodeChallenge(codeVerifier);
  const state = generateState();
  return { codeVerifier, codeChallenge, state };
}
