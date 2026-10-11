process.env.NODE_ENV = "test";

import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import app from "../src/server/index.js";
import { SettingsRepository, DEFAULT_FALLBACK_MODEL, DEFAULT_CAPACITY_ADAPTER_SETTINGS } from "../src/storage/repositories/settingsRepo.js";
import { ComboRepository } from "../src/storage/repositories/comboRepo.js";
import { buildPresetItems, buildClaudePresetItems, buildCursorPresetItems } from "../src/core/router/comboPresets.js";

test("Unit - SettingsRepository key-value and capacityAdapter persistence", () => {
  // Reset settings for idempotent runs
  SettingsRepository.setSetting("capacityAdapter", DEFAULT_CAPACITY_ADAPTER_SETTINGS);

  // 1. Key-value get/set
  SettingsRepository.setSetting("test_key", { foo: "bar", num: 42 });
  const val = SettingsRepository.getSetting<{ foo: string; num: number }>("test_key");
  assert.deepEqual(val, { foo: "bar", num: 42 });

  // 2. Capacity adapter defaults
  const defaults = SettingsRepository.getCapacityAdapterSettings();
  assert.equal(defaults.vision.enabled, false);
  assert.equal(defaults.vision.roundRobin, false);
  assert.deepEqual(defaults.vision.models, []);
  assert.equal(defaults.audioInput.enabled, false);
  assert.equal(defaults.audioInput.roundRobin, false);
  assert.deepEqual(defaults.audioInput.models, []);

  // 3. Set partial capacity adapter
  const updated = SettingsRepository.setCapacityAdapterSettings({
    vision: {
      enabled: false,
      roundRobin: true,
      models: ["test-provider/vision-model-1"],
    },
  });
  assert.equal(updated.vision.enabled, false);
  assert.equal(updated.vision.roundRobin, true);
  assert.deepEqual(updated.vision.models, ["test-provider/vision-model-1"]);
  // audioInput should remain untouched
  assert.equal(updated.audioInput.enabled, false);

  // 4. Reload from DB confirms persistence
  const reloaded = SettingsRepository.getCapacityAdapterSettings();
  assert.equal(reloaded.vision.enabled, false);
  assert.equal(reloaded.vision.roundRobin, true);
  assert.deepEqual(reloaded.vision.models, ["test-provider/vision-model-1"]);

  // Reset back to defaults for subsequent tests
  SettingsRepository.setSetting("capacityAdapter", DEFAULT_CAPACITY_ADAPTER_SETTINGS);
});

test("Unit - ComboPresets generation", () => {
  // 1. Claude presets include default aliases (sonnet, opus, haiku)
  const claudePresets = buildClaudePresetItems();
  assert.ok(claudePresets.length > 0);
  const names = claudePresets.map((p) => p.name);
  assert.ok(names.includes("sonnet"));
  assert.ok(names.includes("opus"));
  assert.ok(names.includes("haiku"));
  assert.ok(names.includes("default"));
  assert.ok(names.includes("opusplan"));

  // Verify all models in claude presets use the "claude/" prefix instead of "cc/"
  for (const preset of claudePresets) {
    for (const model of preset.models) {
      assert.ok(!model.startsWith("cc/"), `Model '${model}' should not have cc/ prefix`);
      assert.ok(model.startsWith("claude/"), `Model '${model}' should start with claude/ prefix`);
    }
  }

  const defaultPreset = claudePresets.find((p) => p.name === "default");
  assert.deepEqual(defaultPreset?.models, ["claude/claude-sonnet-4-6"]);

  const opusplanPreset = claudePresets.find((p) => p.name === "opusplan");
  assert.deepEqual(opusplanPreset?.models, ["claude/claude-opus-4-6-thinking"]);

  // 2. Cursor presets
  const cursorPresets = buildCursorPresetItems();
  assert.ok(Array.isArray(cursorPresets));

  // Cursor presets with live models use "cursor/" prefix instead of "cu/"
  const cursorLivePresets = buildCursorPresetItems({
    liveModels: [{ id: "cursor-small" }, { id: "claude-3.5-sonnet" }],
  });
  assert.equal(cursorLivePresets.length, 2);
  for (const preset of cursorLivePresets) {
    for (const model of preset.models) {
      assert.ok(!model.startsWith("cu/"), `Model '${model}' should not have cu/ prefix`);
      assert.ok(model.startsWith("cursor/"), `Model '${model}' should start with cursor/ prefix`);
    }
  }

  // 3. buildPresetItems with existing names check
  const preview = buildPresetItems("claude", { existingNames: ["sonnet"] });
  const sonnetItem = preview.find((i) => i.name === "sonnet");
  assert.ok(sonnetItem);
  assert.equal(sonnetItem.exists, true);

  const opusItem = preview.find((i) => i.name === "opus");
  assert.ok(opusItem);
  assert.equal(opusItem.exists, false);

  // Invalid source
  const invalid = buildPresetItems("non-existent");
  assert.deepEqual(invalid, []);
});

test("Unit - ComboRepository CRUD, validation, toggle, and seeding", () => {
  // Combos are not auto-seeded on query
  const initialCombos = ComboRepository.getAllCombos();
  assert.ok(Array.isArray(initialCombos));

  // Explicit seeding works on demand
  ComboRepository.seedInitialPresets();
  const seededCombos = ComboRepository.getAllCombos();
  assert.ok(seededCombos.length > 0);

  // Validation: empty name throws
  assert.throws(() => {
    ComboRepository.saveCombo({ name: "", models: ["test/m1"] });
  }, /Combo name is required/);

  // Validation: invalid characters throw
  assert.throws(() => {
    ComboRepository.saveCombo({ name: "invalid name with spaces", models: ["test/m1"] });
  }, /Name can only contain letters/);

  // Save new combo
  const testName = "test-combo-unit-" + Date.now();
  const created = ComboRepository.saveCombo({
    name: testName,
    models: ["provider1/model-a", "provider2/model-b"],
    strategy: "fallback",
  });
  assert.equal(created.name, testName);
  assert.equal(created.strategy, "fallback");
  assert.equal(created.isActive, true);
  assert.equal(created.models.length, 2);

  // Get by ID and by Name
  const byId = ComboRepository.getComboById(created.id);
  assert.ok(byId);
  assert.equal(byId.name, testName);

  const byName = ComboRepository.getComboByName(testName);
  assert.ok(byName);
  assert.equal(byName.id, created.id);

  // Toggle active
  const toggled = ComboRepository.toggleCombo(created.id);
  assert.ok(toggled);
  assert.equal(toggled.isActive, false);

  const toggledBack = ComboRepository.toggleCombo(created.id);
  assert.ok(toggledBack);
  assert.equal(toggledBack.isActive, true);

  // Update combo
  const updated = ComboRepository.updateCombo(created.id, {
    strategy: "fusion",
    models: ["provider1/model-c"],
  });
  assert.ok(updated);
  assert.equal(updated.strategy, "fusion");
  assert.deepEqual(updated.models, ["provider1/model-c"]);

  // Delete combo
  const deleted = ComboRepository.deleteCombo(created.id);
  assert.equal(deleted, true);
  assert.equal(ComboRepository.getComboById(created.id), undefined);
});

test("Integration - Combos & Settings REST Endpoints", async () => {
  // Reset settings for idempotent runs
  SettingsRepository.setSetting("capacityAdapter", DEFAULT_CAPACITY_ADAPTER_SETTINGS);

  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", () => resolve()));
  const address = server.address() as { port: number };
  const baseUrl = `http://127.0.0.1:${address.port}`;

  try {
    // 1. GET /api/combos
    const getRes = await fetch(`${baseUrl}/api/combos`);
    assert.equal(getRes.status, 200);
    const getList = (await getRes.json()) as any[];
    assert.ok(Array.isArray(getList));

    // 2. POST /api/combos - validation failures
    const emptyRes = await fetch(`${baseUrl}/api/combos`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "" }),
    });
    assert.equal(emptyRes.status, 400);

    const spaceRes = await fetch(`${baseUrl}/api/combos`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "hello world" }),
    });
    assert.equal(spaceRes.status, 400);

    // 3. POST /api/combos - successful creation (status 201)
    const comboName = "api-test-combo-" + Date.now();
    const createRes = await fetch(`${baseUrl}/api/combos`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: comboName,
        models: ["provider1/model-1", "provider2/model-2"],
        strategy: "round-robin",
      }),
    });
    assert.equal(createRes.status, 201);
    const createdData = (await createRes.json()) as any;
    assert.equal(createdData.name, comboName);
    assert.equal(createdData.strategy, "round-robin");
    const comboId = createdData.id;

    // 4. POST /api/combos - duplicate name error (status 400)
    const dupRes = await fetch(`${baseUrl}/api/combos`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: comboName,
        models: ["provider/other"],
      }),
    });
    assert.equal(dupRes.status, 400);

    // 5. GET /api/combos/:id (200 vs 404)
    const getSingleRes = await fetch(`${baseUrl}/api/combos/${comboId}`);
    assert.equal(getSingleRes.status, 200);
    const singleData = (await getSingleRes.json()) as any;
    assert.equal(singleData.name, comboName);

    const get404Res = await fetch(`${baseUrl}/api/combos/non-existent-combo-xyz`);
    assert.equal(get404Res.status, 404);

    // 6. PUT /api/combos/:id
    const putRes = await fetch(`${baseUrl}/api/combos/${comboId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        strategy: "fusion",
        models: ["new/model-1"],
      }),
    });
    assert.equal(putRes.status, 200);
    const putData = (await putRes.json()) as any;
    assert.equal(putData.strategy, "fusion");
    assert.deepEqual(putData.models, ["new/model-1"]);

    // PUT with invalid ID -> 404
    const put404Res = await fetch(`${baseUrl}/api/combos/non-existent-combo-xyz`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ strategy: "fallback" }),
    });
    assert.equal(put404Res.status, 404);

    // 7. POST /api/combos/:id/toggle
    const toggleRes = await fetch(`${baseUrl}/api/combos/${comboId}/toggle`, { method: "POST" });
    assert.equal(toggleRes.status, 200);
    const toggleData = (await toggleRes.json()) as any;
    assert.equal(toggleData.isActive, false);

    const toggle404 = await fetch(`${baseUrl}/api/combos/non-existent-xyz/toggle`, { method: "POST" });
    assert.equal(toggle404.status, 404);

    // 8. GET /api/combos/presets preview
    const presetPreviewRes = await fetch(`${baseUrl}/api/combos/presets?source=claude`);
    assert.equal(presetPreviewRes.status, 200);
    const presetPreview = (await presetPreviewRes.json()) as any;
    assert.equal(presetPreview.source, "claude");
    assert.ok(Array.isArray(presetPreview.items));

    const presetNoSource = await fetch(`${baseUrl}/api/combos/presets`);
    assert.equal(presetNoSource.status, 400);

    // 9. POST /api/combos/presets creation
    const presetCreateRes = await fetch(`${baseUrl}/api/combos/presets`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ source: "claude" }),
    });
    assert.equal(presetCreateRes.status, 201);
    const presetCreated = (await presetCreateRes.json()) as any;
    assert.equal(presetCreated.source, "claude");
    assert.ok(Array.isArray(presetCreated.created));
    assert.ok(Array.isArray(presetCreated.skipped));

    // 10. DELETE /api/combos/:id
    const delRes = await fetch(`${baseUrl}/api/combos/${comboId}`, { method: "DELETE" });
    assert.equal(delRes.status, 200);
    const delData = (await delRes.json()) as any;
    assert.equal(delData.success, true);

    const del404 = await fetch(`${baseUrl}/api/combos/${comboId}`, { method: "DELETE" });
    assert.equal(del404.status, 404);

    // 11. GET /api/settings/capacity-adapter
    const capRes = await fetch(`${baseUrl}/api/settings/capacity-adapter`);
    assert.equal(capRes.status, 200);
    const capData = (await capRes.json()) as any;
    assert.equal(capData.vision.enabled, false);
    assert.deepEqual(capData.vision.models, []);

    // 12. PUT /api/settings/capacity-adapter
    const capPutRes = await fetch(`${baseUrl}/api/settings/capacity-adapter`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        vision: {
          enabled: false,
          roundRobin: true,
          models: ["custom/vision-model"],
        },
      }),
    });
    assert.equal(capPutRes.status, 200);
    const capPutData = (await capPutRes.json()) as any;
    assert.equal(capPutData.vision.enabled, false);
    assert.equal(capPutData.vision.roundRobin, true);
    assert.deepEqual(capPutData.vision.models, ["custom/vision-model"]);

    // Verify persistence via GET
    const capVerify = await fetch(`${baseUrl}/api/settings/capacity-adapter`);
    const capVerifyData = (await capVerify.json()) as any;
    assert.equal(capVerifyData.vision.enabled, false);
  } finally {
    server.close();
  }
});
