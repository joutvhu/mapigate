import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import crypto from "node:crypto";
import nodeMachineId from "node-machine-id";
const { machineIdSync } = nodeMachineId;

import {
  APP_NAME,
  APP_VERSION,
  MAPIGATE_PID_FILE,
  MAPIGATE_DB_FILE,
  MAPIGATE_PID_FILE,
  MAPIGATE_DB_FILE,
  getDefaultDataDir,
} from "../src/shared/constants/index.js";
import { MAPIGATE_BASE_URL, MAPIGATE_BASE_URL } from "../src/shared/constants/cliTools.js";
import { PidFileManager } from "../src/cli/daemon/pidFile.js";
import { CryptoVault } from "../src/storage/crypto/vault.js";

test("Mapigate Rename - Constants and Aliases", () => {
  assert.equal(APP_NAME, "Mapigate");
  assert.equal(APP_VERSION, "0.1.0");
  assert.equal(MAPIGATE_PID_FILE, "mapigate.pid");
  assert.equal(MAPIGATE_DB_FILE, "mapigate.sqlite");
  assert.equal(MAPIGATE_PID_FILE, MAPIGATE_PID_FILE);
  assert.equal(MAPIGATE_DB_FILE, MAPIGATE_DB_FILE);
  assert.equal(MAPIGATE_BASE_URL, "http://127.0.0.1:20127");
  assert.equal(MAPIGATE_BASE_URL, MAPIGATE_BASE_URL);
});

test("Mapigate Rename - Data Directory Resolution and Env Fallbacks", () => {
  const origMapigateEnv = process.env.MAPIGATE_DATA_DIR;
  const origMapigateEnv = process.env.MAPIGATE_DATA_DIR;

  try {
    // 1. MAPIGATE_DATA_DIR takes highest precedence
    process.env.MAPIGATE_DATA_DIR = "/custom/mapigate/data";
    delete process.env.MAPIGATE_DATA_DIR;
    assert.equal(getDefaultDataDir(), "/custom/mapigate/data");

    // 2. MAPIGATE_DATA_DIR fallback when MAPIGATE_DATA_DIR not set
    delete process.env.MAPIGATE_DATA_DIR;
    process.env.MAPIGATE_DATA_DIR = "/legacy/mapigate/data";
    assert.equal(getDefaultDataDir(), "/legacy/mapigate/data");

    // 3. Default resolution
    delete process.env.MAPIGATE_DATA_DIR;
    delete process.env.MAPIGATE_DATA_DIR;
    const resolved = getDefaultDataDir();
    assert.ok(resolved.includes(".mapigate") || resolved.includes(".mapigate"));
  } finally {
    if (origMapigateEnv !== undefined) process.env.MAPIGATE_DATA_DIR = origMapigateEnv;
    else delete process.env.MAPIGATE_DATA_DIR;
    if (origMapigateEnv !== undefined) process.env.MAPIGATE_DATA_DIR = origMapigateEnv;
    else delete process.env.MAPIGATE_DATA_DIR;
  }
});

test("Mapigate Rename - PidFileManager Lifecycle and Legacy Lookup", () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "mpg-pid-test-"));
  const origEnv = process.env.MAPIGATE_DATA_DIR;
  process.env.MAPIGATE_DATA_DIR = tmpDir;

  try {
    // Write mapigate PID
    PidFileManager.writePid(99999);
    assert.equal(PidFileManager.readPid(), 99999);
    assert.ok(fs.existsSync(path.join(tmpDir, "mapigate.pid")));

    PidFileManager.removePid();
    assert.equal(PidFileManager.readPid(), null);
    assert.ok(!fs.existsSync(path.join(tmpDir, "mapigate.pid")));

    // Legacy mapigate.pid fallback
    fs.writeFileSync(path.join(tmpDir, "mapigate.pid"), "88888", "utf8");
    assert.equal(PidFileManager.readPid(), 88888);

    // removePid cleans up legacy as well
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

test("Mapigate Rename - CryptoVault Encryption and Legacy Fallback Decryption", () => {
  const sampleSecret = "sk-ant-api03-secret-credential-value-xyz";

  // 1. Encrypt and decrypt with current Mapigate vault
  const encryptedNew = CryptoVault.encrypt(sampleSecret);
  assert.ok(encryptedNew.length > 20);
  assert.equal(CryptoVault.decrypt(encryptedNew), sampleSecret);

  // 2. Synthesize ciphertext encrypted with legacy "mapigate-vault-salt-v1"
  let hwId: string;
  try {
    hwId = machineIdSync();
  } catch {
    hwId = "fallback-hw-key-mapigate";
  }
  const legacyMasterKey = crypto.scryptSync(hwId, "mapigate-vault-salt-v1", 32);
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", legacyMasterKey, iv);
  let legacyEncrypted = cipher.update(sampleSecret, "utf8", "hex");
  legacyEncrypted += cipher.final("hex");
  const authTag = cipher.getAuthTag().toString("hex");
  const legacyCiphertext = `${iv.toString("hex")}:${authTag}:${legacyEncrypted}`;

  // 3. Decrypt legacy ciphertext using CryptoVault fallback
  const decryptedLegacy = CryptoVault.decrypt(legacyCiphertext);
  assert.equal(decryptedLegacy, sampleSecret, "CryptoVault must successfully decrypt legacy mapigate ciphertexts");
});
