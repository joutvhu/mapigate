import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

import {
  APP_NAME,
  APP_VERSION,
  MAPIGATE_PID_FILE,
  MAPIGATE_DB_FILE,
  MAPIGATE_LOG_FILE,
  getDefaultDataDir,
} from "../src/shared/constants/index.js";
import { MAPIGATE_BASE_URL, MAPIGATE_V1_URL } from "../src/shared/constants/cliTools.js";
import { PidFileManager } from "../src/cli/daemon/pidFile.js";
import { CryptoVault } from "../src/storage/crypto/vault.js";

test("Mapigate Rename - Constants", () => {
  assert.equal(APP_NAME, "Mapigate");
  assert.equal(APP_VERSION, "0.1.0");
  assert.equal(MAPIGATE_PID_FILE, "mapigate.pid");
  assert.equal(MAPIGATE_DB_FILE, "mapigate.sqlite");
  assert.equal(MAPIGATE_LOG_FILE, "server.log");
  assert.equal(MAPIGATE_BASE_URL, "http://127.0.0.1:20127");
  assert.equal(MAPIGATE_V1_URL, "http://127.0.0.1:20127/v1");
});

test("Mapigate Rename - Data Directory Resolution", () => {
  const origEnv = process.env.MAPIGATE_DATA_DIR;

  try {
    // 1. MAPIGATE_DATA_DIR takes precedence
    process.env.MAPIGATE_DATA_DIR = "/custom/mapigate/data";
    assert.equal(getDefaultDataDir(), "/custom/mapigate/data");

    // 2. Default resolution
    delete process.env.MAPIGATE_DATA_DIR;
    const resolved = getDefaultDataDir();
    assert.equal(resolved, path.join(os.homedir(), ".mapigate"));
  } finally {
    if (origEnv !== undefined) process.env.MAPIGATE_DATA_DIR = origEnv;
    else delete process.env.MAPIGATE_DATA_DIR;
  }
});

test("Mapigate Rename - PidFileManager Lifecycle", () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "mpg-pid-test-"));
  const origEnv = process.env.MAPIGATE_DATA_DIR;
  process.env.MAPIGATE_DATA_DIR = tmpDir;

  try {
    // Write mapigate PID
    PidFileManager.writePid(99999);
    assert.equal(PidFileManager.readPid(), 99999);
    assert.ok(fs.existsSync(path.join(tmpDir, "mapigate.pid")));

    // Remove PID
    PidFileManager.removePid();
    assert.equal(PidFileManager.readPid(), null);
    assert.ok(!fs.existsSync(path.join(tmpDir, "mapigate.pid")));
  } finally {
    if (origEnv !== undefined) process.env.MAPIGATE_DATA_DIR = origEnv;
    else delete process.env.MAPIGATE_DATA_DIR;
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {}
  }
});

test("Mapigate Rename - CryptoVault Encryption & Decryption", () => {
  const sampleSecret = "sk-ant-api03-secret-credential-value-xyz";

  // Encrypt and decrypt with Mapigate vault
  const encrypted = CryptoVault.encrypt(sampleSecret);
  assert.ok(encrypted.length > 20);
  assert.equal(CryptoVault.decrypt(encrypted), sampleSecret);
});
