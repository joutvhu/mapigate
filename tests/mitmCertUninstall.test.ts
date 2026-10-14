import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { getUninstallCommand, uninstallCert } from "../src/mitm/cert/install.js";
import { mitmManager } from "../src/mitm/manager.js";

describe("Root CA Certificate Uninstallation", () => {
  it("generates platform-specific uninstall commands with fingerprint", () => {
    const tmpDir = path.join(os.tmpdir(), `mapigate-cert-test-${Date.now()}`);
    fs.mkdirSync(tmpDir, { recursive: true });
    const dummyCertPath = path.join(tmpDir, "test.crt");

    try {
      // Create a valid PEM cert structure so getCertFingerprint computes a hash
      const dummyPem =
        "-----BEGIN CERTIFICATE-----\n" +
        "MIIBczCCARwCAQAwDQYJKoZIhvcNAQEEBQAwFzEVMBMGA1UEAwwMTWFwaWdhdGUg\n" +
        "VGVzdDAeFw0yNTAxMDEwMDAwMDBaFw0yNjAxMDEwMDAwMDBaMBcxFTATBgNVBAMM\n" +
        "DE1hcGlnYXRlIFRlc3QwXDANBgkqhkiG9w0BAQEFAANLADBIAkEA0Z3vVl5t7b...\n" +
        "-----END CERTIFICATE-----\n";
      fs.writeFileSync(dummyCertPath, dummyPem, "utf8");

      const cmds = getUninstallCommand(dummyCertPath);
      assert.ok(cmds.windows.startsWith("certutil -delstore -user Root"));
      assert.ok(cmds.mac.includes("security delete-certificate -Z"));
      assert.ok(cmds.linux.includes("update-ca-certificates --fresh"));
    } finally {
      try {
        fs.rmSync(tmpDir, { recursive: true, force: true });
      } catch {
        // cleanup
      }
    }
  });

  it("uninstallCert returns failure message if fingerprint cannot be resolved", async () => {
    const nonExistent = path.join(os.tmpdir(), "non-existent-cert.crt");
    const result = await uninstallCert(nonExistent);
    assert.equal(result.success, false);
    assert.ok(result.message.includes("Could not determine certificate fingerprint"));
  });

  it("mitmManager exposes uninstallCertificate method", async () => {
    assert.equal(typeof mitmManager.uninstallCertificate, "function");
  });

  it("mitmManager.getStatus returns uninstallCommands", async () => {
    const status = await mitmManager.getStatus();
    assert.ok(status.uninstallCommands);
    assert.ok(status.uninstallCommands.windows);
    assert.ok(status.uninstallCommands.mac);
    assert.ok(status.uninstallCommands.linux);
  });
});
