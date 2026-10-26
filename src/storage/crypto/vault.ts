import crypto from "node:crypto";
import * as nodeMachineIdPkg from "node-machine-id";
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

  private static getMasterKey(): Buffer {
    if (!this.masterKey) {
      let hwId: string;
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
      return "";
    }
  }
}
