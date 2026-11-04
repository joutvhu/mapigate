process.env.NODE_ENV = "test";

import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import app from "../src/server/index.js";
import {
  SettingsRepository,
  DEFAULT_ENDPOINT_SETTINGS,
} from "../src/storage/repositories/settingsRepo.js";
import { ComboRepository } from "../src/storage/repositories/comboRepo.js";

test("Unit - SettingsRepository endpoint settings and gateway API keys", () => {
  // 1. Reset endpoint settings to defaults
  SettingsRepository.setSetting("endpointSettings", DEFAULT_ENDPOINT_SETTINGS);
  const initial = SettingsRepository.getEndpointSettings();
  assert.equal(initial.host, "127.0.0.1");
  assert.equal(initial.port, 20128);
  assert.equal(initial.requireApiKey, false);
  assert.equal(initial.proxyUrl, "");
  assert.deepEqual(initial.customHeaders, {});

  // 2. Update and persist endpoint settings
  const updated = SettingsRepository.setEndpointSettings({
    host: "0.0.0.0",
    port: 20129,
    requireApiKey: true,
    proxyUrl: "http://127.0.0.1:7890",
    customHeaders: { "X-Test-Env": "local-test", "X-Custom-Client": "mapigate-test" },
  });
  assert.equal(updated.host, "0.0.0.0");
  assert.equal(updated.port, 20129);
  assert.equal(updated.requireApiKey, true);
  assert.equal(updated.proxyUrl, "http://127.0.0.1:7890");
  assert.equal(updated.customHeaders?.["X-Test-Env"], "local-test");

  // Verify re-fetch persistence
  const reloaded = SettingsRepository.getEndpointSettings();
  assert.equal(reloaded.host, "0.0.0.0");
  assert.equal(reloaded.port, 20129);
  assert.equal(reloaded.requireApiKey, true);
  assert.equal(reloaded.proxyUrl, "http://127.0.0.1:7890");
  assert.equal(reloaded.customHeaders?.["X-Custom-Client"], "mapigate-test");

  // 3. Reset back to defaults
  SettingsRepository.setEndpointSettings(DEFAULT_ENDPOINT_SETTINGS);
  const reset = SettingsRepository.getEndpointSettings();
  assert.equal(reset.host, "127.0.0.1");
  assert.equal(reset.port, 20128);
  assert.equal(reset.requireApiKey, false);

  // 4. Gateway API Keys lifecycle
  // Reset keys
  SettingsRepository.setSetting("gatewayApiKeys", []);
  assert.deepEqual(SettingsRepository.getGatewayApiKeys(), []);

  // Create key
  const key1 = SettingsRepository.createGatewayApiKey("Cursor Dev");
  assert.ok(key1.id.startsWith("key_"));
  assert.ok(key1.key.startsWith("sk-rt-"));
  assert.equal(key1.name, "Cursor Dev");
  assert.equal(key1.isActive, true);
  assert.ok(key1.createdAt > 0);

  // Create second key
  const key2 = SettingsRepository.createGatewayApiKey("Claude Code CLI");
  assert.equal(key2.name, "Claude Code CLI");

  const allKeys = SettingsRepository.getGatewayApiKeys();
  assert.equal(allKeys.length, 2);
  assert.ok(allKeys.some((k) => k.id === key1.id));
  assert.ok(allKeys.some((k) => k.id === key2.id));

  // Toggle active status
  const toggledOff = SettingsRepository.toggleGatewayApiKey(key1.id);
  assert.ok(toggledOff);
  assert.equal(toggledOff.isActive, false);

  const toggledOn = SettingsRepository.toggleGatewayApiKey(key1.id);
  assert.ok(toggledOn);
  assert.equal(toggledOn.isActive, true);

  // Non-existent key toggle returns undefined
  const toggleMissing = SettingsRepository.toggleGatewayApiKey("non-existent-key-1234");
  assert.equal(toggleMissing, undefined);

  // Delete key
  const deleted = SettingsRepository.deleteGatewayApiKey(key1.id);
  assert.equal(deleted, true);

  const keysAfterDelete = SettingsRepository.getGatewayApiKeys();
  assert.equal(keysAfterDelete.length, 1);
  assert.equal(keysAfterDelete[0].id, key2.id);

  // Non-existent delete returns false
  const deleteMissing = SettingsRepository.deleteGatewayApiKey("non-existent-key-1234");
  assert.equal(deleteMissing, false);
});

test("Integration - Endpoint Settings & Gateway API Keys REST Endpoints", async () => {
  // Ensure clean state
  SettingsRepository.setSetting("endpointSettings", DEFAULT_ENDPOINT_SETTINGS);
  SettingsRepository.setSetting("gatewayApiKeys", []);

  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", () => resolve()));
  const address = server.address() as { port: number };
  const baseUrl = `http://127.0.0.1:${address.port}`;

  try {
    // 1. GET /api/settings/endpoint
    const getRes = await fetch(`${baseUrl}/api/settings/endpoint`);
    assert.equal(getRes.status, 200);
    const initialConfig = (await getRes.json()) as any;
    assert.equal(initialConfig.host, "127.0.0.1");
    assert.equal(initialConfig.port, 20128);
    assert.equal(initialConfig.requireApiKey, false);

    // 2. PUT /api/settings/endpoint
    const putRes = await fetch(`${baseUrl}/api/settings/endpoint`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        host: "0.0.0.0",
        port: 20129,
        requireApiKey: true,
        proxyUrl: "http://127.0.0.1:8888",
        customHeaders: { "X-Custom-Env": "testing" },
      }),
    });
    assert.equal(putRes.status, 200);
    const updatedConfig = (await putRes.json()) as any;
    assert.equal(updatedConfig.host, "0.0.0.0");
    assert.equal(updatedConfig.port, 20129);
    assert.equal(updatedConfig.requireApiKey, true);
    assert.equal(updatedConfig.proxyUrl, "http://127.0.0.1:8888");
    assert.equal(updatedConfig.customHeaders?.["X-Custom-Env"], "testing");

    // Verify GET reflects update
    const reGetRes = await fetch(`${baseUrl}/api/settings/endpoint`);
    const reGetData = (await reGetRes.json()) as any;
    assert.equal(reGetData.host, "0.0.0.0");
    assert.equal(reGetData.port, 20129);

    // 3. GET /api/settings/endpoint/keys (initially empty)
    const getKeysRes = await fetch(`${baseUrl}/api/settings/endpoint/keys`);
    assert.equal(getKeysRes.status, 200);
    const keysList = (await getKeysRes.json()) as any[];
    assert.deepEqual(keysList, []);

    // 4. POST /api/settings/endpoint/keys - Create key
    const createKeyRes = await fetch(`${baseUrl}/api/settings/endpoint/keys`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Cline Extension Key" }),
    });
    assert.equal(createKeyRes.status, 201);
    const createdKey = (await createKeyRes.json()) as any;
    assert.ok(createdKey.id.startsWith("key_"));
    assert.ok(createdKey.key.startsWith("sk-rt-"));
    assert.equal(createdKey.name, "Cline Extension Key");
    assert.equal(createdKey.isActive, true);
    const keyId = createdKey.id;

    // 5. PATCH /api/settings/endpoint/keys/:id/toggle
    const toggleRes = await fetch(`${baseUrl}/api/settings/endpoint/keys/${keyId}/toggle`, {
      method: "PATCH",
    });
    assert.equal(toggleRes.status, 200);
    const toggledData = (await toggleRes.json()) as any;
    assert.equal(toggledData.isActive, false);

    // Toggle 404
    const toggle404 = await fetch(`${baseUrl}/api/settings/endpoint/keys/non-existent-xyz/toggle`, {
      method: "PATCH",
    });
    assert.equal(toggle404.status, 404);

    // 6. DELETE /api/settings/endpoint/keys/:id
    const deleteRes = await fetch(`${baseUrl}/api/settings/endpoint/keys/${keyId}`, {
      method: "DELETE",
    });
    assert.equal(deleteRes.status, 200);
    const deleteData = (await deleteRes.json()) as any;
    assert.equal(deleteData.success, true);

    // Delete 404
    const delete404 = await fetch(`${baseUrl}/api/settings/endpoint/keys/non-existent-xyz`, {
      method: "DELETE",
    });
    assert.equal(delete404.status, 404);

    // Verify key list is now empty
    const verifyKeysRes = await fetch(`${baseUrl}/api/settings/endpoint/keys`);
    const remainingKeys = (await verifyKeysRes.json()) as any[];
    assert.equal(remainingKeys.length, 0);

    // Reset settings back to defaults
    SettingsRepository.setEndpointSettings(DEFAULT_ENDPOINT_SETTINGS);
  } finally {
    server.close();
  }
});

test("Integration - Combo CRUD: Create, Update models/order/strategy, and Delete", async () => {
  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", () => resolve()));
  const address = server.address() as { port: number };
  const baseUrl = `http://127.0.0.1:${address.port}`;

  try {
    const testComboName = "crud-combo-" + Date.now();

    // 1. Create combo
    const createRes = await fetch(`${baseUrl}/api/combos`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: testComboName,
        models: ["provider-a/model-1", "provider-b/model-2"],
        strategy: "fallback",
      }),
    });
    assert.equal(createRes.status, 201);
    const createdCombo = (await createRes.json()) as any;
    assert.equal(createdCombo.name, testComboName);
    assert.equal(createdCombo.strategy, "fallback");
    assert.deepEqual(createdCombo.models, ["provider-a/model-1", "provider-b/model-2"]);
    const comboId = createdCombo.id;

    // 2. Update combo: reorder models and change strategy to round-robin
    const reorderedModels = ["provider-b/model-2", "provider-a/model-1", "provider-c/model-3"];
    const updateRes = await fetch(`${baseUrl}/api/combos/${comboId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        strategy: "round-robin",
        models: reorderedModels,
      }),
    });
    assert.equal(updateRes.status, 200);
    const updatedCombo = (await updateRes.json()) as any;
    assert.equal(updatedCombo.strategy, "round-robin");
    assert.deepEqual(updatedCombo.models, reorderedModels);

    // Verify GET returns updated data
    const getRes = await fetch(`${baseUrl}/api/combos/${comboId}`);
    assert.equal(getRes.status, 200);
    const fetchedCombo = (await getRes.json()) as any;
    assert.equal(fetchedCombo.strategy, "round-robin");
    assert.deepEqual(fetchedCombo.models, reorderedModels);

    // 3. Delete combo
    const deleteRes = await fetch(`${baseUrl}/api/combos/${comboId}`, {
      method: "DELETE",
    });
    assert.equal(deleteRes.status, 200);
    const deleteData = (await deleteRes.json()) as any;
    assert.equal(deleteData.success, true);

    // Verify GET returns 404 after deletion
    const getAfterDeleteRes = await fetch(`${baseUrl}/api/combos/${comboId}`);
    assert.equal(getAfterDeleteRes.status, 404);

    // Delete non-existent combo returns 404
    const deleteNonExistent = await fetch(`${baseUrl}/api/combos/non-existent-xyz`, {
      method: "DELETE",
    });
    assert.equal(deleteNonExistent.status, 404);
  } finally {
    server.close();
  }
});

test("Integration - Settings System Info GET /api/settings/system-info", async () => {
  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", () => resolve()));
  const address = server.address() as { port: number };
  const baseUrl = `http://127.0.0.1:${address.port}`;

  try {
    const res = await fetch(`${baseUrl}/api/settings/system-info`);
    assert.equal(res.status, 200);
    const data = (await res.json()) as any;
    assert.ok(typeof data.dataDir === "string" && data.dataDir.length > 0);
    assert.ok(typeof data.dbPath === "string" && data.dbPath.length > 0);
    assert.ok(data.dbPath.endsWith("mapigate.sqlite"));
    assert.ok(typeof data.isDevelopmentMode === "boolean");
    assert.equal(data.appName, "Mapigate");
    assert.ok(typeof data.version === "string" && data.version.length > 0);
  } finally {
    server.close();
  }
});


test("Security - requireApiKey fails closed (401) when enabled even with 0 active keys", async () => {
  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", () => resolve()));
  const address = server.address() as { port: number };
  const baseUrl = `http://127.0.0.1:${address.port}`;

  try {
    // 1. Enable requireApiKey with NO active keys in database
    SettingsRepository.setEndpointSettings({
      host: "127.0.0.1",
      port: 20128,
      requireApiKey: true,
      proxyUrl: "",
      customHeaders: {},
    });

    // Clear any gateway keys
    const allKeys = SettingsRepository.getGatewayApiKeys();
    for (const k of allKeys) {
      SettingsRepository.deleteGatewayApiKey(k.id);
    }

    // 2. Request /v1/chat/completions without key -> MUST be 401 Unauthorized
    const res = await fetch(`${baseUrl}/v1/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model: "gpt-4o", messages: [{ role: "user", content: "Hi" }] }),
    });

    assert.equal(res.status, 401);
    const body = (await res.json()) as any;
    assert.equal(body.error?.type, "authentication_error");

    // 3. Create an active key and verify it works
    const created = SettingsRepository.createGatewayApiKey("Test Active Key");
    const authedRes = await fetch(`${baseUrl}/v1/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${created.key}`,
      },
      body: JSON.stringify({ model: "non-existent-model", messages: [{ role: "user", content: "Hi" }] }),
    });

    // Should pass gateway auth (status is 503 for non-existent model, NOT 401 gateway auth error)
    assert.notEqual(authedRes.status, 401);

    // Clean up
    SettingsRepository.deleteGatewayApiKey(created.id);
    SettingsRepository.setEndpointSettings(DEFAULT_ENDPOINT_SETTINGS);
  } finally {
    server.close();
  }
});
