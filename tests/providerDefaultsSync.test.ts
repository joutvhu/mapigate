process.env.NODE_ENV = "test";

import test from "node:test";
import assert from "node:assert/strict";
import { ProviderRepository } from "../src/storage/repositories/providerRepo.js";
import { getRegistryProvider } from "../src/shared/constants/providerRegistry.js";

test("Unit - getProviderWithDefaults dynamically resolves latest defaultHeaders from metadata registry", () => {
  const providerId = "commandcode";
  const reg = getRegistryProvider(providerId);
  assert.ok(reg, "CommandCode must exist in registry");
  assert.ok(reg.defaultHeaders["x-command-code-version"], "CommandCode must define x-command-code-version");

  // Reset provider in DB
  try {
    ProviderRepository.deleteProvider(providerId);
  } catch {}

  // Ensure provider exists (seeded without hardcoding static defaultHeaders into customHeaders)
  const ensured = ProviderRepository.ensureProviderExists(providerId);
  assert.equal(ensured.id, providerId);

  // In DB, customHeaders should be clean/empty by default
  const inDb = ProviderRepository.getProviderById(providerId);
  assert.ok(inDb);
  assert.deepEqual(inDb.customHeaders, {});

  // getProviderWithDefaults must return effective headers containing registry defaultHeaders
  const withDefaults = ProviderRepository.getProviderWithDefaults(providerId);
  assert.ok(withDefaults);
  assert.equal(
    withDefaults.customHeaders["x-command-code-version"],
    reg.defaultHeaders["x-command-code-version"],
    "Effective headers must automatically include x-command-code-version from metadata"
  );
  assert.equal(
    withDefaults.customHeaders["User-Agent"],
    reg.defaultHeaders["User-Agent"],
    "Effective headers must automatically include User-Agent from metadata"
  );
  assert.deepEqual(withDefaults.defaultHeaders, reg.defaultHeaders);
  assert.deepEqual(withDefaults.userCustomHeaders, {});
});

test("Unit - syncRegistryDefaults migrates legacy seeded defaultHeaders from SQLite custom_headers", () => {
  const providerId = "commandcode";
  const reg = getRegistryProvider(providerId)!;

  // Simulate an older installation where defaultHeaders were baked into custom_headers
  const legacyHeaders = {
    ...reg.defaultHeaders,
    "x-command-code-version": "1.80.0-legacy", // Old version from past release
  };

  ProviderRepository.saveProvider({
    id: providerId,
    name: "Command Code Legacy",
    baseUrl: reg.baseUrl,
    format: "openai", // Old format
    isActive: true,
    priority: 10,
    models: ["commandcode-v1"],
    customHeaders: legacyHeaders,
    createdAt: Date.now() - 100000,
    updatedAt: Date.now() - 100000,
  });

  // Verify DB holds old legacy values
  const beforeSync = ProviderRepository.getProviderById(providerId);
  assert.equal(beforeSync?.customHeaders?.["x-command-code-version"], "1.80.0-legacy");
  assert.equal(beforeSync?.format, "openai");

  // Run syncRegistryDefaults (runs automatically on every server boot)
  ProviderRepository.syncRegistryDefaults();

  // After sync, DB customHeaders must be cleaned because all keys were default headers
  const afterSync = ProviderRepository.getProviderById(providerId);
  assert.ok(afterSync);
  assert.deepEqual(afterSync.customHeaders, {}, "Legacy default headers must be stripped from DB custom_headers");
  assert.equal(afterSync.format, reg.format, "Provider format should be updated to match current registry format");

  // Effective headers must now reflect the new version from code
  const withDefaults = ProviderRepository.getProviderWithDefaults(providerId);
  assert.ok(withDefaults);
  assert.equal(
    withDefaults.customHeaders["x-command-code-version"],
    reg.defaultHeaders["x-command-code-version"],
    "Must automatically apply latest version from metadata.ts without manual user reset"
  );
});

test("Unit - syncRegistryDefaults preserves user-added custom headers while syncing defaults", () => {
  const providerId = "commandcode";
  const reg = getRegistryProvider(providerId)!;

  // Simulate a user who added a genuine custom header alongside defaults
  const userHeaders = {
    ...reg.defaultHeaders,
    "X-User-Custom-Token": "my-secret-token-12345",
  };

  ProviderRepository.saveProvider({
    id: providerId,
    name: "Command Code User Customized",
    baseUrl: reg.baseUrl,
    format: reg.format as any,
    isActive: true,
    priority: 10,
    models: reg.models.map((m) => m.id),
    customHeaders: userHeaders,
    createdAt: Date.now() - 100000,
    updatedAt: Date.now() - 100000,
  });

  // Run syncRegistryDefaults
  ProviderRepository.syncRegistryDefaults();

  // User custom header must be strictly preserved, while identical default keys are cleaned
  const inDb = ProviderRepository.getProviderById(providerId);
  assert.ok(inDb);
  assert.equal(
    inDb.customHeaders?.["X-User-Custom-Token"],
    "my-secret-token-12345",
    "User custom header must be preserved in DB"
  );

  // Effective headers merged at runtime must include both the latest defaults and the user's custom header
  const withDefaults = ProviderRepository.getProviderWithDefaults(providerId);
  assert.ok(withDefaults);
  assert.equal(withDefaults.customHeaders["X-User-Custom-Token"], "my-secret-token-12345");
  assert.equal(withDefaults.customHeaders["x-command-code-version"], reg.defaultHeaders["x-command-code-version"]);
});

test("Unit - user custom header overrides default header if explicitly specified", () => {
  const providerId = "commandcode";
  const reg = getRegistryProvider(providerId)!;

  // User explicitly wants to override User-Agent
  ProviderRepository.saveProvider({
    id: providerId,
    name: "Command Code Custom UA",
    baseUrl: reg.baseUrl,
    format: reg.format as any,
    isActive: true,
    priority: 10,
    models: reg.models.map((m) => m.id),
    customHeaders: {
      "User-Agent": "Custom-Agent-Override/9.9.9",
    },
    createdAt: Date.now(),
    updatedAt: Date.now(),
  });

  const withDefaults = ProviderRepository.getProviderWithDefaults(providerId);
  assert.ok(withDefaults);
  assert.equal(
    withDefaults.customHeaders["User-Agent"],
    "Custom-Agent-Override/9.9.9",
    "Explicit user override must take precedence over default header"
  );
  assert.equal(
    withDefaults.customHeaders["x-command-code-version"],
    reg.defaultHeaders["x-command-code-version"],
    "Other default headers must still be present"
  );
});
