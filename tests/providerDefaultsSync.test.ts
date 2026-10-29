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

test("Unit - user can adjust default header ahead of official release and override persists across syncs", () => {
  const providerId = "commandcode";
  const reg = getRegistryProvider(providerId)!;

  // Upstream changed version to 1.95.0, user manually adjusts x-command-code-version
  ProviderRepository.saveProvider({
    id: providerId,
    name: "Command Code Pre-Release Fix",
    baseUrl: reg.baseUrl,
    format: reg.format as any,
    isActive: true,
    priority: 10,
    models: reg.models.map((m) => m.id),
    customHeaders: {
      "x-command-code-version": "1.95.0-hotfix-by-user",
    },
    createdAt: Date.now(),
    updatedAt: Date.now(),
  });

  // Server reboot occurs and triggers syncRegistryDefaults
  ProviderRepository.syncRegistryDefaults();

  // User's hotfix must persist in DB and NOT be wiped
  const inDb = ProviderRepository.getProviderById(providerId);
  assert.ok(inDb);
  assert.equal(
    inDb.customHeaders?.["x-command-code-version"],
    "1.95.0-hotfix-by-user",
    "User manual hotfix on default header must persist across syncs"
  );

  // Runtime requests must send the user's hotfix value
  const withDefaults = ProviderRepository.getProviderWithDefaults(providerId);
  assert.ok(withDefaults);
  assert.equal(
    withDefaults.customHeaders["x-command-code-version"],
    "1.95.0-hotfix-by-user",
    "Effective headers must send user hotfix"
  );
  assert.equal(
    withDefaults.customHeaders["User-Agent"],
    reg.defaultHeaders["User-Agent"],
    "Unmodified default headers must still be active from system defaults"
  );

  // When user later removes/reverts the override, it cleanly falls back to system default
  ProviderRepository.saveProvider({
    ...inDb,
    customHeaders: {},
  });
  const reverted = ProviderRepository.getProviderWithDefaults(providerId);
  assert.ok(reverted);
  assert.equal(
    reverted.customHeaders["x-command-code-version"],
    reg.defaultHeaders["x-command-code-version"],
    "Must revert cleanly to system default when override is removed"
  );
});

test("Unit - user can explicitly disable/omit a default header and it is not sent in outgoing requests", () => {
  const providerId = "commandcode";
  const reg = getRegistryProvider(providerId)!;
  assert.ok(reg.defaultHeaders["x-taste-learning"], "CommandCode must define x-taste-learning by default");

  // User explicitly disables x-taste-learning (e.g. upstream deprecated it)
  ProviderRepository.saveProvider({
    id: providerId,
    name: "Command Code Disabled Header",
    baseUrl: reg.baseUrl,
    format: reg.format as any,
    isActive: true,
    priority: 10,
    models: reg.models.map((m) => m.id),
    customHeaders: {
      "x-taste-learning": "", // Empty string means omitted/disabled
    },
    createdAt: Date.now(),
    updatedAt: Date.now(),
  });

  // Server reboot occurs and triggers syncRegistryDefaults
  ProviderRepository.syncRegistryDefaults();

  // The disabled marker must be preserved in DB across syncs
  const inDb = ProviderRepository.getProviderById(providerId);
  assert.ok(inDb);
  assert.equal(inDb.customHeaders?.["x-taste-learning"], "");

  // In effective headers, x-taste-learning must be COMPLETELY OMITTED!
  const withDefaults = ProviderRepository.getProviderWithDefaults(providerId);
  assert.ok(withDefaults);
  assert.equal(
    withDefaults.customHeaders["x-taste-learning"],
    undefined,
    "x-taste-learning must be deleted from effective outgoing headers"
  );
  assert.equal(
    withDefaults.customHeaders["User-Agent"],
    reg.defaultHeaders["User-Agent"],
    "Other default headers must remain intact"
  );
  assert.equal(
    withDefaults.customHeaders["x-command-code-version"],
    reg.defaultHeaders["x-command-code-version"],
    "Other default headers must remain intact"
  );

  // When user re-enables it (removes the disable override)
  ProviderRepository.saveProvider({
    ...inDb,
    customHeaders: {},
  });
  const reenabled = ProviderRepository.getProviderWithDefaults(providerId);
  assert.ok(reenabled);
  assert.equal(
    reenabled.customHeaders["x-taste-learning"],
    reg.defaultHeaders["x-taste-learning"],
    "Default header should be restored when disable override is cleared"
  );
});
