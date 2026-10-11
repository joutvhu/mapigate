import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { DatabaseSync } from "node:sqlite";
import { Migrator } from "../src/scripts/migration/migrator.js";
import {
  decrypt9routerValue,
  encrypt9routerValue,
  normalize9routerConnection,
} from "../src/scripts/migration/decrypt9router.js";
import { CryptoVault } from "../src/storage/crypto/vault.js";

function createMock9routerDb(dbPath: string): void {
  const dir = path.dirname(dbPath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  const db = new DatabaseSync(dbPath);
  db.exec(`
    CREATE TABLE _meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
    CREATE TABLE settings (id INTEGER PRIMARY KEY CHECK (id = 1), data TEXT NOT NULL);
    CREATE TABLE providerConnections (
      id TEXT PRIMARY KEY,
      provider TEXT NOT NULL,
      authType TEXT NOT NULL,
      name TEXT,
      email TEXT,
      priority INTEGER,
      isActive INTEGER DEFAULT 1,
      data TEXT NOT NULL,
      cachedQuotas TEXT,
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL
    );
    CREATE TABLE combos (
      id TEXT PRIMARY KEY,
      name TEXT UNIQUE NOT NULL,
      kind TEXT,
      models TEXT NOT NULL,
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL
    );
    CREATE TABLE kv (
      scope TEXT NOT NULL,
      key TEXT NOT NULL,
      value TEXT NOT NULL,
      PRIMARY KEY (scope, key)
    );
    CREATE TABLE apiKeys (
      id TEXT PRIMARY KEY,
      key TEXT UNIQUE NOT NULL,
      name TEXT,
      machineId TEXT,
      isActive INTEGER DEFAULT 1,
      createdAt TEXT NOT NULL
    );
    CREATE TABLE usageHistory (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      timestamp TEXT NOT NULL,
      provider TEXT,
      model TEXT,
      connectionId TEXT,
      apiKey TEXT,
      endpoint TEXT,
      promptTokens INTEGER DEFAULT 0,
      completionTokens INTEGER DEFAULT 0,
      cost REAL DEFAULT 0,
      status TEXT,
      tokens TEXT,
      meta TEXT
    );
    CREATE TABLE requestDetails (
      id TEXT PRIMARY KEY,
      timestamp TEXT NOT NULL,
      provider TEXT,
      model TEXT,
      connectionId TEXT,
      status TEXT,
      data TEXT NOT NULL
    );
  `);

  // Insert settings
  const settingsData = JSON.stringify({
    mitmEnabled: true,
    rtkEnabled: true,
    dnsToolEnabled: { kiro: true, copilot: false },
    providerStrategies: {
      gemini: { fallbackStrategy: "round-robin", stickyRoundRobinLimit: 2 },
    },
    comboStrategies: {
      "test-combo": { fallbackStrategy: "fallback" },
    },
  });
  db.prepare("INSERT INTO settings (id, data) VALUES (1, ?)").run(settingsData);

  // Insert plain API key connection
  db.prepare(`
    INSERT INTO providerConnections (id, provider, authType, name, email, priority, isActive, data, cachedQuotas, createdAt, updatedAt)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    "conn-openai-1",
    "openai",
    "apikey",
    "OpenAI Dev",
    "dev@example.com",
    1,
    1,
    JSON.stringify({ apiKey: "sk-proj-test123456", organization: "org-xyz" }),
    null,
    "2026-01-01T00:00:00.000Z",
    "2026-01-01T01:00:00.000Z"
  );

  // Insert 9router-encrypted connection
  const encryptedKey = encrypt9routerValue("sk-secret-encrypted-9router-key");
  db.prepare(`
    INSERT INTO providerConnections (id, provider, authType, name, email, priority, isActive, data, cachedQuotas, createdAt, updatedAt)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    "conn-gemini-1",
    "gemini",
    "apikey",
    "Gemini Secret",
    null,
    2,
    1,
    JSON.stringify({ apiKey: encryptedKey }),
    null,
    "2026-01-02T00:00:00.000Z",
    "2026-01-02T01:00:00.000Z"
  );

  // Insert OAuth connection (Antigravity)
  db.prepare(`
    INSERT INTO providerConnections (id, provider, authType, name, email, priority, isActive, data, cachedQuotas, createdAt, updatedAt)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    "conn-ag-1",
    "antigravity",
    "oauth",
    "Antigravity User",
    "user@google.com",
    3,
    0,
    JSON.stringify({
      accessToken: "ya29.test-access-token",
      refreshToken: "1//test-refresh-token",
      expiresAt: 1890000000000,
      projectId: "project-123",
    }),
    JSON.stringify({ total: 100, remaining: 80 }),
    "2026-01-03T00:00:00.000Z",
    "2026-01-03T01:00:00.000Z"
  );

  // Insert combos
  db.prepare(`
    INSERT INTO combos (id, name, kind, models, createdAt, updatedAt)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(
    "combo-1",
    "test-combo",
    null,
    JSON.stringify(["openai/gpt-4o", "gemini/gemini-2.5-pro"]),
    "2026-01-04T00:00:00.000Z",
    "2026-01-04T01:00:00.000Z"
  );

  // Insert kv (modelAliases & mitmAlias)
  db.prepare("INSERT INTO kv (scope, key, value) VALUES (?, ?, ?)").run(
    "modelAliases",
    "gemini-2.5-flash",
    JSON.stringify("gc/gemini-2.5-flash")
  );
  db.prepare("INSERT INTO kv (scope, key, value) VALUES (?, ?, ?)").run(
    "mitmAlias",
    "kiro",
    JSON.stringify({ "claude-sonnet-4.5": "ag/claude-opus-4-6-thinking" })
  );

  // Insert apiKeys
  db.prepare(`
    INSERT INTO apiKeys (id, key, name, machineId, isActive, createdAt)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(
    "key-1",
    "sk-rt-legacy-key-9router",
    "Default CLI Key",
    "test-machine",
    1,
    "2026-01-05T00:00:00.000Z"
  );

  // Insert usageHistory
  db.prepare(`
    INSERT INTO usageHistory (timestamp, provider, model, connectionId, apiKey, endpoint, promptTokens, completionTokens, cost, status, meta)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    "2026-01-06T12:00:00.000Z",
    "openai",
    "gpt-4o",
    "conn-openai-1",
    "sk-test",
    "/v1/chat/completions",
    150,
    50,
    0.005,
    "success",
    JSON.stringify({ client: "cursor" })
  );

  // Insert requestDetails
  db.prepare(`
    INSERT INTO requestDetails (id, timestamp, provider, model, connectionId, status, data)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(
    "req-det-1",
    "2026-01-06T12:00:00.000Z",
    "openai",
    "gpt-4o",
    "conn-openai-1",
    "success",
    JSON.stringify({ test: "data" })
  );

  db.close();
}

test("Migrator - Decryption and Credential Normalization Unit", () => {
  // 1. Plain string returns unchanged
  assert.equal(decrypt9routerValue("plain-sk-12345"), "plain-sk-12345");

  // 2. 9router encrypted round-trip
  const original = "sk-ant-test-secret-value-xyz";
  const encrypted = encrypt9routerValue(original);
  assert.notEqual(encrypted, original);
  assert.equal(decrypt9routerValue(encrypted), original);

  // 3. Corrupt/mismatched ciphertext fail-open returns original string
  const fakeEncrypted = "123456789012345678901234:12345678901234567890123456789012:deadbeef";
  assert.equal(decrypt9routerValue(fakeEncrypted), fakeEncrypted);

  // 4. normalize9routerConnection with OAuth
  const oauthRow = {
    id: "test-oauth-conn",
    provider: "antigravity",
    authType: "oauth",
    name: "User Account",
    email: "user@example.com",
    data: JSON.stringify({
      accessToken: "ya29.sample",
      refreshToken: "1//sample",
      projectId: "proj-1",
    }),
    cachedQuotas: JSON.stringify({ remaining: 10 }),
  };

  const norm = normalize9routerConnection(oauthRow);
  assert.equal(norm.name, "User Account");
  const parsedKey = JSON.parse(norm.rawApiKey);
  assert.equal(parsedKey.accessToken, "ya29.sample");
  assert.equal(parsedKey.refreshToken, "1//sample");
  assert.equal(norm.providerSpecificData.projectId, "proj-1");
  assert.deepEqual(norm.providerSpecificData.cachedQuotas, { remaining: 10 });
});

test("Migrator - Dry-Run Simulation Leaves Destination Untouched", () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "mapigate-migrate-dry-"));
  try {
    const srcPath = path.join(tmpDir, "source.sqlite");
    const destPath = path.join(tmpDir, "dest.sqlite");

    createMock9routerDb(srcPath);

    const migrator = new Migrator({
      source: srcPath,
      dest: destPath,
      dryRun: true,
    });

    const stats = migrator.migrate();

    // Verify destination was NOT created
    assert.equal(fs.existsSync(destPath), false);

    // Verify stats counts
    assert.equal(stats.dryRun, true);
    assert.equal(stats.errors.length, 0);
    assert.equal(stats.accounts.read, 3);
    assert.equal(stats.accounts.migrated, 3);
    assert.equal(stats.combos.read, 1);
    assert.equal(stats.combos.migrated, 1);
    assert.equal(stats.modelRules.read, 1);
    assert.equal(stats.modelRules.migrated, 1);
    assert.equal(stats.mitmMappings.read, 1);
    assert.equal(stats.mitmMappings.migrated, 1);
    assert.equal(stats.gatewayApiKeys.read, 1);
    assert.equal(stats.gatewayApiKeys.migrated, 1);
    assert.equal(stats.requestLogs.read, 1);
    assert.equal(stats.requestLogs.migrated, 1);
    assert.equal(stats.requestDetails.read, 1);
    assert.equal(stats.requestDetails.migrated, 1);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test("Migrator - Full End-to-End Migration & Data Integrity", () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "mapigate-migrate-full-"));
  try {
    const srcPath = path.join(tmpDir, "source.sqlite");
    const destPath = path.join(tmpDir, "dest.sqlite");

    createMock9routerDb(srcPath);

    const migrator = new Migrator({
      source: srcPath,
      dest: destPath,
      dryRun: false,
    });

    const stats = migrator.migrate();

    assert.equal(stats.errors.length, 0);
    assert.equal(fs.existsSync(destPath), true);

    const destDb = new DatabaseSync(destPath, { readOnly: true });

    // 1. Providers
    const providers = destDb.prepare("SELECT * FROM providers").all() as any[];
    assert.ok(providers.length >= 3);
    const geminiProv = providers.find((p) => p.id === "gemini");
    assert.ok(geminiProv);
    assert.equal(geminiProv.strategy, "round-robin");
    assert.equal(geminiProv.sticky_limit, 2);

    // 2. Accounts
    const accounts = destDb.prepare("SELECT * FROM provider_accounts").all() as any[];
    assert.equal(accounts.length, 3);

    const openaiAcc = accounts.find((a) => a.id === "conn-openai-1");
    assert.ok(openaiAcc);
    assert.equal(CryptoVault.decrypt(openaiAcc.api_key_encrypted), "sk-proj-test123456");

    const geminiAcc = accounts.find((a) => a.id === "conn-gemini-1");
    assert.ok(geminiAcc);
    assert.equal(CryptoVault.decrypt(geminiAcc.api_key_encrypted), "sk-secret-encrypted-9router-key");

    const agAcc = accounts.find((a) => a.id === "conn-ag-1");
    assert.ok(agAcc);
    const decryptedAg = JSON.parse(CryptoVault.decrypt(agAcc.api_key_encrypted));
    assert.equal(decryptedAg.accessToken, "ya29.test-access-token");
    assert.equal(decryptedAg.refreshToken, "1//test-refresh-token");

    // 3. Combos
    const combos = destDb.prepare("SELECT * FROM combos").all() as any[];
    assert.equal(combos.length, 1);
    assert.equal(combos[0].name, "test-combo");
    assert.equal(combos[0].strategy, "fallback");

    // 4. Model Rules
    const rules = destDb.prepare("SELECT * FROM model_rules").all() as any[];
    assert.equal(rules.length, 1);
    assert.equal(rules[0].alias, "gemini-2.5-flash");
    assert.equal(rules[0].target_model, "gemini-2.5-flash");
    assert.equal(rules[0].target_provider_id, "gemini-cli");

    // 5. MITM Mappings
    const mitm = destDb.prepare("SELECT * FROM mitm_mappings").all() as any[];
    assert.equal(mitm.length, 1);
    assert.equal(mitm[0].ide, "kiro");
    assert.equal(mitm[0].source_model, "claude-sonnet-4.5");
    assert.equal(mitm[0].target_model, "ag/claude-opus-4-6-thinking");

    // 6. Settings & Gateway API Keys
    const settings = destDb.prepare("SELECT * FROM settings").all() as any[];
    const setMap = new Map(settings.map((s) => [s.key, s.value]));
    assert.equal(setMap.get("mitm_server_running"), "true");
    assert.equal(setMap.get("rtkEnabled"), "true");
    assert.equal(setMap.get("mitm_dns_kiro"), "true");
    assert.equal(setMap.get("mitm_dns_copilot"), "false");

    const gwKeys = JSON.parse(setMap.get("gatewayApiKeys") || "[]");
    assert.equal(gwKeys.length, 1);
    assert.equal(gwKeys[0].key, "sk-rt-legacy-key-9router");

    // 7. Request Logs & Details
    const logs = destDb.prepare("SELECT * FROM request_logs").all() as any[];
    assert.equal(logs.length, 1);
    assert.equal(logs[0].prompt_tokens, 150);
    assert.equal(logs[0].completion_tokens, 50);

    const details = destDb.prepare("SELECT * FROM request_details").all() as any[];
    assert.equal(details.length, 1);
    assert.equal(details[0].id, "req-det-1");

    destDb.close();

    // 8. Idempotency & Backup test: Run migration again on existing destination
    const secondStats = migrator.migrate();
    assert.equal(secondStats.errors.length, 0);
    assert.ok(secondStats.backupPath);
    assert.equal(fs.existsSync(secondStats.backupPath!), true);

    const recheckDb = new DatabaseSync(destPath, { readOnly: true });
    const recheckAccounts = recheckDb.prepare("SELECT COUNT(*) as c FROM provider_accounts").get() as any;
    assert.equal(recheckAccounts.c, 3);
    const recheckCombos = recheckDb.prepare("SELECT COUNT(*) as c FROM combos").get() as any;
    assert.equal(recheckCombos.c, 1);
    recheckDb.close();
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});
