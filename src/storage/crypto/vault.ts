import crypto from "node:crypto";
import nodeMachineId from "node-machine-id";
const { machineIdSync } = nodeMachineId;

/**
 * Crypto Vault: Encrypts & decrypts API keys using AES-256-GCM
 * The key is derived from machine hardware ID + application salt
 */
export class CryptoVault {
  private static masterKey: Buffer | null = null;
  private static legacyMasterKey: Buffer | null = null;
  private static readonly SALT = "mapigate-vault-salt-v1";
  private static readonly LEGACY_SALT = "routen-vault-salt-v1";

  private static getMasterKey(): Buffer {
    if (!this.masterKey) {
      let hwId: string;
      try {
        hwId = machineIdSync();
      } catch {
        hwId = "fallback-hw-key-mapigate";
      }
      this.masterKey = crypto.scryptSync(hwId, this.SALT, 32);
    }
    return this.masterKey;
  }

  private static getLegacyMasterKey(): Buffer {
    if (!this.legacyMasterKey) {
      let hwId: string;
      try {
        hwId = machineIdSync();
      } catch {
        hwId = "fallback-hw-key-routen";
      }
      this.legacyMasterKey = crypto.scryptSync(hwId, this.LEGACY_SALT, 32);
    }
    return this.legacyMasterKey;
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

    // 1. Try decrypting with new Mapigate master key
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
      // 2. Fallback to legacy Routen master key for existing encrypted data
      try {
        const legacyDecipher = crypto.createDecipheriv(
          "aes-256-gcm",
          this.getLegacyMasterKey(),
          Buffer.from(ivHex, "hex")
        );
        legacyDecipher.setAuthTag(Buffer.from(authTagHex, "hex"));

        let decrypted = legacyDecipher.update(encryptedHex, "hex", "utf8");
        decrypted += legacyDecipher.final("utf8");
        return decrypted;
      } catch {
        return "";
      }
    }
  }
}
