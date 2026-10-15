import crypto from "node:crypto";
import { SettingsRepository } from "../../storage/repositories/settingsRepo.js";
import { CryptoVault } from "../../storage/crypto/vault.js";

const DEFAULT_SESSION_DURATION_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

interface SessionTokenPayload {
  type: "master_session";
  exp: number;
  pwdUpdatedAt: number;
  nonce: string;
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
   * Cryptographically hash a plaintext password with a random 16-byte salt using scrypt.
   */
  public static hashPassword(password: string, saltHex?: string): { hash: string; salt: string; algorithm: string } {
    const salt = saltHex ? Buffer.from(saltHex, "hex") : crypto.randomBytes(16);
    const hash = crypto.scryptSync(password, salt, 64);
    return {
      hash: hash.toString("hex"),
      salt: salt.toString("hex"),
      algorithm: "scrypt",
    };
  }

  /**
   * Verify password using timingSafeEqual to prevent timing attacks.
   */
  public static verifyPassword(password: string): boolean {
    if (!password || typeof password !== "string") return false;
    const config = SettingsRepository.getMasterPasswordConfig();
    if (!config.enabled || !config.hash || !config.salt) return false;

    try {
      const derived = crypto.scryptSync(password, Buffer.from(config.salt, "hex"), 64);
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

    const payload: SessionTokenPayload = {
      type: "master_session",
      exp: Date.now() + durationMs,
      pwdUpdatedAt: config.updatedAt || 0,
      nonce: crypto.randomBytes(8).toString("hex"),
    };

    return CryptoVault.encrypt(JSON.stringify(payload));
  }

  /**
   * Verify a session token. Validates:
   * 1. Decryption and tamper-proofing (AES-256-GCM auth tag).
   * 2. Expiration timestamp.
   * 3. Current password version (instant invalidation if password changed or cleared).
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

      return true;
    } catch {
      return false;
    }
  }

  /**
   * Set or initialize master password.
   */
  public static setPassword(newPassword: string): void {
    if (!newPassword || typeof newPassword !== "string" || newPassword.length < 4) {
      throw new Error("Master password must be at least 4 characters long");
    }

    const { hash, salt, algorithm } = this.hashPassword(newPassword);
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
  public static changePassword(currentPassword: string, newPassword: string): boolean {
    if (!this.verifyPassword(currentPassword)) {
      return false;
    }
    this.setPassword(newPassword);
    return true;
  }

  /**
   * Remove/disable master password. Requires validating current password.
   */
  public static removePassword(currentPassword: string): boolean {
    if (!this.verifyPassword(currentPassword)) {
      return false;
    }
    SettingsRepository.clearMasterPassword();
    return true;
  }
}
