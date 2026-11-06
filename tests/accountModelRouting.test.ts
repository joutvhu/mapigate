import test, { describe, it } from "node:test";
import assert from "node:assert/strict";
import { getDatabase } from "../src/storage/database.js";
import { ProviderRepository } from "../src/storage/repositories/providerRepo.js";
import { AccountModelRepository } from "../src/storage/repositories/accountModelRepo.js";
import { LoadBalancer } from "../src/core/router/loadBalancer.js";
import { resolveTargetModelAndProvider } from "../src/server/proxy/executorHelpers.js";
import { recordResilienceSuccess } from "../src/core/resilience/index.js";

describe("Account Models & Tagging Capabilities", () => {
  const providerId = "test-prov-tags";

  it("resolveTargetModelAndProvider parses provider[tag]/model syntax", () => {
    const res1 = resolveTargetModelAndProvider("claude[pro]/claude-3-7-sonnet");
    assert.equal(res1.providerId, "claude");
    assert.equal(res1.targetTag, "pro");
    assert.equal(res1.targetModel, "claude-3-7-sonnet");

    const res2 = resolveTargetModelAndProvider("openai/gpt-4o");
    assert.equal(res2.providerId, "openai");
    assert.equal(res2.targetTag, undefined);
    assert.equal(res2.targetModel, "gpt-4o");
  });

  it("filters accounts by targetTag correctly", () => {
    const db = getDatabase();
    // Clean up
    db.run("DELETE FROM provider_accounts WHERE provider_id = ?", providerId);
    db.run("DELETE FROM providers WHERE id = ?", providerId);

    ProviderRepository.saveProvider({
      id: providerId,
      name: "Test Provider Tags",
      baseUrl: "https://api.test.com",
      format: "openai",
      isActive: true,
      priority: 1,
      models: ["model-a", "model-b"],
      customHeaders: {},
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    // Add 2 accounts: one pro, one free
    ProviderRepository.addAccount({
      id: "acc_pro_1",
      providerId,
      name: "Account Pro",
      rawApiKey: "key-pro",
      providerSpecificData: { tag: "pro" },
    });

    ProviderRepository.addAccount({
      id: "acc_free_1",
      providerId,
      name: "Account Free",
      rawApiKey: "key-free",
      providerSpecificData: { tag: "free" },
    });

    // 1. Pick with targetTag: 'pro'
    const pickedPro = LoadBalancer.pickAccount(providerId, { targetTag: "pro" });
    assert.ok(pickedPro);
    assert.equal(pickedPro.id, "acc_pro_1");

    // 2. Pick with targetTag: 'free'
    const pickedFree = LoadBalancer.pickAccount(providerId, { targetTag: "free" });
    assert.ok(pickedFree);
    assert.equal(pickedFree.id, "acc_free_1");
  });

  it("prioritizes accounts with confirmed model support over unsupported ones", () => {
    // Both are active accounts without tags
    AccountModelRepository.setAccountModels("acc_pro_1", ["model-expensive", "model-common"]);
    AccountModelRepository.setAccountModels("acc_free_1", ["model-common"]);

    // When model-expensive is requested, acc_pro_1 must be chosen over acc_free_1
    const pickedExpensive = LoadBalancer.pickAccount(providerId, { targetModel: "model-expensive" });
    assert.ok(pickedExpensive);
    assert.equal(pickedExpensive.id, "acc_pro_1");

    // When an unscanned account is added, it is grouped in preferred tier (fail-open)
    ProviderRepository.addAccount({
      id: "acc_unscanned_1",
      providerId,
      name: "Account Unscanned",
      rawApiKey: "key-unscanned",
    });

    // Classify
    const classification = AccountModelRepository.classifyAccounts(
      ["acc_pro_1", "acc_free_1", "acc_unscanned_1"],
      "model-expensive"
    );
    assert.equal(classification.supported.has("acc_pro_1"), true);
    assert.equal(classification.unsupported.has("acc_free_1"), true);
    assert.equal(classification.unscanned.has("acc_unscanned_1"), true);
  });

  it("auto-learns supported models upon recordResilienceSuccess", () => {
    assert.equal(AccountModelRepository.getAccountModels("acc_unscanned_1"), null);

    recordResilienceSuccess({
      providerId,
      accountId: "acc_unscanned_1",
      model: "auto-learned-model",
    });

    const models = AccountModelRepository.getAccountModels("acc_unscanned_1");
    assert.ok(models);
    assert.equal(models.has("auto-learned-model"), true);

    // Clean up
    const db = getDatabase();
    db.run("DELETE FROM provider_accounts WHERE provider_id = ?", providerId);
    db.run("DELETE FROM providers WHERE id = ?", providerId);
  });
});
