process.env.NODE_ENV = "test";

import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import app from "../src/server/index.js";
import { ProviderRepository } from "../src/storage/repositories/providerRepo.js";
import { ComboRepository } from "../src/storage/repositories/comboRepo.js";
import { PROVIDER_REGISTRY } from "../src/shared/constants/providerRegistry.js";

test("Integration - GET /api/models/available with connected accounts filter", async () => {
  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", () => resolve()));
  const address = server.address() as { port: number };
  const baseUrl = `http://127.0.0.1:${address.port}`;

  const testAccountId = "acc_test_avail_" + Date.now();
  const testProviderId = "openai";

  try {
    // 1. GET /api/models/available - returns all registry models
    const res1 = await fetch(`${baseUrl}/api/models/available`);
    assert.equal(res1.status, 200);
    const allModels = (await res1.json()) as any[];
    assert.ok(Array.isArray(allModels), "Should return an array of models");
    assert.ok(allModels.length > 0, "Should contain models from PROVIDER_REGISTRY");

    // Inspect contract for a sample model
    const sample = allModels[0];
    assert.ok(sample.id, "Model must have id");
    assert.ok(sample.value, "Model must have value");
    assert.ok(sample.name, "Model must have name");
    assert.ok(sample.providerId, "Model must have providerId");
    assert.ok(sample.providerName, "Model must have providerName");
    assert.equal(typeof sample.hasConnectedAccount, "boolean");
    assert.equal(typeof sample.accountsCount, "number");
    assert.ok(sample.caps, "Model must have caps");
    assert.equal(typeof sample.caps.vision, "boolean");
    assert.equal(typeof sample.caps.reasoning, "boolean");
    assert.equal(typeof sample.caps.audio, "boolean");
    assert.equal(typeof sample.contextLength, "number");

    // 2. Ensure provider exists in DB, then add an active account for it
    ProviderRepository.saveProvider({
      id: testProviderId,
      name: "OpenAI",
      baseUrl: "https://api.openai.com/v1",
      format: "openai",
      isActive: true,
    });

    ProviderRepository.addAccount({
      id: testAccountId,
      providerId: testProviderId,
      name: "Test Active Account",
      rawApiKey: "sk-test-sample-key",
    });

    // 3. GET /api/models/available - check that testProviderId now reports hasConnectedAccount = true
    const res2 = await fetch(`${baseUrl}/api/models/available`);
    assert.equal(res2.status, 200);
    const updatedModels = (await res2.json()) as any[];

    const providerModels = updatedModels.filter((m) => m.providerId === testProviderId);
    assert.ok(providerModels.length > 0, "Provider should have models");
    for (const m of providerModels) {
      assert.equal(m.hasConnectedAccount, true, `${testProviderId} models must have hasConnectedAccount=true`);
      assert.ok(m.accountsCount >= 1, `${testProviderId} accountsCount must be >= 1`);
    }

    // 4. GET /api/models/available?connectedOnly=true - should only return models with hasConnectedAccount = true
    const resConnected = await fetch(`${baseUrl}/api/models/available?connectedOnly=true`);
    assert.equal(resConnected.status, 200);
    const connectedModels = (await resConnected.json()) as any[];

    assert.ok(connectedModels.length > 0, "Should return at least the models from the connected provider");
    for (const m of connectedModels) {
      assert.equal(m.hasConnectedAccount, true, "Every model in connectedOnly must have hasConnectedAccount=true");
      assert.ok(m.accountsCount > 0, "accountsCount must be > 0");
    }
    // Verify providerModels are included in connectedModels
    const hasOpenAi = connectedModels.some((m) => m.providerId === testProviderId);
    assert.ok(hasOpenAi, "Connected list should include the active provider");

    // 5. Test with connectedOnly=1
    const resConnected1 = await fetch(`${baseUrl}/api/models/available?connectedOnly=1`);
    assert.equal(resConnected1.status, 200);
    const connectedModels1 = (await resConnected1.json()) as any[];
    assert.equal(connectedModels1.length, connectedModels.length);

    // 6. Toggle account to inactive
    ProviderRepository.toggleAccount(testAccountId, false);

    // Verify inactive account is not counted towards active accounts
    const resInactive = await fetch(`${baseUrl}/api/models/available`);
    const afterInactive = (await resInactive.json()) as any[];
    const providerInactiveModels = afterInactive.filter((m) => m.providerId === testProviderId);
    assert.ok(
      providerInactiveModels.every((m) => m.accountsCount === 0 || !m.hasConnectedAccount),
      "Inactive account must not count towards active accounts"
    );
  } finally {
    // Cleanup test account and provider
    try {
      ProviderRepository.deleteAccount(testAccountId);
      ProviderRepository.deleteProvider(testProviderId);
    } catch {
      // Ignore cleanup error
    }
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

test("Integration - Configured provider models take precedence over static presets in available models and v1/models", async () => {
  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", () => resolve()));
  const address = server.address() as { port: number };
  const baseUrl = `http://127.0.0.1:${address.port}`;

  const customProvId = "groq";
  const customModels = ["llama-3.3-70b-versatile-custom", "groq/mixtral-8x7b-custom"];

  try {
    // Save provider with custom models (simulating post-scan or custom configuration)
    ProviderRepository.saveProvider({
      id: customProvId,
      name: "Groq Cloud Custom",
      baseUrl: "https://api.groq.com/openai/v1",
      format: "openai",
      models: customModels,
      isActive: true,
    });

    // 1. GET /api/models/available
    const res = await fetch(`${baseUrl}/api/models/available`);
    assert.equal(res.status, 200);
    const allModels = (await res.json()) as any[];

    const groqModels = allModels.filter((m) => m.providerId === customProvId);
    assert.equal(groqModels.length, 2, "Should only have the 2 configured custom models for groq");

    // Check values avoid double-prefix
    const values = groqModels.map((m) => m.value);
    assert.ok(values.includes("groq/llama-3.3-70b-versatile-custom"));
    assert.ok(values.includes("groq/mixtral-8x7b-custom"), "Model with existing groq/ prefix should not become groq/groq/...");
    assert.ok(!values.some((v) => v.includes("groq/groq/")), "Must never produce double provider prefix");

    // Check static default models are suppressed
    assert.ok(
      !groqModels.some((m) => m.id === "llama-3.3-70b-versatile"),
      "Static registry default model should be suppressed when provider has configured models"
    );

    // 2. GET /v1/models (OpenAI compatibility endpoint)
    const resV1 = await fetch(`${baseUrl}/v1/models`);
    assert.equal(resV1.status, 200);
    const v1Data = (await resV1.json()) as any;
    const v1List = v1Data.data || [];

    const groqV1Models = v1List.filter((m: any) => m.owned_by === customProvId);
    assert.equal(groqV1Models.length, 2, "OpenAI list should only include the 2 configured custom models for groq");
    const v1Ids = groqV1Models.map((m: any) => m.id);
    assert.ok(v1Ids.includes("groq/llama-3.3-70b-versatile-custom"));
    assert.ok(v1Ids.includes("groq/mixtral-8x7b-custom"));
    assert.ok(!v1Ids.some((id: string) => id.includes("groq/groq/")));
  } finally {
    try {
      ProviderRepository.deleteProvider(customProvId);
    } catch {
      // Ignore cleanup error
    }
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

test("Integration - Active combo with tagged provider model resolves hasConnectedAccount=true in available models", async () => {
  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", () => resolve()));
  const address = server.address() as { port: number };
  const baseUrl = `http://127.0.0.1:${address.port}`;

  const testProviderId = "test_tagged_combo_prov";
  const testAccountId = "acc_tagged_combo_" + Date.now();
  const comboName = "test-tagged-combo-" + Date.now();

  try {
    ProviderRepository.saveProvider({
      id: testProviderId,
      name: "Test Tagged Provider",
      baseUrl: "https://api.test.com/v1",
      format: "openai",
      models: ["model-x"],
      isActive: true,
    });

    ProviderRepository.addAccount({
      id: testAccountId,
      providerId: testProviderId,
      name: "Work Account",
      tag: "work",
      rawApiKey: "sk-test-sample-key",
    });

    ComboRepository.saveCombo({
      name: comboName,
      models: [`${testProviderId}[work]/model-x`],
      strategy: "round-robin",
    });

    // 1. Check /api/models/available without connectedOnly
    const res = await fetch(`${baseUrl}/api/models/available`);
    assert.equal(res.status, 200);
    const allModels = (await res.json()) as any[];

    const comboItem = allModels.find((m) => m.name === comboName);
    assert.ok(comboItem, "Combo should exist in available models");
    assert.equal(comboItem.hasConnectedAccount, true, "Combo with tagged account must have hasConnectedAccount=true");
    assert.ok(comboItem.accountsCount >= 1, "Combo accountsCount must be >= 1");

    // 2. Check /api/models/available?connectedOnly=true - combo MUST be included
    const resConnected = await fetch(`${baseUrl}/api/models/available?connectedOnly=true`);
    assert.equal(resConnected.status, 200);
    const connectedModels = (await resConnected.json()) as any[];

    const connectedCombo = connectedModels.find((m) => m.name === comboName);
    assert.ok(connectedCombo, "Combo with tagged account MUST be present when connectedOnly=true");
  } finally {
    try {
      const existing = ComboRepository.getComboByName(comboName);
      if (existing) ComboRepository.deleteCombo(existing.id);
      ProviderRepository.deleteAccount(testAccountId);
      ProviderRepository.deleteProvider(testProviderId);
    } catch {
      // Ignore cleanup error
    }
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});
