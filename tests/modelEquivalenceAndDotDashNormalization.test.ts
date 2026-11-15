process.env.NODE_ENV = "test";

import test from "node:test";
import assert from "node:assert/strict";
import {
  normalizeModelCompareKey,
  areModelNamesEquivalent,
} from "../src/shared/utils/modelUtils.js";
import { resolveModelDisplayName } from "../src/core/capabilities/modelDictionary.js";
import { ToolMappingRepository } from "../src/storage/repositories/toolMappingRepo.js";
import { RuleEngine } from "../src/core/router/ruleEngine.js";
import { AccountModelRepository } from "../src/storage/repositories/accountModelRepo.js";
import { resolveTargetModelAndProvider } from "../src/server/proxy/executorHelpers.js";
import { ProviderRepository } from "../src/storage/repositories/providerRepo.js";
import { resolveModelMapping as resolveMitmModelMapping } from "../src/mitm/server.js";
import { MitmRepository } from "../src/storage/repositories/mitmRepo.js";
import { getPricingForModel } from "../src/core/usage/pricing.js";

test("ModelUtils - normalizeModelCompareKey converts dots to dashes and normalizes formatting", () => {
  assert.equal(normalizeModelCompareKey("kimi-k3.1-pro"), "kimi-k3-1-pro");
  assert.equal(normalizeModelCompareKey("kimi-k3-1-pro"), "kimi-k3-1-pro");
  assert.equal(normalizeModelCompareKey("Claude Sonnet 4.5"), "claude-sonnet-4-5");
  assert.equal(normalizeModelCompareKey("models/claude-sonnet-4.5"), "claude-sonnet-4-5");
  assert.equal(normalizeModelCompareKey("gemini-2.0-flash"), "gemini-2-0-flash");
  assert.equal(normalizeModelCompareKey("deepseek-v4.1-flash"), "deepseek-v4-1-flash");
  assert.equal(normalizeModelCompareKey(""), "");
  assert.equal(normalizeModelCompareKey(null), "");
});

test("ModelUtils - areModelNamesEquivalent matches dot and dash variants interchangeably", () => {
  assert.ok(areModelNamesEquivalent("kimi-k3.1-pro", "kimi-k3-1-pro"));
  assert.ok(areModelNamesEquivalent("kimi-k3.1", "kimi-k3-1"));
  assert.ok(areModelNamesEquivalent("Claude Sonnet 4.5", "claude-sonnet-4-5"));
  assert.ok(areModelNamesEquivalent("models/claude-sonnet-4.5", "claude-sonnet-4-5"));
  assert.ok(areModelNamesEquivalent("moonshotai/kimi-k3.1-pro", "kimi-k3-1-pro"));
  assert.ok(areModelNamesEquivalent("gemini-3.8-flash", "gemini-3-8-flash"));
  assert.ok(!areModelNamesEquivalent("gpt-4o", "claude-3-5-sonnet"));
  assert.ok(!areModelNamesEquivalent("anthropic/claude-3.5-sonnet", "bedrock/claude-3-5-sonnet"));
});

test("ModelDictionary - automatically identifies models when dot is swapped with dash", () => {
  // User's specific example
  assert.equal(resolveModelDisplayName("kimi-k3-1-pro"), "Kimi K3.1 Pro");
  assert.equal(resolveModelDisplayName("kimi-k3.1-pro"), "Kimi K3.1 Pro");
  assert.equal(resolveModelDisplayName("kimi-k3-1"), "Kimi K3.1");

  // Other flagship models with dot/dash variants
  assert.equal(resolveModelDisplayName("gemini-3-8-flash"), "Gemini 3.8 Flash");
  assert.equal(resolveModelDisplayName("gemini-2-0-flash"), "Gemini 2.0 Flash");
  assert.equal(resolveModelDisplayName("qwen-2-5-coder-32b"), "Qwen 2.5 Coder 32B");
  assert.equal(resolveModelDisplayName("deepseek-v4-1-flash"), "DeepSeek V4.1 Flash");
  assert.equal(resolveModelDisplayName("mimo-v2-6"), "MiMo V2.6");
  assert.equal(resolveModelDisplayName("doubao-seed-2-1-turbo"), "Doubao Seed 2.1 Turbo");

  // With thinking / tier suffixes
  assert.equal(resolveModelDisplayName("kimi-k3-1-pro-high"), "Kimi K3.1 Pro (High)");
  assert.equal(resolveModelDisplayName("gemini-3-8-flash-high"), "Gemini 3.8 Flash (High)");
});

test("ToolMappingRepository - resolveModelMapping matches dot and dash variants", () => {
  // Save mapping with dot
  ToolMappingRepository.saveMapping("test-tool", "kimi-k3.1-pro", "provider/target-model");

  // Querying with dash should resolve successfully
  const resolvedWithDash = ToolMappingRepository.resolveModelMapping("test-tool", "kimi-k3-1-pro");
  assert.equal(resolvedWithDash, "provider/target-model");

  // Querying with dot should also resolve
  const resolvedWithDot = ToolMappingRepository.resolveModelMapping("test-tool", "kimi-k3.1-pro");
  assert.equal(resolvedWithDot, "provider/target-model");

  // Global mapping test
  ToolMappingRepository.saveGlobalMapping("claude-sonnet-4.5", "anthropic/claude-3-5-sonnet");
  const resolvedGlobalWithDash = ToolMappingRepository.resolveModelMapping("other-tool", "claude-sonnet-4-5");
  assert.equal(resolvedGlobalWithDash, "anthropic/claude-3-5-sonnet");

  // Clean up
  ToolMappingRepository.deleteMapping("test-tool", "kimi-k3.1-pro");
  ToolMappingRepository.deleteGlobalMapping("claude-sonnet-4.5");
});

test("RuleEngine - resolveModel matches rules when dot is swapped with dash", () => {
  const engine = new RuleEngine([
    {
      alias: "kimi-k3.1-pro",
      targetModel: "moonshotai/kimi-k3.1-pro",
      targetProviderId: "moonshot",
    },
  ]);

  // Requesting with dash
  const res = engine.resolveModel("kimi-k3-1-pro");
  assert.equal(res.model, "moonshotai/kimi-k3.1-pro");
  assert.equal(res.rule?.targetProviderId, "moonshot");
});

test("AccountModelRepository - classifyAccounts matches accounts with dot and dash interchangeably", () => {
  const testProvId = "prov_acc_model_test";
  ProviderRepository.saveProvider({
    id: testProvId,
    name: "Account Model Test Provider",
    baseUrl: "https://api.example.com",
    format: "openai",
    models: ["kimi-k3.1-pro"],
    isActive: true,
  });

  const testAccId = "acc_kimi_test_1";
  ProviderRepository.addAccount({
    id: testAccId,
    providerId: testProvId,
    name: "Kimi Account 1",
    rawApiKey: "key-kimi-1",
  });

  try {
    // Account supports "kimi-k3.1-pro" (with dot)
    AccountModelRepository.setAccountModels(testAccId, ["kimi-k3.1-pro"]);

    // Requesting with dash "kimi-k3-1-pro"
    const classification = AccountModelRepository.classifyAccounts([testAccId], "kimi-k3-1-pro");
    assert.ok(classification.supported.has(testAccId), "Account should be classified as supported");
    assert.equal(classification.unsupported.size, 0);
  } finally {
    AccountModelRepository.clearAccountModels(testAccId);
    ProviderRepository.deleteAccount(testAccId);
    ProviderRepository.deleteProvider(testProvId);
  }
});

test("MitmServer - resolveModelMapping matches dot and dash variants", () => {
  MitmRepository.updateMapping("kiro", "kimi-k3.1-pro", "moonshot/kimi-k3.1-pro");

  // Resolving with dash
  const resolved = resolveMitmModelMapping("kiro", "kimi-k3-1-pro");
  assert.equal(resolved, "moonshot/kimi-k3.1-pro");

  // Clean up
  MitmRepository.deleteMapping("kiro", "kimi-k3.1-pro");
});

test("resolveTargetModelAndProvider - resolves provider and canonical model name across dot/dash", () => {
  // Create test provider with model containing dot
  const testProviderId = "test_kimi_dot_prov";
  ProviderRepository.saveProvider({
    id: testProviderId,
    name: "Test Kimi Provider",
    baseUrl: "https://api.example.com",
    format: "openai",
    models: ["kimi-k3.1-pro"],
    isActive: true,
  });

  try {
    const res = resolveTargetModelAndProvider("kimi-k3-1-pro");
    assert.equal(res.providerId, testProviderId);
    assert.equal(res.targetModel, "kimi-k3.1-pro");

    // Explicit provider prefix syntax should also rewrite targetModel to provider's canonical ID
    const resExplicit = resolveTargetModelAndProvider(`${testProviderId}/kimi-k3-1-pro`);
    assert.equal(resExplicit.providerId, testProviderId);
    assert.equal(resExplicit.targetModel, "kimi-k3.1-pro");
  } finally {
    ProviderRepository.deleteProvider(testProviderId);
  }
});

test("Pricing - resolves exact pricing for model IDs with dot or dash interchangeably", () => {
  // Dot variant vs dash variant should yield the exact same rates
  const dotPricing = getPricingForModel("kimi", "kimi-k3.1-pro");
  const dashPricing = getPricingForModel("kimi", "kimi-k3-1-pro");

  assert.ok(dotPricing);
  assert.ok(dashPricing);
  assert.equal(dashPricing.input, 2.00);
  assert.equal(dashPricing.output, 10.00);
  assert.equal(dashPricing.input, dotPricing.input);
  assert.equal(dashPricing.output, dotPricing.output);

  // Other models with dot/dash
  const gpt56SolDot = getPricingForModel("openai", "gpt-5.6-sol");
  const gpt56SolDash = getPricingForModel("openai", "gpt-5-6-sol");
  assert.equal(gpt56SolDash?.input, gpt56SolDot?.input);

  const claudeOpus55Dot = getPricingForModel("anthropic", "claude-opus-5.5");
  const claudeOpus55Dash = getPricingForModel("anthropic", "claude-opus-5-5");
  assert.equal(claudeOpus55Dash?.input, claudeOpus55Dot?.input);
});
