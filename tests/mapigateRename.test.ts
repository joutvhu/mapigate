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
  isDevelopmentMode,
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
  const origDataDir = process.env.MAPIGATE_DATA_DIR;
  const origNodeEnv = process.env.NODE_ENV;
  const origMapigateDev = process.env.MAPIGATE_DEV;
  const origMapigateProd = process.env.MAPIGATE_PROD;

  try {
    // 1. MAPIGATE_DATA_DIR takes highest precedence
    process.env.MAPIGATE_DATA_DIR = "/custom/mapigate/data";
    assert.equal(getDefaultDataDir(), "/custom/mapigate/data");

    // 2. Clear MAPIGATE_DATA_DIR to test environment-based resolution
    delete process.env.MAPIGATE_DATA_DIR;

    // 2a. Development mode resolution (in repo root)
    delete process.env.MAPIGATE_PROD;
    process.env.NODE_ENV = "development";
    assert.equal(isDevelopmentMode(), true);
    assert.equal(getDefaultDataDir(), path.resolve(process.cwd(), ".mapigate"));

    // 2b. MAPIGATE_DEV flag
    delete process.env.NODE_ENV;
    process.env.MAPIGATE_DEV = "1";
    assert.equal(isDevelopmentMode(), true);
    assert.equal(getDefaultDataDir(), path.resolve(process.cwd(), ".mapigate"));
    delete process.env.MAPIGATE_DEV;

    // 2c. Production mode resolution (NODE_ENV=production)
    process.env.NODE_ENV = "production";
    assert.equal(isDevelopmentMode(), false);
    assert.equal(getDefaultDataDir(), path.join(os.homedir(), ".mapigate"));

    // 2d. Production mode resolution (MAPIGATE_PROD=1)
    delete process.env.NODE_ENV;
    process.env.MAPIGATE_PROD = "1";
    assert.equal(isDevelopmentMode(), false);
    assert.equal(getDefaultDataDir(), path.join(os.homedir(), ".mapigate"));
  } finally {
    if (origDataDir !== undefined) process.env.MAPIGATE_DATA_DIR = origDataDir;
    else delete process.env.MAPIGATE_DATA_DIR;

    if (origNodeEnv !== undefined) process.env.NODE_ENV = origNodeEnv;
    else delete process.env.NODE_ENV;

    if (origMapigateDev !== undefined) process.env.MAPIGATE_DEV = origMapigateDev;
    else delete process.env.MAPIGATE_DEV;

    if (origMapigateProd !== undefined) process.env.MAPIGATE_PROD = origMapigateProd;
    else delete process.env.MAPIGATE_PROD;
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
