import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { createRequire } from "node:module";
import { getDefaultDataDir, MAPIGATE_DB_FILE, isTestEnvironment } from "../shared/constants/index.js";

const nodeRequire = createRequire(import.meta.url);

export interface DatabaseDriver {
  exec(sql: string): void;
  run(sql: string, ...params: any[]): { changes: number; lastInsertRowid: number | bigint };
  get<T = any>(sql: string, ...params: any[]): T | undefined;
  all<T = any>(sql: string, ...params: any[]): T[];
  close(): void;
}

export function stripNullBytes(value: unknown): unknown {
  if (typeof value !== "string" || !value.includes("\0")) return value;
  return value.replace(/\0/g, "");
}

function cleanParams(params: any[]): any[] {
  return params.map(stripNullBytes);
}

class NodeSqliteDriver implements DatabaseDriver {
  private db: any;
  private stmtCache: Map<string, any> = new Map();

  constructor(filePath: string, DatabaseSyncCtor: any) {
    this.db = new DatabaseSyncCtor(filePath);
    this.initPragmas();
  }

  private initPragmas() {
    this.db.exec("PRAGMA journal_mode = WAL;");
    this.db.exec("PRAGMA synchronous = NORMAL;");
    this.db.exec("PRAGMA foreign_keys = ON;");
    this.db.exec("PRAGMA busy_timeout = 5000;");
    this.db.exec("PRAGMA cache_size = -64000;");
    this.db.exec("PRAGMA temp_store = MEMORY;");
  }

  private getStatement(sql: string): any {
    let stmt = this.stmtCache.get(sql);
    if (!stmt) {
      stmt = this.db.prepare(sql);
      this.stmtCache.set(sql, stmt);
    }
    return stmt;
  }

  public exec(sql: string): void {
    this.db.exec(sql);
  }

  public run(sql: string, ...params: any[]): { changes: number; lastInsertRowid: number | bigint } {
    const stmt = this.getStatement(sql);
    const result = stmt.run(...cleanParams(params));
    return {
      changes: Number(result.changes),
      lastInsertRowid: result.lastInsertRowid,
    };
  }

  public get<T = any>(sql: string, ...params: any[]): T | undefined {
    const stmt = this.getStatement(sql);
    return stmt.get(...cleanParams(params)) as T | undefined;
  }

  public all<T = any>(sql: string, ...params: any[]): T[] {
    const stmt = this.getStatement(sql);
    return stmt.all(...cleanParams(params)) as T[];
  }

  public close(): void {
    this.stmtCache.clear();
    try {
      this.db.exec("PRAGMA wal_checkpoint(TRUNCATE);");
    } catch {}
    try {
      this.db.close();
    } catch {
      // Ignored if already closed
    }
  }
}

class BetterSqliteDriver implements DatabaseDriver {
  private db: any;
  private stmtCache: Map<string, any> = new Map();

  constructor(filePath: string, BetterSqliteCtor: any) {
    this.db = new BetterSqliteCtor(filePath);
    this.initPragmas();
  }

  private initPragmas() {
    this.db.pragma("journal_mode = WAL");
    this.db.pragma("synchronous = NORMAL");
    this.db.pragma("foreign_keys = ON");
    this.db.pragma("busy_timeout = 5000");
    this.db.pragma("cache_size = -64000");
    this.db.pragma("temp_store = MEMORY");
  }

  private getStatement(sql: string): any {
    let stmt = this.stmtCache.get(sql);
    if (!stmt) {
      stmt = this.db.prepare(sql);
      this.stmtCache.set(sql, stmt);
    }
    return stmt;
  }

  public exec(sql: string): void {
    this.db.exec(sql);
  }

  public run(sql: string, ...params: any[]): { changes: number; lastInsertRowid: number | bigint } {
    const stmt = this.getStatement(sql);
    const result = stmt.run(...cleanParams(params));
    return {
      changes: Number(result.changes),
      lastInsertRowid: result.lastInsertRowid,
    };
  }

  public get<T = any>(sql: string, ...params: any[]): T | undefined {
    const stmt = this.getStatement(sql);
    return stmt.get(...cleanParams(params)) as T | undefined;
  }

  public all<T = any>(sql: string, ...params: any[]): T[] {
    const stmt = this.getStatement(sql);
    return stmt.all(...cleanParams(params)) as T[];
  }

  public close(): void {
    this.stmtCache.clear();
    try {
      this.db.pragma("wal_checkpoint(TRUNCATE)");
    } catch {}
    try {
      this.db.close();
    } catch {
      // Ignored if already closed
    }
  }
}

function createDriver(dbPath: string): DatabaseDriver {
  // 1. Try native node:sqlite (Node 22.5.0+) first as primary zero-dependency driver
  try {
    const { DatabaseSync } = nodeRequire("node:sqlite");
    if (DatabaseSync) {
      return new NodeSqliteDriver(dbPath, DatabaseSync);
    }
  } catch {}

  // 2. Fallback to better-sqlite3 if node:sqlite is unavailable
  try {
    const betterSqlite = nodeRequire("better-sqlite3");
    if (betterSqlite) {
      return new BetterSqliteDriver(dbPath, betterSqlite);
    }
  } catch {}

  const currentVersion = process.version;
  throw new Error(
    `[Database] No compatible SQLite driver found. Mapigate requires Node.js >= 22.5.0 (current: ${currentVersion}) with native 'node:sqlite' or 'better-sqlite3'. Please upgrade Node.js.`
  );
}

let dbInstance: DatabaseDriver | null = null;

export function getDatabase(): DatabaseDriver {
  if (dbInstance) {
    return dbInstance;
  }

  // Automatic isolation guard: ensure tests use ./.mapigate-test in workspace, never ~/.mapigate or dev ./.mapigate
  if (!process.env.MAPIGATE_DATA_DIR && isTestEnvironment()) {
    const testDataDir = path.resolve(process.cwd(), ".mapigate-test");
    if (!fs.existsSync(testDataDir)) {
      fs.mkdirSync(testDataDir, { recursive: true });
    }
    process.env.MAPIGATE_DATA_DIR = testDataDir;
  }

  const dataDir = getDefaultDataDir();
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }

  const dbPath = path.join(dataDir, MAPIGATE_DB_FILE);
  dbInstance = createDriver(dbPath);

  // Hook cleanup on process exit
  const cleanup = () => {
    if (dbInstance) {
      dbInstance.close();
      dbInstance = null;
    }
  };

  process.once("exit", cleanup);

  initSchema(dbInstance);
  return dbInstance;
}

export function closeDatabase(): void {
  if (dbInstance) {
    dbInstance.close();
    dbInstance = null;
  }
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
      sort_order INTEGER NOT NULL DEFAULT 0,
      last_used_at INTEGER,
      created_at INTEGER NOT NULL,
      provider_specific_data TEXT,
      cached_quotas TEXT,
      quota_fetched_at INTEGER,
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
      api_key_id TEXT,
      api_key_name TEXT,
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

    CREATE TABLE IF NOT EXISTS tool_mappings (
      tool_id TEXT NOT NULL,
      source_model TEXT NOT NULL,
      target_model TEXT NOT NULL,
      PRIMARY KEY (tool_id, source_model)
    );

    CREATE TABLE IF NOT EXISTS mitm_mappings (
      ide TEXT NOT NULL,
      source_model TEXT NOT NULL,
      target_model TEXT NOT NULL,
      PRIMARY KEY (ide, source_model)
    );

    CREATE TABLE IF NOT EXISTS reasoning_cache (
      tool_call_id TEXT PRIMARY KEY,
      provider TEXT NOT NULL,
      model TEXT NOT NULL,
      reasoning TEXT NOT NULL,
      char_count INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL,
      expires_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS kv_store (
      scope TEXT NOT NULL,
      key TEXT NOT NULL,
      value TEXT NOT NULL,
      PRIMARY KEY (scope, key)
    );

    CREATE INDEX IF NOT EXISTS idx_request_logs_timestamp ON request_logs(timestamp);
    CREATE INDEX IF NOT EXISTS idx_request_logs_provider ON request_logs(provider_id);
    CREATE INDEX IF NOT EXISTS idx_request_logs_api_key_id ON request_logs(api_key_id);
    CREATE INDEX IF NOT EXISTS idx_request_details_timestamp ON request_details(timestamp);
    CREATE INDEX IF NOT EXISTS idx_request_details_provider ON request_details(provider);
    CREATE INDEX IF NOT EXISTS idx_request_details_model ON request_details(model);
    CREATE INDEX IF NOT EXISTS idx_request_details_status ON request_details(status);
    CREATE INDEX IF NOT EXISTS idx_reasoning_cache_expires ON reasoning_cache(expires_at);
    CREATE INDEX IF NOT EXISTS idx_kv_store_scope ON kv_store(scope);
    CREATE INDEX IF NOT EXISTS idx_tool_mappings_tool ON tool_mappings(tool_id);
  `);
}
