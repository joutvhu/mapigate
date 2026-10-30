import test from "node:test";
import assert from "node:assert/strict";
import { BackupService } from "../src/storage/backupService.js";
import { ComboRepository } from "../src/storage/repositories/comboRepo.js";
import { ToolMappingRepository } from "../src/storage/repositories/toolMappingRepo.js";
import { ProviderRepository } from "../src/storage/repositories/providerRepo.js";

test("BackupService - exports configuration structure without credentials when includeCredentials is false", async () => {
  // Ensure at least one test combo and mapping exist
  ComboRepository.saveCombo({
    name: "test-backup-combo",
    strategy: "fallback",
    models: ["claude-3-7-sonnet", "deepseek-chat"],
    isActive: true,
  });

  ToolMappingRepository.saveMapping("global", "test-source-model", "test-target-model");

  const backup = await BackupService.exportConfig({ includeCredentials: false });

  assert.equal(backup.version, 1);
  assert.equal(backup.encrypted, false);
  assert.equal(backup.includesCredentials, false);
  assert.ok(Array.isArray(backup.data.providers));
  assert.ok(Array.isArray(backup.data.combos));
  assert.ok(Array.isArray(backup.data.mappings));

  // Check all exported accounts have empty apiKey
  for (const prov of backup.data.providers) {
    if (prov.accounts) {
      for (const acc of prov.accounts) {
        assert.equal(acc.apiKey, "", "API key must be stripped when includeCredentials is false");
      }
    }
  }

  // Verify test combo and mapping are in backup
  const foundCombo = backup.data.combos.find((c) => c.name === "test-backup-combo");
  assert.ok(foundCombo, "Test combo should be included in export");

  const foundMapping = backup.data.mappings.find((m) => m.sourceModel === "test-source-model");
  assert.ok(foundMapping, "Test mapping should be included in export");
});

test("BackupService - exports encrypted configuration and successfully restores with password", async () => {
  const testProvId = `test-backup-prov-${Date.now()}`;
  ProviderRepository.saveProvider({
    id: testProvId,
    name: "Test Backup Provider",
    baseUrl: "https://api.test.com/v1",
    format: "openai",
    priority: 1,
    models: ["test-m1"],
    isActive: true,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  });

  const testAccId = `test-acc-${Date.now()}`;
  ProviderRepository.addAccount({
    id: testAccId,
    providerId: testProvId,
    name: "Secret Key Account",
    rawApiKey: "sk-secret-test-key-12345",
  });

  const pwd = "my-secure-backup-password";
  const backup = await BackupService.exportConfig({
    includeCredentials: true,
    password: pwd,
  });

  assert.equal(backup.encrypted, true);
  assert.equal(backup.includesCredentials, true);
  assert.ok(backup.salt && backup.salt.length === 32, "Salt must be a 16-byte hex string");

  const exportedProv = backup.data.providers.find((p) => p.id === testProvId);
  assert.ok(exportedProv);
  const exportedAcc = exportedProv.accounts?.find((a) => a.id === testAccId);
  assert.ok(exportedAcc && exportedAcc.apiKey);
  assert.notEqual(exportedAcc.apiKey, "sk-secret-test-key-12345", "Key must be encrypted, not plaintext");

  // Restore with correct password
  const importResult = await BackupService.importConfig(backup, {
    password: pwd,
    mode: "merge",
  });

  assert.equal(importResult.success, true);
  assert.ok(importResult.restored.providersCount >= 1);
  assert.ok(importResult.restored.accountsCount >= 1);

  // Verify restored account in database has decrypted rawApiKey matching original
  const restoredAcc = ProviderRepository.getAccountById(testAccId);
  assert.ok(restoredAcc);
  assert.equal(restoredAcc.rawApiKey, "sk-secret-test-key-12345");

  // Attempting restore with wrong password must throw error
  await assert.rejects(
    async () => {
      await BackupService.importConfig(backup, {
        password: "wrong-password",
      });
    },
    /Authentication failed|Invalid password/i
  );
});
