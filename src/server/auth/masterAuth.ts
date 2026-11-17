import crypto from "node:crypto";
import { promisify } from "node:util";
import { SettingsRepository } from "../../storage/repositories/settingsRepo.js";
import { CryptoVault } from "../../storage/crypto/vault.js";

const scryptAsync = promisify(crypto.scrypt);
const DEFAULT_SESSION_DURATION_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

interface SessionTokenPayload {
  type: "master_session";
  iat: number;
  exp: number;
  pwdUpdatedAt: number;
  pwdSig: string;
  nonce: string;
}

function computePasswordSig(hash?: string): string {
  return crypto
    .createHmac("sha256", hash || "")
    .update("master_session")
    .digest("hex")
    .slice(0, 16);
}

export class MasterAuth {
  /**
   * Check if master password protection is currently enabled.
   */
  public static isPasswordSet(): boolean {
    const config = SettingsRepository.getMasterPasswordConfig();
    return Boolean(config.enabled && config.hash && config.salt);
  }

  /**
   * Cryptographically hash a plaintext password with a random 16-byte salt using scrypt asynchronously.
   */
  public static async hashPassword(
    password: string,
    saltHex?: string
  ): Promise<{ hash: string; salt: string; algorithm: string }> {
    const salt = saltHex ? Buffer.from(saltHex, "hex") : crypto.randomBytes(16);
    const hash = (await scryptAsync(password, salt, 64)) as Buffer;
    return {
      hash: hash.toString("hex"),
      salt: salt.toString("hex"),
      algorithm: "scrypt",
    };
  }

  /**
   * Verify password using timingSafeEqual to prevent timing attacks.
   */
  public static async verifyPassword(password: string): Promise<boolean> {
    if (!password || typeof password !== "string") return false;
    const config = SettingsRepository.getMasterPasswordConfig();
    if (!config.enabled || !config.hash || !config.salt) return false;

    try {
      const derived = (await scryptAsync(password, Buffer.from(config.salt, "hex"), 64)) as Buffer;
      const expected = Buffer.from(config.hash, "hex");
      if (derived.length !== expected.length) {
        return false;
      }
      return crypto.timingSafeEqual(derived, expected);
    } catch {
      return false;
    }
  }

  /**
   * Generate an encrypted stateless session token tied to the current hardware vault
   * and the password's updatedAt timestamp.
   */
  public static createSessionToken(durationMs: number = DEFAULT_SESSION_DURATION_MS): string {
    const config = SettingsRepository.getMasterPasswordConfig();
    if (!config.enabled) {
      throw new Error("Master password is not configured");
    }

    const now = Date.now();
    const iat = config.logoutAt && now <= config.logoutAt ? config.logoutAt + 1 : now;
    const payload: SessionTokenPayload = {
      type: "master_session",
      iat,
      exp: now + durationMs,
      pwdUpdatedAt: config.updatedAt || 0,
      pwdSig: computePasswordSig(config.hash),
      nonce: crypto.randomBytes(8).toString("hex"),
    };

    return CryptoVault.encrypt(JSON.stringify(payload));
  }

  /**
   * Verify a session token. Validates:
   * 1. Decryption and tamper-proofing (AES-256-GCM auth tag).
   * 2. Expiration timestamp.
   * 3. Current password version & hash signature (instant invalidation if password changed or cleared).
   * 4. Session revocation timestamp (logoutAt).
   */
  public static verifySessionToken(token: string): boolean {
    if (!token || typeof token !== "string") return false;

    const config = SettingsRepository.getMasterPasswordConfig();
    // If master password is not set, any access passes
    if (!config.enabled || !config.hash) return true;

    try {
      const decrypted = CryptoVault.decrypt(token);
      if (!decrypted) return false;

      const payload = JSON.parse(decrypted) as SessionTokenPayload;
      if (payload.type !== "master_session") return false;
      if (typeof payload.exp !== "number" || payload.exp <= Date.now()) return false;
      if (typeof payload.pwdUpdatedAt !== "number" || payload.pwdUpdatedAt !== config.updatedAt) return false;
      const expectedSig = computePasswordSig(config.hash);
      if (payload.pwdSig !== expectedSig) return false;
      if (config.logoutAt && typeof payload.iat === "number" && payload.iat <= config.logoutAt) return false;

      return true;
    } catch {
      return false;
    }
  }

  /**
   * Revoke all active session tokens issued at or before the current timestamp.
   */
  public static revokeAllSessions(): void {
    const config = SettingsRepository.getMasterPasswordConfig();
    if (!config.enabled) return;
    const now = Date.now();
    SettingsRepository.setMasterPasswordConfig({
      ...config,
      logoutAt: config.logoutAt && now <= config.logoutAt ? config.logoutAt + 1 : now,
    });
  }

  /**
   * Set or initialize master password.
   */
  public static async setPassword(newPassword: string): Promise<void> {
    if (!newPassword || typeof newPassword !== "string" || newPassword.length < 4) {
      throw new Error("Master password must be at least 4 characters long");
    }

    const { hash, salt, algorithm } = await this.hashPassword(newPassword);
    SettingsRepository.setMasterPasswordConfig({
      enabled: true,
      hash,
      salt,
      algorithm,
      updatedAt: Date.now(),
    });
  }

  /**
   * Change existing master password. Requires validating current password.
   */
  public static async changePassword(currentPassword: string, newPassword: string): Promise<boolean> {
    if (!(await this.verifyPassword(currentPassword))) {
      return false;
    }
    await this.setPassword(newPassword);
    return true;
  }

  /**
   * Remove/disable master password. Requires validating current password.
   */
  public static async removePassword(currentPassword: string): Promise<boolean> {
    if (!(await this.verifyPassword(currentPassword))) {
      return false;
    }
    SettingsRepository.clearMasterPassword();
    return true;
  }
}
