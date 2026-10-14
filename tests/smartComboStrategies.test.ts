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
} from "../src/providers/composite/combo/index.js";
import { ComboRepository } from "../src/storage/repositories/comboRepo.js";
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
