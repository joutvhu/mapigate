import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import * as nodeMachineIdPkg from "node-machine-id";
import { getDefaultDataDir } from "../../shared/constants/index.js";

const machineIdSync: () => string =
  (nodeMachineIdPkg as any).machineIdSync ||
  (nodeMachineIdPkg as any).default?.machineIdSync ||
  (() => "");

/**
 * Crypto Vault: Encrypts & decrypts API keys using AES-256-GCM
 * The key is derived from machine hardware ID + application salt
 */
export class CryptoVault {
  private static masterKey: Buffer | null = null;
  private static readonly SALT = "mapigate-vault-salt-v1";

  private static warnedFallback = false;
  private static warnedDecryptFailure = false;

  private static getMasterKey(): Buffer {
    if (!this.masterKey) {
      if (process.env.MAPIGATE_VAULT_KEY && process.env.MAPIGATE_VAULT_KEY.trim()) {
        this.masterKey = crypto.scryptSync(process.env.MAPIGATE_VAULT_KEY.trim(), this.SALT, 32);
        return this.masterKey;
      }

      let hwId: string | null = null;
      const dataDir = getDefaultDataDir();
      const machineIdFile = path.join(dataDir, "machine-id");

      try {
        if (fs.existsSync(machineIdFile)) {
          const savedId = fs.readFileSync(machineIdFile, "utf8").trim();
          if (savedId) {
            hwId = savedId;
          }
        }
      } catch {}

      if (!hwId) {
        try {
          hwId = machineIdSync();
        } catch (err: any) {
          if (!this.warnedFallback && process.env.NODE_ENV !== "test") {
            console.warn(
              `[CryptoVault] Warning: machineIdSync() unavailable (${err?.message || err}). Using fallback salt. Credentials may be invalid if environment changes.`
            );
            this.warnedFallback = true;
          }
          hwId = "fallback-hw-key-mapigate";
        }
        if (!hwId || typeof hwId !== "string" || !hwId.trim()) {
          hwId = "fallback-hw-key-mapigate";
        }

        try {
          if (!fs.existsSync(dataDir)) {
            fs.mkdirSync(dataDir, { recursive: true });
          }
          fs.writeFileSync(machineIdFile, hwId, { encoding: "utf8", mode: 0o600 });
        } catch {}
      }

      this.masterKey = crypto.scryptSync(hwId, this.SALT, 32);
    }
    return this.masterKey;
  }

  public static encrypt(plainText: string): string {
    if (!plainText) return "";
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv("aes-256-gcm", this.getMasterKey(), iv);
    
    let encrypted = cipher.update(plainText, "utf8", "hex");
    encrypted += cipher.final("hex");
    const authTag = cipher.getAuthTag().toString("hex");

    // Format: iv:authTag:encrypted
    return `${iv.toString("hex")}:${authTag}:${encrypted}`;
  }

  public static decrypt(cipherText: string): string {
    if (!cipherText || !cipherText.includes(":")) return "";
    const [ivHex, authTagHex, encryptedHex] = cipherText.split(":");
    
    if (!ivHex || !authTagHex || !encryptedHex) return "";

    try {
      const decipher = crypto.createDecipheriv(
        "aes-256-gcm",
        this.getMasterKey(),
        Buffer.from(ivHex, "hex")
      );
      decipher.setAuthTag(Buffer.from(authTagHex, "hex"));

      let decrypted = decipher.update(encryptedHex, "hex", "utf8");
      decrypted += decipher.final("utf8");
      return decrypted;
    } catch {
      if (!this.warnedDecryptFailure && process.env.NODE_ENV !== "test") {
        this.warnedDecryptFailure = true;
        console.warn(
          "[CryptoVault] Warning: Failed to decrypt credential with current machine key. Hardware ID may have changed or credentials were encrypted on a different machine. Re-enter your API key in Settings/Providers or configure MAPIGATE_VAULT_KEY."
        );
      }
      return "";
    }
  }
}
