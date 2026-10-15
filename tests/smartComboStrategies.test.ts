process.env.NODE_ENV = "test";

import test from "node:test";
import assert from "node:assert/strict";
import {
  handleFallbackChat,
  recordComboModelResult,
  getComboModelScore,
  recordComboSuccess,
  getLkgpModel,
  resetComboState,
  ComboProvider,
  comboRotationState,
  lkgpState,
} from "../src/providers/composite/combo/index.js";
import { ComboRepository } from "../src/storage/repositories/comboRepo.js";
import { ProviderRepository } from "../src/storage/repositories/providerRepo.js";
import { ProviderRegistry } from "../src/providers/registry.js";
import { executeSingleModel } from "../src/server/proxy/singleModelExecutor.js";
import type { ProviderRequestContext } from "../src/providers/core/types.js";

test("Smart Combo - LKGP cache warmth preservation", async () => {
  resetComboState("combo-lkgp-test");
  const callLog: string[] = [];

  const fakeHandler = async (_body: any, modelStr: string) => {
    callLog.push(modelStr);
    if (modelStr === "provider-1/model-a") {
      return { ok: false, status: 429, error: "Rate limit exceeded" };
    }
    if (modelStr === "provider-2/model-b") {
      return { ok: true, status: 200, text: "Success from Model B" };
    }
    return { ok: false, status: 500 };
  };

  const models = ["provider-1/model-a", "provider-2/model-b", "provider-3/model-c"];

  // Request 1: model-a fails with 429, falls back to model-b and succeeds
  const res1 = await handleFallbackChat({
    body: { messages: [{ role: "user", content: "Hello turn 1" }] },
    models,
    handleSingleModel: fakeHandler,
    comboName: "combo-lkgp-test",
    comboStrategy: "lkgp",
    log: { info: () => {}, warn: () => {} },
  });

  assert.equal(res1.ok, true);
  assert.equal(res1.modelUsed, "provider-2/model-b");
  assert.deepEqual(callLog, ["provider-1/model-a", "provider-2/model-b"]);
  assert.equal(getLkgpModel("combo-lkgp-test"), "provider-2/model-b");

  // Request 2: with LKGP strategy, model-b should be tried FIRST, preserving cache warmth!
  callLog.length = 0;
  const res2 = await handleFallbackChat({
    body: { messages: [{ role: "user", content: "Hello turn 2" }] },
    models,
    handleSingleModel: fakeHandler,
    comboName: "combo-lkgp-test",
    comboStrategy: "lkgp",
    log: { info: () => {}, warn: () => {} },
  });

  assert.equal(res2.ok, true);
  assert.equal(res2.modelUsed, "provider-2/model-b");
  // Crucial: model-b was tried immediately at index 0 without trying model-a
  assert.deepEqual(callLog, ["provider-2/model-b"]);
});

test("Smart Combo - LKGP capability-tier gating under autoSwitch", async () => {
  resetComboState("combo-tier-test");

  // Record text-only model as last known good
  recordComboSuccess("combo-tier-test", "deepseek/deepseek-reasoner");
  assert.equal(getLkgpModel("combo-tier-test"), "deepseek/deepseek-reasoner");

  const models = ["deepseek/deepseek-reasoner", "openai/gpt-4o"];
  const callLog: string[] = [];

  const fakeHandler = async (_body: any, modelStr: string) => {
    callLog.push(modelStr);
    return { ok: true, status: 200, text: `Answer from ${modelStr}` };
  };

  // Turn 1: Plain text request -> LKGP model is promoted to index 0
  callLog.length = 0;
  const textRes = await handleFallbackChat({
    body: { messages: [{ role: "user", content: "Write a sorting algorithm" }] },
    models,
    handleSingleModel: fakeHandler,
    comboName: "combo-tier-test",
    comboStrategy: "lkgp",
    autoSwitch: true,
    log: { info: () => {}, warn: () => {} },
  });

  assert.equal(textRes.ok, true);
  assert.equal(callLog[0], "deepseek/deepseek-reasoner");

  // Turn 2: Multimodal vision request -> deepseek-reasoner lacks vision (tier 2),
  // so autoSwitch capability gating MUST PREVENT promoting it to index 0!
  callLog.length = 0;
  const visionRes = await handleFallbackChat({
    body: {
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: "What is in this screenshot?" },
            { type: "image_url", image_url: { url: "data:image/png;base64,iVBORw0KGgo..." } },
          ],
        },
      ],
    },
    models,
    handleSingleModel: fakeHandler,
    comboName: "combo-tier-test",
    comboStrategy: "lkgp",
    autoSwitch: true,
    log: { info: () => {}, warn: () => {} },
  });

  assert.equal(visionRes.ok, true);
  // openai/gpt-4o has vision support, so it must be tried first instead of deepseek-reasoner
  assert.equal(callLog[0], "openai/gpt-4o");
  assert.equal(visionRes.modelUsed, "openai/gpt-4o");
});

test("Smart Combo - P2C candidate sampling and EMA routing", async () => {
  resetComboState();

  const fastHealthyModel = "provider-fast/model-fast";
  const slowFailingModel = "provider-slow/model-slow";

  // Simulate multiple executions to train EMA stats
  for (let i = 0; i < 5; i++) {
    recordComboModelResult(fastHealthyModel, true, 40);
    recordComboModelResult(slowFailingModel, false, 2500);
  }

  const scoreFast = getComboModelScore(fastHealthyModel);
  const scoreSlow = getComboModelScore(slowFailingModel);
  assert.ok(scoreFast > scoreSlow, "Fast healthy model must have higher score than slow failing model");

  const callLog: string[] = [];
  const fakeHandler = async (_body: any, modelStr: string) => {
    callLog.push(modelStr);
    return { ok: true, status: 200, text: `Response from ${modelStr}` };
  };

  // Provide models in [slow, fast] order. P2C samples both and must place fast at index 0.
  const models = [slowFailingModel, fastHealthyModel];

  const p2cRes = await handleFallbackChat({
    body: { messages: [{ role: "user", content: "Optimize this loop" }] },
    models,
    handleSingleModel: fakeHandler,
    comboName: "combo-p2c-test",
    comboStrategy: "p2c",
    log: { info: () => {}, warn: () => {} },
  });

  assert.equal(p2cRes.ok, true);
  assert.equal(callLog[0], fastHealthyModel, "P2C must route to higher EMA scoring candidate first");
  assert.equal(p2cRes.modelUsed, fastHealthyModel);
});

test("Smart Combo - ComboRepository saving and loading combos with lkgp and p2c", () => {
  // Save combo with lkgp
  const lkgpCombo = ComboRepository.saveCombo({
    name: "test-repo-lkgp",
    models: ["openai/gpt-4o", "anthropic/claude-3-7-sonnet"],
    strategy: "lkgp",
  });

  assert.equal(lkgpCombo.name, "test-repo-lkgp");
  assert.equal(lkgpCombo.strategy, "lkgp");

  const fetchedLkgp = ComboRepository.getComboByName("test-repo-lkgp");
  assert.ok(fetchedLkgp);
  assert.equal(fetchedLkgp.strategy, "lkgp");

  // Save combo with p2c
  const p2cCombo = ComboRepository.saveCombo({
    name: "test-repo-p2c",
    models: ["deepseek/deepseek-chat", "openai/gpt-4o-mini"],
    strategy: "p2c",
  });

  assert.equal(p2cCombo.name, "test-repo-p2c");
  assert.equal(p2cCombo.strategy, "p2c");

  const fetchedP2c = ComboRepository.getComboByName("test-repo-p2c");
  assert.ok(fetchedP2c);
  assert.equal(fetchedP2c.strategy, "p2c");

  // Update combo strategy
  const updated = ComboRepository.updateCombo(p2cCombo.id, {
    strategy: "lkgp",
  });
  assert.ok(updated);
  assert.equal(updated.strategy, "lkgp");
});

test("Smart Combo - ComboProvider forwards comboStrategy dynamically", async () => {
  resetComboState("provider-forwarding-test");
  const provider = new ComboProvider();

  let capturedStrategy: string | undefined;

  const fakeHandler = async (_body: any, modelStr: string) => {
    return { ok: true, status: 200, text: `Handled by ${modelStr}` };
  };

  const context: ProviderRequestContext = {
    provider: { id: "combo", name: "Composite Combo", format: "openai", isEnabled: true },
    targetModel: "forwarding-combo",
    body: { messages: [{ role: "user", content: "Test forwarding" }] },
    combo: {
      id: "fwd-id",
      name: "provider-forwarding-test",
      models: ["model-x", "model-y"],
      strategy: "lkgp",
      isActive: true,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    },
  };

  const result = await provider.execute(context, fakeHandler);
  assert.equal(result.ok, true);
  // Successfully executed and recorded LKGP
  assert.equal(getLkgpModel("provider-forwarding-test"), "model-x");
});

test("Smart Combo - ComboRepository cleanup of lkgpState and comboRotationState on rename and delete", () => {
  const combo = ComboRepository.saveCombo({
    name: "combo-cleanup-test",
    models: ["model-1", "model-2"],
    strategy: "lkgp",
  });

  // Seed state
  recordComboSuccess("combo-cleanup-test", "model-2");
  comboRotationState.set("combo-cleanup-test", { index: 1, consecutiveUseCount: 1 });
  assert.equal(getLkgpModel("combo-cleanup-test"), "model-2");
  assert.ok(comboRotationState.has("combo-cleanup-test"));

  // Rename combo
  ComboRepository.updateCombo(combo.id, {
    name: "combo-cleanup-renamed",
  });

  // Old name state must be cleared
  assert.equal(getLkgpModel("combo-cleanup-test"), undefined);
  assert.equal(comboRotationState.has("combo-cleanup-test"), false);

  // Seed state on new name
  recordComboSuccess("combo-cleanup-renamed", "model-1");
  comboRotationState.set("combo-cleanup-renamed", { index: 0, consecutiveUseCount: 1 });
  assert.equal(getLkgpModel("combo-cleanup-renamed"), "model-1");

  // Delete combo
  ComboRepository.deleteCombo(combo.id);

  // Deleted state must be cleared
  assert.equal(getLkgpModel("combo-cleanup-renamed"), undefined);
  assert.equal(comboRotationState.has("combo-cleanup-renamed"), false);
});

test("Smart Combo - fallback preserves cache_control in original request body across sequential models", async () => {
  const originalBody = {
    messages: [
      {
        role: "user",
        content: [
          {
            type: "text",
            text: "Explain quantum teleportation in detail",
            cache_control: { type: "ephemeral" },
          },
        ],
      },
    ],
  };

  const capturedBodies: any[] = [];

  const fakeHandler = async (body: any, modelStr: string) => {
    // Model 1 simulates an OpenAI-style model that strips cache_control in its own upstream body
    if (modelStr === "openai/gpt-4o") {
      capturedBodies.push(JSON.parse(JSON.stringify(body)));
      return { ok: false, status: 429, error: "Rate limit reached" };
    }
    // Model 2 is Claude: it should receive the cache_control intact
    if (modelStr === "claude/claude-3-7-sonnet") {
      capturedBodies.push(JSON.parse(JSON.stringify(body)));
      return { ok: true, status: 200, text: "Claude response" };
    }
    return { ok: false, status: 500 };
  };

  const res = await handleFallbackChat({
    body: originalBody,
    models: ["openai/gpt-4o", "claude/claude-3-7-sonnet"],
    handleSingleModel: fakeHandler,
    comboName: "combo-cache-control-test",
    comboStrategy: "fallback",
    log: { info: () => {}, warn: () => {} },
  });

  assert.equal(res.ok, true);
  assert.equal(res.modelUsed, "claude/claude-3-7-sonnet");

  // Verify that model 2 received cache_control intact
  assert.deepEqual(capturedBodies[1].messages[0].content[0].cache_control, {
    type: "ephemeral",
  });

  // Verify that the original input body still has cache_control intact
  assert.deepEqual(originalBody.messages[0].content[0].cache_control, {
    type: "ephemeral",
  });
});

test("executeSingleModel - does not mutate caller body or strip cache_control from original messages", async () => {
  ProviderRegistry.initializeBuiltins();

  const mockProvId = `mock_strip_${Date.now()}`;
  ProviderRepository.saveProvider({
    id: mockProvId,
    name: "Mock Strip Provider",
    baseUrl: "http://127.0.0.1:59999/v1", // Non-listening port to fail fast
    format: "openai",
    isActive: true,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  });
  const mockAccId = `acc_strip_${Date.now()}`;
  ProviderRepository.addAccount({
    id: mockAccId,
    providerId: mockProvId,
    name: "Mock Acc",
    rawApiKey: "mock-key",
    isActive: true,
  });

  const testBody = {
    messages: [
      {
        role: "user",
        content: [
          {
            type: "text",
            text: "Hello world with cache control",
            cache_control: { type: "ephemeral" },
          },
        ],
      },
    ],
  };

  try {
    await executeSingleModel({
      req: {} as any,
      res: {} as any,
      body: testBody,
      modelStr: `${mockProvId}/test-model`,
      clientFormat: "openai",
      requestId: "test-mutate-id",
      startTime: Date.now(),
    });
  } catch {
    // Expected fetch failure
  } finally {
    ProviderRepository.deleteAccount(mockAccId);
    ProviderRepository.deleteProvider(mockProvId);
  }

  // Crucial invariant: original input body MUST retain cache_control even though
  // the provider format was OpenAI which stripped cache_control on upstream body!
  assert.deepEqual(
    testBody.messages[0].content[0].cache_control,
    { type: "ephemeral" },
    "cache_control must not be stripped in-place from caller's body"
  );
});

