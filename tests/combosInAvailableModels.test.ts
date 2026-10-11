process.env.NODE_ENV = "test";

import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import app from "../src/server/index.js";
import { ComboRepository } from "../src/storage/repositories/comboRepo.js";
import { ProviderRepository } from "../src/storage/repositories/providerRepo.js";

test("Integration - Combos in /api/models/available, /v1/models, and proxy resolution", async () => {
  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", () => resolve()));
  const address = server.address() as { port: number };
  const baseUrl = `http://127.0.0.1:${address.port}`;

  const suffix = Date.now();
  const testComboName = `combo-test-${suffix}`;
  const inactiveComboName = `combo-inactive-${suffix}`;
  const unconnectedComboName = `combo-unconnected-${suffix}`;
  const testProvId = `prov_test_${suffix}`;
  const testAccId = `acc_test_${suffix}`;

  try {
    // 1. Create combos
    ComboRepository.saveCombo({
      name: testComboName,
      models: [`${testProvId}/test-model-1`, "openai/gpt-4o"],
      strategy: "round-robin",
      isActive: true,
    });

    ComboRepository.saveCombo({
      name: inactiveComboName,
      models: ["openai/gpt-4o"],
      strategy: "fallback",
      isActive: false,
    });

    ComboRepository.saveCombo({
      name: unconnectedComboName,
      models: [`unconnected_prov_${suffix}/model-x`],
      strategy: "fusion",
      isActive: true,
    });

    // Add provider and active account for testProvId
    ProviderRepository.saveProvider({
      id: testProvId,
      name: "Test Combo Provider",
      baseUrl: "https://api.test.example/v1",
      format: "openai",
      isActive: true,
    });

    ProviderRepository.addAccount({
      id: testAccId,
      providerId: testProvId,
      name: "Active Account for Combo Test",
      rawApiKey: "sk-combo-test-api-key-1234567890",
    });

    // 2. Test GET /api/models/available
    const resAvail = await fetch(`${baseUrl}/api/models/available`);
    assert.equal(resAvail.status, 200);
    const modelsAvail = (await resAvail.json()) as any[];

    // Active combo must be present
    const foundActiveCombo = modelsAvail.find((m) => m.name === testComboName);
    assert.ok(foundActiveCombo, `Active combo ${testComboName} must be in /api/models/available`);
    assert.equal(foundActiveCombo.isCombo, true);
    assert.equal(foundActiveCombo.providerId, "combo");
    assert.equal(foundActiveCombo.providerName, "Combos");
    assert.equal(foundActiveCombo.strategy, "round-robin");
    assert.deepEqual(foundActiveCombo.models, [`${testProvId}/test-model-1`, "openai/gpt-4o"]);
    assert.equal(foundActiveCombo.hasConnectedAccount, true);
    assert.ok(foundActiveCombo.accountsCount >= 1);
    assert.ok(foundActiveCombo.caps, "Combo must have caps object");

    // Inactive combo must NOT be present
    const foundInactive = modelsAvail.find((m) => m.name === inactiveComboName);
    assert.equal(foundInactive, undefined, "Inactive combo must not be returned in /api/models/available");

    // 3. Test GET /api/models/available?connectedOnly=true
    const resConnected = await fetch(`${baseUrl}/api/models/available?connectedOnly=true`);
    assert.equal(resConnected.status, 200);
    const connectedModels = (await resConnected.json()) as any[];

    const connectedCombo = connectedModels.find((m) => m.name === testComboName);
    assert.ok(connectedCombo, "Combo with connected account provider must be present in connectedOnly list");

    const unconnectedCombo = connectedModels.find((m) => m.name === unconnectedComboName);
    assert.equal(
      unconnectedCombo,
      undefined,
      "Combo without connected account provider must NOT be present in connectedOnly list"
    );

    // 4. Test GET /v1/models (OpenAI compatibility)
    const resV1Models = await fetch(`${baseUrl}/v1/models`);
    assert.equal(resV1Models.status, 200);
    const v1Data = (await resV1Models.json()) as any;
    assert.equal(v1Data.object, "list");
    assert.ok(Array.isArray(v1Data.data));

    const v1Combo = v1Data.data.find((m: any) => m.id === testComboName);
    assert.ok(v1Combo, "Active combo must be present in /v1/models list");
    assert.equal(v1Combo.object, "model");
    assert.equal(v1Combo.owned_by, "combo");

    const v1Inactive = v1Data.data.find((m: any) => m.id === inactiveComboName);
    assert.equal(v1Inactive, undefined, "Inactive combo must not be present in /v1/models");

    // 5. Test GET /models alias
    const resModelsAlias = await fetch(`${baseUrl}/models`);
    assert.equal(resModelsAlias.status, 200);
    const aliasData = (await resModelsAlias.json()) as any;
    assert.equal(aliasData.object, "list");
    assert.ok(aliasData.data.some((m: any) => m.id === testComboName));

    // 6. Test Proxy resolution with bare combo name and combo/ prefix
    // (A request with an invalid mock provider account returns 503 or error, but validates combo detection logs/route)
    const testProxyBare = await fetch(`${baseUrl}/v1/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: testComboName,
        messages: [{ role: "user", content: "Hello combo" }],
      }),
    });
    // It triggers combo fallback across candidate models
    assert.ok([200, 500, 502, 503].includes(testProxyBare.status));

    const testProxyPrefix = await fetch(`${baseUrl}/v1/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: `combo/${testComboName}`,
        messages: [{ role: "user", content: "Hello combo prefix" }],
      }),
    });
    assert.ok([200, 500, 502, 503].includes(testProxyPrefix.status));
  } finally {
    // Cleanup
    ComboRepository.deleteCombo(testComboName);
    ComboRepository.deleteCombo(inactiveComboName);
    ComboRepository.deleteCombo(unconnectedComboName);
    server.close();
  }
});
