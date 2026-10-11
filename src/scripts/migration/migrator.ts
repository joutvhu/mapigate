import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import crypto from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import { getDefaultDataDir, MAPIGATE_DB_FILE } from "../../shared/constants/index.js";
import { getRegistryProvider } from "../../shared/constants/providerRegistry.js";
import { CryptoVault } from "../../storage/crypto/vault.js";
import { normalize9routerConnection, decrypt9routerValue } from "./decrypt9router.js";
import type { MigrationOptions, MigrationStats, EntityCount } from "./types.js";

function emptyCount(): EntityCount {
  return { read: 0, migrated: 0, skipped: 0 };
}

function parseJsonSafe<T = any>(val: any, fallback: T): T {
  if (val === null || val === undefined) return fallback;
  if (typeof val === "object") return val;
  try {
    return JSON.parse(val) as T;
  } catch {
    return fallback;
  }
}

export class Migrator {
  private options: MigrationOptions;

  constructor(options: MigrationOptions = {}) {
    this.options = options;
  }

  /**
   * Resolves the default or configured source 9router SQLite database path.
   */
  public resolveSourcePath(): string {
    if (this.options.source) {
      return path.resolve(process.cwd(), this.options.source);
    }

    if (process.platform === "win32") {
      const appData = process.env.APPDATA || path.join(os.homedir(), "AppData", "Roaming");
      const defaultWinPath = path.join(appData, "9router", "db", "data.sqlite");
      if (fs.existsSync(defaultWinPath)) return defaultWinPath;

      const altWinPath = path.join(os.homedir(), ".9router", "db", "data.sqlite");
      if (fs.existsSync(altWinPath)) return altWinPath;

      const altWinPath2 = path.join(os.homedir(), ".9router", "data.sqlite");
      if (fs.existsSync(altWinPath2)) return altWinPath2;

      return defaultWinPath;
    }

    // macOS / Linux
    const posixPath1 = path.join(os.homedir(), ".9router", "db", "data.sqlite");
    if (fs.existsSync(posixPath1)) return posixPath1;

    const posixPath2 = path.join(os.homedir(), ".9router", "data.sqlite");
    if (fs.existsSync(posixPath2)) return posixPath2;

    return posixPath1;
  }

  /**
   * Resolves the default or configured destination Mapigate SQLite database path.
   */
  public resolveDestPath(): string {
    if (this.options.dest) {
      return path.resolve(process.cwd(), this.options.dest);
    }

    if (process.env.MAPIGATE_DATA_DIR) {
      return path.join(process.env.MAPIGATE_DATA_DIR, MAPIGATE_DB_FILE);
    }

    return path.join(getDefaultDataDir(), MAPIGATE_DB_FILE);
  }

  /**
   * Creates a timestamped backup of the destination database file if it exists.
   */
  private createBackup(destPath: string): string | undefined {
    if (!fs.existsSync(destPath)) {
      return undefined;
    }

    const timestamp = new Date()
      .toISOString()
      .replace(/:/g, "-")
      .replace(/\..+/, "");
    const backupPath = `${destPath}.bak-${timestamp}`;
    fs.copyFileSync(destPath, backupPath);
    return backupPath;
  }

  /**
   * Initializes Mapigate database schema on the destination database.
   */
  private initDestSchema(db: DatabaseSync): void {
    db.exec(`
      PRAGMA journal_mode = WAL;
      PRAGMA synchronous = NORMAL;
      PRAGMA foreign_keys = ON;

      CREATE TABLE IF NOT EXISTS providers (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        base_url TEXT NOT NULL,
        format TEXT NOT NULL DEFAULT 'openai',
        is_active INTEGER NOT NULL DEFAULT 1,
        priority INTEGER NOT NULL DEFAULT 10,
        models TEXT NOT NULL DEFAULT '[]',
        custom_headers TEXT NOT NULL DEFAULT '{}',
        proxy_url TEXT,
        thinking_mode TEXT NOT NULL DEFAULT 'auto',
        strategy TEXT,
        sticky_limit INTEGER,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS provider_accounts (
        id TEXT PRIMARY KEY,
        provider_id TEXT NOT NULL,
        name TEXT NOT NULL,
        api_key_encrypted TEXT NOT NULL,
        is_active INTEGER NOT NULL DEFAULT 1,
        rate_limit_hits INTEGER NOT NULL DEFAULT 0,
        last_used_at INTEGER,
        created_at INTEGER NOT NULL,
        provider_specific_data TEXT,
        FOREIGN KEY (provider_id) REFERENCES providers(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS model_rules (
        id TEXT PRIMARY KEY,
        alias TEXT UNIQUE NOT NULL,
        target_model TEXT NOT NULL,
        target_provider_id TEXT NOT NULL,
        fallback_rules TEXT NOT NULL DEFAULT '[]',
        is_default INTEGER NOT NULL DEFAULT 0,
        created_at INTEGER NOT NULL,
        FOREIGN KEY (target_provider_id) REFERENCES providers(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS request_logs (
        id TEXT PRIMARY KEY,
        timestamp INTEGER NOT NULL,
        client_tool TEXT NOT NULL,
        requested_model TEXT NOT NULL,
        actual_model TEXT NOT NULL,
        provider_id TEXT NOT NULL,
        prompt_tokens INTEGER NOT NULL DEFAULT 0,
        completion_tokens INTEGER NOT NULL DEFAULT 0,
        tokens_saved_by_rtk INTEGER NOT NULL DEFAULT 0,
        cached_tokens INTEGER NOT NULL DEFAULT 0,
        cache_creation_tokens INTEGER NOT NULL DEFAULT 0,
        cost REAL NOT NULL DEFAULT 0,
        account_id TEXT,
        account_name TEXT,
        duration_ms INTEGER NOT NULL DEFAULT 0,
        status TEXT NOT NULL,
        error_message TEXT
      );

      CREATE TABLE IF NOT EXISTS request_details (
        id TEXT PRIMARY KEY,
        timestamp TEXT NOT NULL,
        provider TEXT,
        model TEXT,
        connection_id TEXT,
        status TEXT,
        data TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS combos (
        id TEXT PRIMARY KEY,
        name TEXT UNIQUE NOT NULL,
        models TEXT NOT NULL DEFAULT '[]',
        strategy TEXT NOT NULL DEFAULT 'round-robin',
        is_active INTEGER NOT NULL DEFAULT 1,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS mitm_mappings (
        ide TEXT NOT NULL,
        source_model TEXT NOT NULL,
        target_model TEXT NOT NULL,
        PRIMARY KEY (ide, source_model)
      );

      CREATE INDEX IF NOT EXISTS idx_request_logs_timestamp ON request_logs(timestamp);
      CREATE INDEX IF NOT EXISTS idx_request_logs_provider ON request_logs(provider_id);
      CREATE INDEX IF NOT EXISTS idx_request_details_timestamp ON request_details(timestamp);
      CREATE INDEX IF NOT EXISTS idx_request_details_provider ON request_details(provider);
      CREATE INDEX IF NOT EXISTS idx_request_details_model ON request_details(model);
      CREATE INDEX IF NOT EXISTS idx_request_details_status ON request_details(status);
    `);
  }

  /**
   * Main entry point to perform migration.
   */
  public migrate(): MigrationStats {
    const sourcePath = this.resolveSourcePath();
    const destPath = this.resolveDestPath();
    const isDryRun = Boolean(this.options.dryRun);

    const stats: MigrationStats = {
      sourcePath,
      destPath,
      dryRun: isDryRun,
      providers: emptyCount(),
      accounts: emptyCount(),
      combos: emptyCount(),
      modelRules: emptyCount(),
      mitmMappings: emptyCount(),
      settings: emptyCount(),
      gatewayApiKeys: emptyCount(),
      requestLogs: emptyCount(),
      requestDetails: emptyCount(),
      warnings: [],
      errors: [],
    };

    if (!fs.existsSync(sourcePath)) {
      stats.errors.push(`Source database file not found at: ${sourcePath}`);
      return stats;
    }

    let backupPath: string | undefined;
    if (!isDryRun && !this.options.noBackup && fs.existsSync(destPath)) {
      try {
        backupPath = this.createBackup(destPath);
        stats.backupPath = backupPath;
      } catch (err: any) {
        stats.warnings.push(`Failed to create backup of destination database: ${err.message}`);
      }
    }

    let srcDb: DatabaseSync;
    try {
      srcDb = new DatabaseSync(sourcePath, { readOnly: true });
    } catch (err: any) {
      stats.errors.push(`Failed to open source database: ${err.message}`);
      return stats;
    }

    // Determine available tables in source database
    const availableTables = new Set<string>();
    try {
      const rows = srcDb.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all() as any[];
      for (const r of rows) availableTables.add(r.name);
    } catch (err: any) {
      stats.errors.push(`Failed to read source database catalog: ${err.message}`);
      srcDb.close();
      return stats;
    }

    let destDb: DatabaseSync | null = null;
    if (!isDryRun) {
      const destDir = path.dirname(destPath);
      if (!fs.existsSync(destDir)) {
        fs.mkdirSync(destDir, { recursive: true });
      }
      destDb = new DatabaseSync(destPath);
      this.initDestSchema(destDb);
    }

    try {
      if (destDb) {
        destDb.exec("BEGIN TRANSACTION;");
      }

      // 1. Settings & Strategies
      let providerStrategies: Record<string, any> = {};
      let comboStrategies: Record<string, any> = {};
      let dnsToolEnabled: Record<string, boolean> = {};
      let mitmEnabled: boolean | null = null;
      let rtkEnabled: boolean | null = null;

      if (availableTables.has("settings")) {
        try {
          const settingRow = srcDb.prepare("SELECT data FROM settings WHERE id = 1").get() as any;
          if (settingRow && settingRow.data) {
            const data = parseJsonSafe(settingRow.data, {});
            stats.settings.read++;

            if (data.providerStrategies && typeof data.providerStrategies === "object") {
              providerStrategies = data.providerStrategies;
            }
            if (data.comboStrategies && typeof data.comboStrategies === "object") {
              comboStrategies = data.comboStrategies;
            }
            if (data.dnsToolEnabled && typeof data.dnsToolEnabled === "object") {
              dnsToolEnabled = data.dnsToolEnabled;
            }
            if (typeof data.mitmEnabled === "boolean") {
              mitmEnabled = data.mitmEnabled;
            }
            if (typeof data.rtkEnabled === "boolean") {
              rtkEnabled = data.rtkEnabled;
            }

            if (destDb) {
              const stmtSet = destDb.prepare(
                "INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value"
              );

              for (const [tool, enabled] of Object.entries(dnsToolEnabled)) {
                stmtSet.run(`mitm_dns_${tool.toLowerCase()}`, enabled ? "true" : "false");
                stats.settings.migrated++;
              }

              if (mitmEnabled !== null) {
                stmtSet.run("mitm_server_running", mitmEnabled ? "true" : "false");
                stats.settings.migrated++;
              }

              if (rtkEnabled !== null) {
                stmtSet.run("rtkEnabled", rtkEnabled ? "true" : "false");
                stats.settings.migrated++;
              }
            } else {
              // Dry run counts
              stats.settings.migrated += Object.keys(dnsToolEnabled).length;
              if (mitmEnabled !== null) stats.settings.migrated++;
              if (rtkEnabled !== null) stats.settings.migrated++;
            }
          }
        } catch (err: any) {
          stats.warnings.push(`Error reading settings: ${err.message}`);
        }
      }

      // 2. Collect Distinct Providers & Seed into `providers` table
      const distinctProviders = new Set<string>();
      let connRows: any[] = [];

      if (availableTables.has("providerConnections")) {
        try {
          connRows = srcDb.prepare("SELECT * FROM providerConnections").all() as any[];
          stats.accounts.read = connRows.length;
          for (const c of connRows) {
            if (c.provider) {
              const canon = getRegistryProvider(c.provider)?.id || c.provider;
              distinctProviders.add(canon);
            }
          }
        } catch (err: any) {
          stats.warnings.push(`Error reading providerConnections: ${err.message}`);
        }
      }

      // Also check modelAliases in `kv` to ensure providers referenced by aliases exist
      let modelAliasRows: any[] = [];
      if (availableTables.has("kv")) {
        try {
          modelAliasRows = srcDb.prepare("SELECT key, value FROM kv WHERE scope = 'modelAliases'").all() as any[];
          stats.modelRules.read = modelAliasRows.length;
          for (const r of modelAliasRows) {
            const rawVal = parseJsonSafe(r.value, "");
            if (typeof rawVal === "string" && rawVal.includes("/")) {
              const prefix = rawVal.split("/")[0];
              const canon = getRegistryProvider(prefix)?.id || prefix;
              distinctProviders.add(canon);
            }
          }
        } catch (err: any) {
          stats.warnings.push(`Error reading kv modelAliases: ${err.message}`);
        }
      }

      stats.providers.read = distinctProviders.size;

      // Upsert Providers into destination
      const now = Date.now();
      for (const provId of distinctProviders) {
        const reg = getRegistryProvider(provId);
        const name = reg?.name || provId;
        const baseUrl = reg?.baseUrl || "https://api.openai.com/v1";
        const format = reg?.format || "openai";
        const models = reg?.models?.map((m) => m.id) || [];
        const customHeaders = reg?.defaultHeaders || {};
        const thinkingMode = reg?.thinkingMode || "auto";

        const stratInfo = providerStrategies[provId] || providerStrategies[reg?.alias || ""];
        const strategy = stratInfo?.fallbackStrategy || null;
        const stickyLimit = stratInfo?.stickyRoundRobinLimit ?? 1;

        if (destDb) {
          destDb.prepare(
            `INSERT INTO providers (id, name, base_url, format, is_active, priority, models, custom_headers, proxy_url, thinking_mode, strategy, sticky_limit, created_at, updated_at)
             VALUES (?, ?, ?, ?, 1, 10, ?, ?, NULL, ?, ?, ?, ?, ?)
             ON CONFLICT(id) DO UPDATE SET
               name = excluded.name,
               base_url = excluded.base_url,
               format = excluded.format,
               models = CASE WHEN providers.models = '[]' THEN excluded.models ELSE providers.models END,
               strategy = COALESCE(excluded.strategy, providers.strategy),
               sticky_limit = COALESCE(excluded.sticky_limit, providers.sticky_limit),
               updated_at = excluded.updated_at`
          ).run(
            provId,
            name,
            baseUrl,
            format,
            JSON.stringify(models),
            JSON.stringify(customHeaders),
            thinkingMode,
            strategy,
            stickyLimit,
            now,
            now
          );
        }
        stats.providers.migrated++;
      }

      // 3. Provider Accounts
      if (connRows.length > 0) {
        let stmtAccInsert: any = null;
        if (destDb) {
          stmtAccInsert = destDb.prepare(
            `INSERT INTO provider_accounts (id, provider_id, name, api_key_encrypted, is_active, rate_limit_hits, last_used_at, created_at, provider_specific_data)
             VALUES (?, ?, ?, ?, ?, 0, ?, ?, ?)
             ON CONFLICT(id) DO UPDATE SET
               provider_id = excluded.provider_id,
               name = excluded.name,
               api_key_encrypted = excluded.api_key_encrypted,
               is_active = excluded.is_active,
               last_used_at = excluded.last_used_at,
               provider_specific_data = excluded.provider_specific_data`
          );
        }

        for (const conn of connRows) {
          try {
            const canonicalProviderId = getRegistryProvider(conn.provider)?.id || conn.provider;
            const norm = normalize9routerConnection(conn);
            const encryptedKey = CryptoVault.encrypt(norm.rawApiKey);
            const isActive = conn.isActive === 1 || conn.isActive === true ? 1 : 0;
            const createdAt = conn.createdAt ? (Date.parse(conn.createdAt) || now) : now;
            const lastUsedAt = conn.updatedAt ? (Date.parse(conn.updatedAt) || now) : null;
            const psdJson = Object.keys(norm.providerSpecificData).length > 0
              ? JSON.stringify(norm.providerSpecificData)
              : null;

            if (stmtAccInsert) {
              stmtAccInsert.run(
                conn.id,
                canonicalProviderId,
                norm.name,
                encryptedKey,
                isActive,
                lastUsedAt,
                createdAt,
                psdJson
              );
            }
            stats.accounts.migrated++;
          } catch (err: any) {
            stats.accounts.skipped++;
            stats.warnings.push(`Failed to migrate account ${conn.id} (${conn.provider}): ${err.message}`);
          }
        }
      }

      // 4. Combos
      if (availableTables.has("combos")) {
        try {
          const comboRows = srcDb.prepare("SELECT * FROM combos").all() as any[];
          stats.combos.read = comboRows.length;

          let stmtCombo: any = null;
          if (destDb) {
            stmtCombo = destDb.prepare(
              `INSERT INTO combos (id, name, models, strategy, is_active, created_at, updated_at)
               VALUES (?, ?, ?, ?, 1, ?, ?)
               ON CONFLICT(name) DO UPDATE SET
                 models = excluded.models,
                 strategy = excluded.strategy,
                 updated_at = excluded.updated_at`
            );
          }

          for (const row of comboRows) {
            const name = String(row.name).trim();
            const id = row.id || name.toLowerCase().replace(/[^a-z0-9_.-]/g, "-");
            const modelsArr = parseJsonSafe(row.models, []);
            const modelsJson = JSON.stringify(Array.isArray(modelsArr) ? modelsArr : []);
            
            const rawStrat = comboStrategies[name]?.fallbackStrategy || "round-robin";
            const strategy = ["round-robin", "fallback", "fusion"].includes(rawStrat)
              ? rawStrat
              : "round-robin";

            const createdAt = row.createdAt ? (Date.parse(row.createdAt) || now) : now;
            const updatedAt = row.updatedAt ? (Date.parse(row.updatedAt) || now) : now;

            if (stmtCombo) {
              stmtCombo.run(id, name, modelsJson, strategy, createdAt, updatedAt);
            }
            stats.combos.migrated++;
          }
        } catch (err: any) {
          stats.warnings.push(`Error reading combos: ${err.message}`);
        }
      }

      // 5. Model Rules (kv scope = 'modelAliases')
      if (modelAliasRows.length > 0) {
        let stmtRule: any = null;
        if (destDb) {
          stmtRule = destDb.prepare(
            `INSERT INTO model_rules (id, alias, target_model, target_provider_id, fallback_rules, is_default, created_at)
             VALUES (?, ?, ?, ?, '[]', 0, ?)
             ON CONFLICT(alias) DO UPDATE SET
               target_model = excluded.target_model,
               target_provider_id = excluded.target_provider_id`
          );
        }

        for (const r of modelAliasRows) {
          try {
            const alias = String(r.key).trim();
            const targetVal = parseJsonSafe(r.value, "");
            let targetProviderId = "openai";
            let targetModel = String(targetVal);

            if (targetModel.includes("/")) {
              const slash = targetModel.indexOf("/");
              const prefix = targetModel.slice(0, slash);
              targetProviderId = getRegistryProvider(prefix)?.id || prefix;
              targetModel = targetModel.slice(slash + 1);
            }

            const ruleId = `rule_${alias.toLowerCase().replace(/[^a-z0-9_.-]/g, "_")}`;

            if (stmtRule) {
              stmtRule.run(ruleId, alias, targetModel, targetProviderId, now);
            }
            stats.modelRules.migrated++;
          } catch (err: any) {
            stats.modelRules.skipped++;
            stats.warnings.push(`Failed to migrate model alias ${r.key}: ${err.message}`);
          }
        }
      }

      // 6. MITM Mappings (kv scope = 'mitmAlias')
      if (availableTables.has("kv")) {
        try {
          const mitmRows = srcDb.prepare("SELECT key, value FROM kv WHERE scope = 'mitmAlias'").all() as any[];
          let stmtMitm: any = null;
          if (destDb) {
            stmtMitm = destDb.prepare(
              `INSERT INTO mitm_mappings (ide, source_model, target_model)
               VALUES (?, ?, ?)
               ON CONFLICT(ide, source_model) DO UPDATE SET
                 target_model = excluded.target_model`
            );
          }

          for (const mr of mitmRows) {
            const ide = String(mr.key).toLowerCase().trim();
            const mappingObj = parseJsonSafe<Record<string, string>>(mr.value, {});
            const entries = Object.entries(mappingObj);
            stats.mitmMappings.read += entries.length;

            for (const [sourceModel, targetModel] of entries) {
              if (stmtMitm) {
                stmtMitm.run(ide, sourceModel, targetModel || "");
              }
              stats.mitmMappings.migrated++;
            }
          }
        } catch (err: any) {
          stats.warnings.push(`Error reading mitmAlias: ${err.message}`);
        }
      }

      // 7. Gateway API Keys (apiKeys table -> settings key 'gatewayApiKeys')
      if (availableTables.has("apiKeys")) {
        try {
          const keyRows = srcDb.prepare("SELECT * FROM apiKeys").all() as any[];
          stats.gatewayApiKeys.read = keyRows.length;

          if (keyRows.length > 0) {
            const mappedKeys = keyRows.map((k) => ({
              id: k.id || `key_${crypto.randomBytes(8).toString("hex")}`,
              key: k.key,
              name: k.name || "Default Key",
              isActive: k.isActive === 1 || k.isActive === true,
              createdAt: k.createdAt ? (Date.parse(k.createdAt) || now) : now,
            }));

            if (destDb) {
              // Read existing keys to merge
              const existingRow = destDb.prepare("SELECT value FROM settings WHERE key = 'gatewayApiKeys'").get() as any;
              const existingList = existingRow ? parseJsonSafe<any[]>(existingRow.value, []) : [];
              const mergedMap = new Map<string, any>();

              for (const ek of existingList) {
                if (ek && ek.key) mergedMap.set(ek.key, ek);
              }
              for (const nk of mappedKeys) {
                mergedMap.set(nk.key, nk);
              }

              destDb.prepare(
                "INSERT INTO settings (key, value) VALUES ('gatewayApiKeys', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value"
              ).run(JSON.stringify(Array.from(mergedMap.values())));
            }

            stats.gatewayApiKeys.migrated = mappedKeys.length;
          }
        } catch (err: any) {
          stats.warnings.push(`Error reading apiKeys: ${err.message}`);
        }
      }

      // 8. Usage History & Request Details
      if (this.options.skipLogs) {
        stats.requestLogs.skipped = stats.requestLogs.read;
        stats.requestDetails.skipped = stats.requestDetails.read;
      } else {
        // Migrate usageHistory -> request_logs
        if (availableTables.has("usageHistory")) {
          try {
            const countRow = srcDb.prepare("SELECT COUNT(*) as c FROM usageHistory").get() as any;
            const totalUsage = Number(countRow?.c || 0);
            stats.requestLogs.read = totalUsage;

            if (destDb && totalUsage > 0) {
              const stmtLog = destDb.prepare(
                `INSERT INTO request_logs (
                  id, timestamp, client_tool, requested_model, actual_model,
                  provider_id, prompt_tokens, completion_tokens, tokens_saved_by_rtk,
                  cached_tokens, cache_creation_tokens, cost, account_id, account_name,
                  duration_ms, status, error_message
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, 0, 0, ?, ?, NULL, 0, ?, NULL)
                ON CONFLICT(id) DO NOTHING`
              );

              const batchSize = 1000;
              for (let offset = 0; offset < totalUsage; offset += batchSize) {
                const batch = srcDb.prepare(
                  `SELECT id, timestamp, provider, model, connectionId, promptTokens, completionTokens, cost, status, meta
                   FROM usageHistory ORDER BY id ASC LIMIT ? OFFSET ?`
                ).all(batchSize, offset) as any[];

                for (const u of batch) {
                  const logId = `uh_${u.id}`;
                  const ts = u.timestamp ? (Date.parse(u.timestamp) || now) : now;
                  const prov = getRegistryProvider(u.provider)?.id || u.provider || "unknown";
                  const model = u.model || "unknown";
                  const clientTool = "generic";
                  const pTokens = Number(u.promptTokens) || 0;
                  const cTokens = Number(u.completionTokens) || 0;
                  const cost = Number(u.cost) || 0;
                  const status = u.status || "success";

                  stmtLog.run(logId, ts, clientTool, model, model, prov, pTokens, cTokens, cost, u.connectionId || null, status);
                  stats.requestLogs.migrated++;
                }
              }
            } else if (isDryRun) {
              stats.requestLogs.migrated = totalUsage;
            }
          } catch (err: any) {
            stats.warnings.push(`Error migrating usageHistory: ${err.message}`);
          }
        }

        // Migrate requestDetails -> request_details
        if (availableTables.has("requestDetails")) {
          try {
            const countRow = srcDb.prepare("SELECT COUNT(*) as c FROM requestDetails").get() as any;
            const totalDetails = Number(countRow?.c || 0);
            stats.requestDetails.read = totalDetails;

            if (destDb && totalDetails > 0) {
              const stmtDetail = destDb.prepare(
                `INSERT INTO request_details (id, timestamp, provider, model, connection_id, status, data)
                 VALUES (?, ?, ?, ?, ?, ?, ?)
                 ON CONFLICT(id) DO NOTHING`
              );

              const batchSize = 1000;
              for (let offset = 0; offset < totalDetails; offset += batchSize) {
                const batch = srcDb.prepare(
                  `SELECT id, timestamp, provider, model, connectionId, status, data
                   FROM requestDetails ORDER BY timestamp DESC LIMIT ? OFFSET ?`
                ).all(batchSize, offset) as any[];

                for (const d of batch) {
                  const prov = getRegistryProvider(d.provider)?.id || d.provider || "unknown";
                  stmtDetail.run(
                    d.id,
                    d.timestamp || new Date(now).toISOString(),
                    prov,
                    d.model || "unknown",
                    d.connectionId || null,
                    d.status || "success",
                    d.data || "{}"
                  );
                  stats.requestDetails.migrated++;
                }
              }
            } else if (isDryRun) {
              stats.requestDetails.migrated = totalDetails;
            }
          } catch (err: any) {
            stats.warnings.push(`Error migrating requestDetails: ${err.message}`);
          }
        }
      }

      if (destDb) {
        destDb.exec("COMMIT;");
      }
    } catch (err: any) {
      if (destDb) {
        try { destDb.exec("ROLLBACK;"); } catch {}
      }
      stats.errors.push(`Migration transaction failed: ${err.message}`);
    } finally {
      srcDb.close();
      if (destDb) {
        destDb.close();
      }
    }

    return stats;
  }
}
