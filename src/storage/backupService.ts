import crypto from "node:crypto";
import { ProviderRepository } from "./repositories/providerRepo.js";
import { ComboRepository } from "./repositories/comboRepo.js";
import { ToolMappingRepository } from "./repositories/toolMappingRepo.js";
import { ModelRepository } from "./repositories/modelRepo.js";
import { SettingsRepository } from "./repositories/settingsRepo.js";
import { APP_NAME, APP_VERSION } from "../shared/constants/index.js";
import { sanitizePsdForExport } from "../shared/utils/security.js";
import type { ProviderConfig, ComboRecord } from "../shared/types/index.js";

export interface BackupExportOptions {
  includeCredentials?: boolean;
  password?: string;
}

export interface BackupImportOptions {
  password?: string;
  mode?: "merge" | "overwrite";
}

export interface BackupPayload {
  version: 1;
  app: string;
  appVersion: string;
  exportedAt: string;
  encrypted: boolean;
  includesCredentials: boolean;
  salt?: string;
  checkToken?: string;
  data: {
    providers: Array<{
      id: string;
      name: string;
      type?: string;
      baseUrl?: string;
      format?: string;
      customHeaders?: Record<string, string>;
      proxyUrl?: string;
      thinkingMode?: string;
      strategy?: string | null;
      stickyLimit?: number | null;
      isActive?: boolean;
      accounts?: Array<{
        id: string;
        name: string;
        apiKey?: string; // encrypted or plaintext
        isActive?: boolean;
        sortOrder?: number;
        providerSpecificData?: Record<string, any> | string;
      }>;
    }>;
    combos: Array<{
      id?: string;
      name: string;
      strategy?: string;
      models: string[];
      isActive?: boolean;
    }>;
    mappings: Array<{
      toolId: string;
      sourceModel: string;
      targetModel: string;
    }>;
    modelRules: Array<{
      id?: string;
      alias: string;
      targetModel: string;
      targetProviderId: string;
      isDefault?: boolean;
      fallbackRules?: string[];
    }>;
    settings?: {
      endpoint?: Record<string, any>;
      tokenSaver?: Record<string, any>;
      capacityAdapter?: Record<string, any>;
    };
  };
}

export interface BackupImportResult {
  success: boolean;
  restored: {
    providersCount: number;
    accountsCount: number;
    combosCount: number;
    mappingsCount: number;
    rulesCount: number;
  };
  warnings?: string[];
}

function deriveKey(password: string, salt: Buffer): Buffer {
  return crypto.scryptSync(password, salt, 32);
}

function encryptWithPassword(plainText: string, key: Buffer): string {
  if (!plainText) return "";
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  let encrypted = cipher.update(plainText, "utf8", "hex");
  encrypted += cipher.final("hex");
  const authTag = cipher.getAuthTag().toString("hex");
  return `${iv.toString("hex")}:${authTag}:${encrypted}`;
}

function decryptWithPassword(cipherText: string, key: Buffer): string {
  if (!cipherText || !cipherText.includes(":")) return "";
  const [ivHex, authTagHex, encryptedHex] = cipherText.split(":");
  if (!ivHex || !authTagHex || !encryptedHex) return "";
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, Buffer.from(ivHex, "hex"));
  decipher.setAuthTag(Buffer.from(authTagHex, "hex"));
  let decrypted = decipher.update(encryptedHex, "hex", "utf8");
  decrypted += decipher.final("utf8");
  return decrypted;
}

export class BackupService {
  /**
   * Exports full gateway configuration
   */
  public static async exportConfig(options: BackupExportOptions = {}): Promise<BackupPayload> {
    const includeCredentials = Boolean(options.includeCredentials);
    const password = options.password?.trim() || "";
    const isEncrypted = includeCredentials && Boolean(password);

    let exportKey: Buffer | null = null;
    let saltHex: string | undefined;
    let checkToken: string | undefined;

    if (isEncrypted) {
      const salt = crypto.randomBytes(16);
      saltHex = salt.toString("hex");
      exportKey = deriveKey(password, salt);
      checkToken = encryptWithPassword("mapigate-backup-valid", exportKey);
    }

    const allProviders = ProviderRepository.getAllProviders();
    const allAccounts = ProviderRepository.getAllAccounts();

    // Map accounts to providers
    const accountsByProv = new Map<string, typeof allAccounts>();
    for (const acc of allAccounts) {
      const list = accountsByProv.get(acc.providerId) || [];
      list.push(acc);
      accountsByProv.set(acc.providerId, list);
    }

    const exportedProviders = allProviders.map((p) => {
      const pAccounts = accountsByProv.get(p.id) || [];
      return {
        id: p.id,
        name: p.name,
        type: (p as any).type,
        baseUrl: p.baseUrl,
        format: p.format,
        customHeaders: p.customHeaders,
        proxyUrl: p.proxyUrl,
        thinkingMode: p.thinkingMode,
        strategy: p.strategy,
        stickyLimit: p.stickyLimit,
        isActive: p.isActive,
        accounts: pAccounts.map((a) => {
          let exportedKey = "";
          let exportedPsd: any = undefined;
          if (includeCredentials) {
            if (a.rawApiKey) {
              exportedKey = exportKey ? encryptWithPassword(a.rawApiKey, exportKey) : a.rawApiKey;
            }
            if (a.providerSpecificData) {
              exportedPsd = exportKey
                ? encryptWithPassword(JSON.stringify(a.providerSpecificData), exportKey)
                : a.providerSpecificData;
            }
          } else {
            // Credentials not included: sanitize providerSpecificData to strip sensitive tokens
            exportedPsd = sanitizePsdForExport(a.providerSpecificData);
          }
          return {
            id: a.id,
            name: a.name,
            apiKey: exportedKey,
            isActive: a.isActive,
            sortOrder: a.sortOrder,
            providerSpecificData: exportedPsd,
          };
        }),
      };
    });

    const combos = ComboRepository.getAllCombos().map((c) => ({
      id: c.id,
      name: c.name,
      strategy: c.strategy,
      models: c.models,
      isActive: c.isActive,
    }));

    const mappings = ToolMappingRepository.getAllMappings();
    const modelRules = ModelRepository.getAllRules().map((r) => ({
      id: r.id,
      alias: r.alias,
      targetModel: r.targetModel,
      targetProviderId: r.targetProviderId,
      isDefault: r.isDefault,
      fallbackRules: r.fallbackRules || [],
    }));

    const settings = {
      endpoint: SettingsRepository.getEndpointSettings(),
      tokenSaver: SettingsRepository.getTokenSaverSettings(),
      capacityAdapter: SettingsRepository.getCapacityAdapterSettings(),
    };

    return {
      version: 1,
      app: APP_NAME,
      appVersion: APP_VERSION,
      exportedAt: new Date().toISOString(),
      encrypted: isEncrypted,
      includesCredentials: includeCredentials,
      salt: saltHex,
      checkToken,
      data: {
        providers: exportedProviders,
        combos,
        mappings,
        modelRules,
        settings,
      },
    };
  }

  /**
   * Imports gateway configuration from backup payload
   */
  public static async importConfig(
    payload: BackupPayload,
    options: BackupImportOptions = {}
  ): Promise<BackupImportResult> {
    if (!payload || typeof payload !== "object" || payload.version !== 1 || !payload.data) {
      throw new Error("Invalid backup file: Unrecognized format or missing data payload.");
    }

    const isEncrypted = Boolean(payload.encrypted);
    const password = options.password?.trim() || "";
    let decryptKey: Buffer | null = null;

    if (isEncrypted) {
      if (!password) {
        throw new Error("This backup file is encrypted with a password. Please provide the decryption password.");
      }
      if (!payload.salt) {
        throw new Error("Backup file corrupted: Missing encryption salt.");
      }
      try {
        decryptKey = deriveKey(password, Buffer.from(payload.salt, "hex"));
      } catch (e: any) {
        throw new Error(`Failed to derive key: ${e.message}`);
      }

      if (payload.checkToken) {
        try {
          const verified = decryptWithPassword(payload.checkToken, decryptKey);
          if (verified !== "mapigate-backup-valid") {
            throw new Error("Invalid password for encrypted backup.");
          }
        } catch {
          throw new Error("Invalid password for encrypted backup.");
        }
      }
    }

    const warnings: string[] = [];
    const restored = {
      providersCount: 0,
      accountsCount: 0,
      combosCount: 0,
      mappingsCount: 0,
      rulesCount: 0,
    };

    // 1. Providers & Accounts
    if (Array.isArray(payload.data.providers)) {
      for (const provData of payload.data.providers) {
        if (!provData.id) continue;
        try {
          ProviderRepository.saveProvider({
            id: provData.id,
            name: provData.name || provData.id,
            baseUrl: provData.baseUrl || "https://api.openai.com",
            format: (provData.format as any) || "openai",
            priority: 0,
            models: [],
            customHeaders: provData.customHeaders,
            proxyUrl: provData.proxyUrl,
            thinkingMode: provData.thinkingMode,
            strategy: provData.strategy || undefined,
            stickyLimit: provData.stickyLimit || undefined,
            isActive: provData.isActive !== false,
            createdAt: Date.now(),
            updatedAt: Date.now(),
          });
          restored.providersCount++;

          if (Array.isArray(provData.accounts)) {
            for (const accData of provData.accounts) {
              let rawKey = "";
              if (accData.apiKey) {
                if (decryptKey) {
                  try {
                    rawKey = decryptWithPassword(accData.apiKey, decryptKey);
                  } catch (e: any) {
                    throw new Error(`Invalid password for encrypted backup: Authentication failed (${e.message})`);
                  }
                } else {
                  rawKey = accData.apiKey;
                }
              }

              let restoredPsd = accData.providerSpecificData;
              if (typeof restoredPsd === "string" && decryptKey) {
                try {
                  const decrypted = decryptWithPassword(restoredPsd, decryptKey);
                  if (decrypted) {
                    restoredPsd = JSON.parse(decrypted);
                  }
                } catch {
                  // best effort fallback
                }
              }

              const accId = accData.id || crypto.randomUUID();
              const existingAcc = ProviderRepository.getAccountById(accId);
              if (existingAcc) {
                ProviderRepository.updateAccount(accId, {
                  name: accData.name,
                  rawApiKey: rawKey || undefined,
                  isActive: accData.isActive,
                  providerSpecificData: typeof restoredPsd === "object" ? restoredPsd : existingAcc.providerSpecificData,
                });
                restored.accountsCount++;
              } else {
                ProviderRepository.addAccount({
                  id: accId,
                  providerId: provData.id,
                  name: accData.name || "Default Account",
                  rawApiKey: rawKey,
                  sortOrder: accData.sortOrder,
                  providerSpecificData: typeof restoredPsd === "object" ? restoredPsd : undefined,
                });
                if (accData.isActive === false) {
                  ProviderRepository.toggleAccount(accId, false);
                }
                restored.accountsCount++;
              }
            }
          }
        } catch (err: any) {
          warnings.push(`Failed restoring provider '${provData.id}': ${err.message}`);
        }
      }
    }

    // 2. Combos
    if (Array.isArray(payload.data.combos)) {
      for (const c of payload.data.combos) {
        if (!c.name || !Array.isArray(c.models)) continue;
        try {
          ComboRepository.saveCombo({
            id: c.id,
            name: c.name,
            strategy: (c.strategy as any) || "fallback",
            models: c.models,
            isActive: c.isActive !== false,
          });
          restored.combosCount++;
        } catch (err: any) {
          warnings.push(`Failed restoring combo '${c.name}': ${err.message}`);
        }
      }
    }

    // 3. Model Mappings
    if (Array.isArray(payload.data.mappings)) {
      for (const m of payload.data.mappings) {
        if (!m.toolId || !m.sourceModel || !m.targetModel) continue;
        try {
          ToolMappingRepository.saveMapping(m.toolId, m.sourceModel, m.targetModel);
          restored.mappingsCount++;
        } catch (err: any) {
          warnings.push(`Failed restoring mapping '${m.toolId}/${m.sourceModel}': ${err.message}`);
        }
      }
    }

    // 4. Model Rules
    if (Array.isArray(payload.data.modelRules)) {
      for (const r of payload.data.modelRules) {
        if (!r.alias || !r.targetModel) continue;
        try {
          ModelRepository.saveRule({
            id: r.id || crypto.randomUUID(),
            alias: r.alias,
            targetModel: r.targetModel,
            targetProviderId: r.targetProviderId || "",
            isDefault: Boolean(r.isDefault),
            fallbackRules: r.fallbackRules || [],
          });
          restored.rulesCount++;
        } catch (err: any) {
          warnings.push(`Failed restoring model rule '${r.alias}': ${err.message}`);
        }
      }
    }

    // 5. Settings
    if (payload.data.settings) {
      try {
        if (payload.data.settings.tokenSaver) {
          SettingsRepository.setTokenSaverSettings(payload.data.settings.tokenSaver);
        }
        if (payload.data.settings.capacityAdapter) {
          SettingsRepository.setCapacityAdapterSettings(payload.data.settings.capacityAdapter);
        }
        if (payload.data.settings.endpoint) {
          SettingsRepository.setEndpointSettings(payload.data.settings.endpoint);
        }
      } catch (err: any) {
        warnings.push(`Failed restoring settings: ${err.message}`);
      }
    }

    return {
      success: true,
      restored,
      warnings: warnings.length > 0 ? warnings : undefined,
    };
  }
}
