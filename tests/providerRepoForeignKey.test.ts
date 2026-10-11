process.env.NODE_ENV = "test";

import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import app from "../src/server/index.js";
import { ProviderRepository } from "../src/storage/repositories/providerRepo.js";
import { getRegistryProvider } from "../src/shared/constants/providerRegistry.js";

test("Unit - ensureProviderExists for registry provider creates with registry defaults when missing from DB", () => {
  const providerId = "kiro";

  // Clean state for this provider
  try {
    ProviderRepository.deleteProvider(providerId);
  } catch {}

  assert.equal(ProviderRepository.getProviderById(providerId), undefined);

  // Call ensureProviderExists
  const ensured = ProviderRepository.ensureProviderExists(providerId);
  assert.equal(ensured.id, providerId);
  assert.ok(ensured.baseUrl);
  assert.ok(ensured.models.length > 0);
  assert.equal(ensured.isActive, true);

  // Check it is now persisted in SQLite
  const inDb = ProviderRepository.getProviderById(providerId);
  assert.ok(inDb);
  assert.equal(inDb.id, providerId);
  assert.equal(inDb.name, ensured.name);
  assert.equal(inDb.format, ensured.format);

  // Clean up
  ProviderRepository.deleteProvider(providerId);
});

test("Unit - ensureProviderExists resolves aliases to canonical registry ID", () => {
  const alias = "agnes-ai";
  const canonicalId = "agnes";

  try {
    ProviderRepository.deleteProvider(canonicalId);
    ProviderRepository.deleteProvider(alias);
  } catch {}

  const ensured = ProviderRepository.ensureProviderExists(alias);
  assert.equal(ensured.id, canonicalId, "Must resolve to canonical ID 'agnes'");

  const inDb = ProviderRepository.getProviderById(canonicalId);
  assert.ok(inDb, "Canonical provider must be stored in database");

  // Clean up
  ProviderRepository.deleteProvider(canonicalId);
});

test("Unit - ensureProviderExists for unknown/custom provider creates valid fallback config", () => {
  const customId = `test_custom_prov_${Date.now()}`;

  assert.equal(ProviderRepository.getProviderById(customId), undefined);

  const fallback = ProviderRepository.ensureProviderExists(customId, "Custom Test Gateway");
  assert.equal(fallback.id, customId);
  assert.equal(fallback.name, "Custom Test Gateway");
  assert.equal(fallback.format, "openai");
  assert.equal(fallback.baseUrl, "https://api.openai.com");
  assert.equal(fallback.isActive, true);

  const inDb = ProviderRepository.getProviderById(customId);
  assert.ok(inDb);
  assert.equal(inDb.name, "Custom Test Gateway");

  // Clean up
  ProviderRepository.deleteProvider(customId);
});

test("Unit - ensureProviderExists is idempotent and preserves custom modifications", () => {
  const testId = `test_custom_mod_${Date.now()}`;

  // Create provider with custom priority and custom headers
  ProviderRepository.saveProvider({
    id: testId,
    name: "Custom Prioritized",
    baseUrl: "https://custom.endpoint.com",
    format: "anthropic",
    isActive: true,
    priority: 99,
    models: ["model-custom-1"],
    customHeaders: { "X-Custom-Auth": "secret123" },
    createdAt: Date.now(),
    updatedAt: Date.now(),
  });

  // Call ensureProviderExists
  const retrieved = ProviderRepository.ensureProviderExists(testId);
  assert.equal(retrieved.id, testId);
  assert.equal(retrieved.priority, 99, "Must preserve existing priority");
  assert.equal(retrieved.customHeaders?.["X-Custom-Auth"], "secret123", "Must preserve custom headers");
  assert.equal(retrieved.format, "anthropic", "Must preserve custom format");

  // Clean up
  ProviderRepository.deleteProvider(testId);
});

test("Unit - addAccount directly on non-existent provider succeeds without FOREIGN KEY error", () => {
  const providerId = `test_fresh_prov_${Date.now()}`;
  const accountId = `test_fresh_acc_${Date.now()}`;

  // Verify provider does NOT exist initially
  assert.equal(ProviderRepository.getProviderById(providerId), undefined);

  // Directly call addAccount - should auto-ensure provider and insert account without foreign key error
  assert.doesNotThrow(() => {
    ProviderRepository.addAccount({
      id: accountId,
      providerId,
      name: "Auto-Ensured Account",
      rawApiKey: "sk-secret-key-12345",
      providerSpecificData: { region: "us-east-1" },
    });
  });

  // Provider must now exist in DB
  const provider = ProviderRepository.getProviderById(providerId);
  assert.ok(provider, "Provider must have been created automatically");

  // Account must exist and be linked to provider
  const account = ProviderRepository.getAccountById(accountId);
  assert.ok(account, "Account must exist");
  assert.equal(account.providerId, providerId);
  assert.equal(account.rawApiKey, "sk-secret-key-12345");
  assert.equal(account.name, "Auto-Ensured Account");
  assert.equal(account.providerSpecificData?.region, "us-east-1");

  // Clean up
  ProviderRepository.deleteAccount(accountId);
  ProviderRepository.deleteProvider(providerId);
});

test("Unit - addAccount directly with registry provider ID auto-seeds from registry", () => {
  const providerId = "codex";
  const accountId = `test_codex_acc_${Date.now()}`;

  try {
    ProviderRepository.deleteAccount(accountId);
    ProviderRepository.deleteProvider(providerId);
  } catch {}

  assert.equal(ProviderRepository.getProviderById(providerId), undefined);

  // Add account for codex without prior saveProvider call
  ProviderRepository.addAccount({
    id: accountId,
    providerId,
    name: "Codex Work Account",
    rawApiKey: "token_abc_123",
  });

  // Check provider was auto-seeded with codex registry defaults
  const provider = ProviderRepository.getProviderById(providerId);
  assert.ok(provider, "Codex provider should be auto-created");
  const reg = getRegistryProvider("codex");
  assert.equal(provider.baseUrl, reg?.baseUrl);
  assert.ok(provider.models.length > 0);

  // Clean up
  ProviderRepository.deleteAccount(accountId);
  ProviderRepository.deleteProvider(providerId);
});

test("Unit - bulkAddAccounts across multiple non-existent providers succeeds", () => {
  const provA = `bulk_prov_a_${Date.now()}`;
  const provB = `bulk_prov_b_${Date.now()}`;
  const acc1 = `acc_1_${Date.now()}`;
  const acc2 = `acc_2_${Date.now()}`;

  assert.equal(ProviderRepository.getProviderById(provA), undefined);
  assert.equal(ProviderRepository.getProviderById(provB), undefined);

  assert.doesNotThrow(() => {
    ProviderRepository.bulkAddAccounts([
      { id: acc1, providerId: provA, name: "Account A1", rawApiKey: "key-a1" },
      { id: acc2, providerId: provB, name: "Account B1", rawApiKey: "key-b1" },
    ]);
  });

  assert.ok(ProviderRepository.getProviderById(provA));
  assert.ok(ProviderRepository.getProviderById(provB));
  assert.equal(ProviderRepository.getAccountById(acc1)?.rawApiKey, "key-a1");
  assert.equal(ProviderRepository.getAccountById(acc2)?.rawApiKey, "key-b1");

  // Clean up
  ProviderRepository.deleteAccount(acc1);
  ProviderRepository.deleteAccount(acc2);
  ProviderRepository.deleteProvider(provA);
  ProviderRepository.deleteProvider(provB);
});

test("Integration - POST /api/providers/:id/accounts auto-provisions non-existent provider and creates account", async () => {
  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", () => resolve()));
  const address = server.address() as { port: number };
  const baseUrl = `http://127.0.0.1:${address.port}`;

  const nonExistentProvId = `rest_prov_${Date.now()}`;
  let createdAccountId = "";

  try {
    assert.equal(ProviderRepository.getProviderById(nonExistentProvId), undefined);

    const res = await fetch(`${baseUrl}/api/providers/${nonExistentProvId}/accounts`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "Rest API Created Account",
        apiKey: "sk-rest-test-key",
        providerSpecificData: { client: "kiro-ide" },
      }),
    });

    assert.equal(res.status, 200);
    const data = (await res.json()) as any;
    assert.equal(data.success, true);
    assert.ok(data.id);
    createdAccountId = data.id;

    // Both provider and account must now exist in DB
    const provInDb = ProviderRepository.getProviderById(nonExistentProvId);
    assert.ok(provInDb, "Provider must be automatically ensured");

    const accInDb = ProviderRepository.getAccountById(createdAccountId);
    assert.ok(accInDb, "Account must be inserted");
    assert.equal(accInDb.rawApiKey, "sk-rest-test-key");
    assert.equal(accInDb.providerSpecificData?.client, "kiro-ide");
  } finally {
    if (createdAccountId) {
      try { ProviderRepository.deleteAccount(createdAccountId); } catch {}
    }
    try { ProviderRepository.deleteProvider(nonExistentProvId); } catch {}
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

test("Integration - POST /api/providers/:id/accounts/bulk auto-provisions non-existent provider", async () => {
  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", () => resolve()));
  const address = server.address() as { port: number };
  const baseUrl = `http://127.0.0.1:${address.port}`;

  const bulkProvId = `rest_bulk_prov_${Date.now()}`;

  try {
    assert.equal(ProviderRepository.getProviderById(bulkProvId), undefined);

    const res = await fetch(`${baseUrl}/api/providers/${bulkProvId}/accounts/bulk`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        accounts: [
          { name: "Bulk Acc 1", apiKey: "key-1" },
          { name: "Bulk Acc 2", apiKey: "key-2" },
        ],
      }),
    });

    assert.equal(res.status, 200);
    const data = (await res.json()) as any;
    assert.equal(data.success, true);
    assert.equal(data.count, 2);

    const prov = ProviderRepository.getProviderById(bulkProvId);
    assert.ok(prov, "Provider must be automatically ensured");

    const accounts = ProviderRepository.getAllAccountsByProvider(bulkProvId);
    assert.equal(accounts.length, 2);
  } finally {
    const accs = ProviderRepository.getAllAccountsByProvider(bulkProvId);
    for (const a of accs) {
      try { ProviderRepository.deleteAccount(a.id); } catch {}
    }
    try { ProviderRepository.deleteProvider(bulkProvId); } catch {}
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

test("Unit - ProviderRepository.seedDefaultProviders pre-seeds core coding providers", () => {
  ProviderRepository.seedDefaultProviders();

  const coreProviders = ["claude", "cursor", "codex", "kiro", "antigravity", "github", "openai", "deepseek", "gemini"];
  for (const id of coreProviders) {
    const prov = ProviderRepository.getProviderById(id);
    assert.ok(prov, `Core provider '${id}' should be seeded and present in database`);
    assert.ok(prov.models.length > 0, `Provider '${id}' should have models defined`);
  }
});
