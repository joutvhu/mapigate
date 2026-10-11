import path from "node:path";
import fs from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { getDefaultDataDir, ROUTEN_DB_FILE } from "../shared/constants/index.js";

export interface DatabaseDriver {
  exec(sql: string): void;
  run(sql: string, ...params: any[]): { changes: number; lastInsertRowid: number | bigint };
  get<T = any>(sql: string, ...params: any[]): T | undefined;
  all<T = any>(sql: string, ...params: any[]): T[];
  close(): void;
}

class NodeSqliteDriver implements DatabaseDriver {
  private db: DatabaseSync;

  constructor(filePath: string) {
    this.db = new DatabaseSync(filePath);
    this.initPragmas();
  }

  private initPragmas() {
    this.db.exec("PRAGMA journal_mode = WAL;");
    this.db.exec("PRAGMA synchronous = NORMAL;");
    this.db.exec("PRAGMA foreign_keys = ON;");
  }

  public exec(sql: string): void {
    this.db.exec(sql);
  }

  public run(sql: string, ...params: any[]): { changes: number; lastInsertRowid: number | bigint } {
    const stmt = this.db.prepare(sql);
    const result = stmt.run(...params);
    return {
      changes: Number(result.changes),
      lastInsertRowid: result.lastInsertRowid,
    };
  }

  public get<T = any>(sql: string, ...params: any[]): T | undefined {
    const stmt = this.db.prepare(sql);
    return stmt.get(...params) as T | undefined;
  }

  public all<T = any>(sql: string, ...params: any[]): T[] {
    const stmt = this.db.prepare(sql);
    return stmt.all(...params) as T[];
  }

  public close(): void {
    try {
      this.db.close();
    } catch {
      // Ignored if already closed
    }
  }
}

let dbInstance: DatabaseDriver | null = null;

export function getDatabase(): DatabaseDriver {
  if (dbInstance) {
    return dbInstance;
  }

  const dataDir = getDefaultDataDir();
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }

  const dbPath = path.join(dataDir, ROUTEN_DB_FILE);
  dbInstance = new NodeSqliteDriver(dbPath);

  // Hook cleanup on process exit
  const cleanup = () => {
    if (dbInstance) {
      dbInstance.close();
      dbInstance = null;
    }
  };

  process.once("exit", cleanup);
  process.once("SIGINT", () => {
    cleanup();
    process.exit(0);
  });
  process.once("SIGTERM", () => {
    cleanup();
    process.exit(0);
  });

  initSchema(dbInstance);
  return dbInstance;
}

function initSchema(db: DatabaseDriver) {
  db.exec(`
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

  // Safe migrations for newly added columns
  try { db.exec("ALTER TABLE providers ADD COLUMN custom_headers TEXT NOT NULL DEFAULT '{}';"); } catch {}
  try { db.exec("ALTER TABLE providers ADD COLUMN proxy_url TEXT;"); } catch {}
  try { db.exec("ALTER TABLE providers ADD COLUMN thinking_mode TEXT NOT NULL DEFAULT 'auto';"); } catch {}
  try { db.exec("ALTER TABLE providers ADD COLUMN strategy TEXT;"); } catch {}
  try { db.exec("ALTER TABLE providers ADD COLUMN sticky_limit INTEGER;"); } catch {}
  try { db.exec("ALTER TABLE provider_accounts ADD COLUMN provider_specific_data TEXT;"); } catch {}
  try { db.exec("ALTER TABLE request_logs ADD COLUMN cached_tokens INTEGER NOT NULL DEFAULT 0;"); } catch {}
  try { db.exec("ALTER TABLE request_logs ADD COLUMN cache_creation_tokens INTEGER NOT NULL DEFAULT 0;"); } catch {}
  try { db.exec("ALTER TABLE request_logs ADD COLUMN cost REAL NOT NULL DEFAULT 0;"); } catch {}
  try { db.exec("ALTER TABLE request_logs ADD COLUMN account_id TEXT;"); } catch {}
  try { db.exec("ALTER TABLE request_logs ADD COLUMN account_name TEXT;"); } catch {}
}
