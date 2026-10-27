process.env.NODE_ENV = "test";

import test from "node:test";
import assert from "node:assert/strict";
import {
  resolveModelDisplayName,
  formatModelDisplayNameFallback,
  getCanonicalModelList,
  STANDARD_MODELS,
} from "../src/core/capabilities/modelDictionary.js";
import {
  normalizeRegistryModel,
  normalizeRegistryModels,
} from "../src/providers/core/modelNormalizer.js";
import { getSuggestedSourceModels } from "../src/mitm/sourceModels.js";

test("ModelDictionary - standard models resolution", () => {
  assert.equal(resolveModelDisplayName("claude-3-5-sonnet"), "Claude 3.5 Sonnet");
  assert.equal(resolveModelDisplayName("gpt-4o"), "GPT-4o");
  assert.equal(resolveModelDisplayName("deepseek-chat"), "DeepSeek V3");
  assert.equal(resolveModelDisplayName("gemini-2.0-flash"), "Gemini 2.0 Flash");
  assert.equal(resolveModelDisplayName("qwen-2.5-coder-32b"), "Qwen 2.5 Coder 32B");
});

test("ModelDictionary - automatic deduction of High / Medium / Low / Thinking tiers", () => {
  // Gemini 4 Argon tiers (not in STANDARD_MODELS, dynamically derived!)
  assert.equal(resolveModelDisplayName("gemini-4-argon-high"), "Gemini 4 Argon (High)");
  assert.equal(resolveModelDisplayName("gemini-4-argon-medium"), "Gemini 4 Argon (Medium)");
  assert.equal(resolveModelDisplayName("gemini-4-argon-low"), "Gemini 4 Argon (Low)");

  // Gemini 3.8 / 3.5 tiers
  assert.equal(resolveModelDisplayName("gemini-3.8-flash-high"), "Gemini 3.8 Flash (High)");
  assert.equal(resolveModelDisplayName("gemini-3.8-flash-low"), "Gemini 3.8 Flash (Low)");
  assert.equal(resolveModelDisplayName("gemini-3.5-flash-extra-low"), "Gemini 3.5 Flash (Extra Low)");

  // Claude tiers & thinking modes
  assert.equal(resolveModelDisplayName("claude-sonnet-5.5-high"), "Claude Sonnet 5.5 (High)");
  assert.equal(resolveModelDisplayName("claude-sonnet-5.5-thinking"), "Claude Sonnet 5.5 (Thinking)");
  assert.equal(resolveModelDisplayName("claude-opus-5-5-medium"), "Claude Opus 5.5 (Medium)");
  assert.equal(resolveModelDisplayName("claude-opus-4.5-high-thinking"), "Claude Opus 4.5 (High Thinking)");

  // Custom model with tier
  assert.equal(resolveModelDisplayName("my-coder-model-high"), "My Coder Model (High)");
});

test("ModelDictionary - high-end & flagship models (Gemini 4, Fable, Kimi K3, MiMo)", () => {
  // Claude Fable
  assert.equal(resolveModelDisplayName("claude-fable-5-1"), "Claude Fable 5.1");
  assert.equal(resolveModelDisplayName("claude-fable-5.1"), "Claude Fable 5.1");
  assert.equal(resolveModelDisplayName("claude-fable-5"), "Claude Fable 5");
  assert.equal(resolveModelDisplayName("claude-fable"), "Claude Fable");

  // Gemini 4
  assert.equal(resolveModelDisplayName("gemini-4-argon"), "Gemini 4 Argon");
  assert.equal(resolveModelDisplayName("gemini-4-ultra"), "Gemini 4 Ultra");
  assert.equal(resolveModelDisplayName("gemini-4-pro"), "Gemini 4 Pro");
  assert.equal(resolveModelDisplayName("gemini-4-flash"), "Gemini 4 Flash");
  assert.equal(resolveModelDisplayName("gemini-4"), "Gemini 4");

  // Kimi K3 series
  assert.equal(resolveModelDisplayName("kimi-k3.1-pro"), "Kimi K3.1 Pro");
  assert.equal(resolveModelDisplayName("kimi-k3.1"), "Kimi K3.1");
  assert.equal(resolveModelDisplayName("kimi-k3"), "Kimi K3");
  assert.equal(resolveModelDisplayName("kimi-k3-eco"), "Kimi K3 (Eco)");
  assert.equal(resolveModelDisplayName("kimi-for-coding"), "Kimi For Coding");
  assert.equal(resolveModelDisplayName("kimi-k2.7-code"), "Kimi K2.7 Code");

  // Xiaomi MiMo & ByteDance Doubao
  assert.equal(resolveModelDisplayName("mimo-v2.6"), "MiMo V2.6");
  assert.equal(resolveModelDisplayName("mimo-omni"), "MiMo Omni");
  assert.equal(resolveModelDisplayName("doubao-seed-2.1-turbo"), "Doubao Seed 2.1 Turbo");
});

test("ModelDictionary - new generation models resolution (GPT-6, GPT-5, GLM-5, DeepSeek V4)", () => {
  // Claude 4 & 5
  assert.equal(resolveModelDisplayName("claude-opus-5.5"), "Claude Opus 5.5");
  assert.equal(resolveModelDisplayName("claude-sonnet-5"), "Claude Sonnet 5");
  assert.equal(resolveModelDisplayName("claude-sonnet-4.5"), "Claude Sonnet 4.5");
  assert.equal(resolveModelDisplayName("claude-sonnet-4-5"), "Claude Sonnet 4.5");

  // GPT-6 & GPT-5 & Codex
  assert.equal(resolveModelDisplayName("gpt-6.1-sol"), "GPT-6.1 Sol");
  assert.equal(resolveModelDisplayName("gpt-6-astra"), "GPT-6.0 Astra");
  assert.equal(resolveModelDisplayName("gpt-5.6-sol"), "GPT-5.6 Sol");
  assert.equal(resolveModelDisplayName("gpt-5.6-sol[1m]"), "GPT-5.6 Sol (1M Context)");
  assert.equal(resolveModelDisplayName("gpt-5.5-codex"), "GPT-5.5 Codex");
  assert.equal(resolveModelDisplayName("codex-pro"), "Codex Pro");

  // Gemini 3.x & Gemma
  assert.equal(resolveModelDisplayName("gemini-3.8-flash"), "Gemini 3.8 Flash");
  assert.equal(resolveModelDisplayName("gemini-3.7-flash"), "Gemini 3.7 Flash");
  assert.equal(resolveModelDisplayName("gemini-3.1-pro"), "Gemini 3.1 Pro");

  // DeepSeek V4 & 3.2
  assert.equal(resolveModelDisplayName("deepseek-v4-pro"), "DeepSeek V4 Pro");
  assert.equal(resolveModelDisplayName("deepseek-v4.1-flash"), "DeepSeek V4.1 Flash");
  assert.equal(resolveModelDisplayName("deepseek-v4"), "DeepSeek V4");
  assert.equal(resolveModelDisplayName("deepseek-3.2"), "DeepSeek 3.2");

  // Qwen 3 & GLM
  assert.equal(resolveModelDisplayName("qwen3.8-flash"), "Qwen 3.8 Flash");
  assert.equal(resolveModelDisplayName("qwen3-coder-next"), "Qwen3 Coder Next");
  assert.equal(resolveModelDisplayName("glm-5.3-flash"), "GLM-5.3 Flash");
  assert.equal(resolveModelDisplayName("glm-5"), "GLM-5");
});

test("ModelDictionary - vendor prefix removal", () => {
  assert.equal(resolveModelDisplayName("anthropic/claude-fable-5"), "Claude Fable 5");
  assert.equal(resolveModelDisplayName("google/gemini-4-argon"), "Gemini 4 Argon");
  assert.equal(resolveModelDisplayName("moonshotai/kimi-k3"), "Kimi K3");
  assert.equal(resolveModelDisplayName("openai/gpt-4o"), "GPT-4o");
});

test("ModelDictionary - date and tag suffix removal/handling", () => {
  assert.equal(resolveModelDisplayName("claude-fable-5-20251101"), "Claude Fable 5");
  assert.equal(resolveModelDisplayName("gemini-4-flash:free"), "Gemini 4 Flash (Free)");
  assert.equal(resolveModelDisplayName("kimi-k3-preview"), "Kimi K3 (Preview)");
  assert.equal(resolveModelDisplayName("gpt-4o-20240806"), "GPT-4o");
});

test("ModelDictionary - fallback formatting for uncataloged models", () => {
  assert.equal(formatModelDisplayNameFallback("my-custom-coder-v2"), "My Custom Coder V2");
  assert.equal(resolveModelDisplayName("company/awesome-llm-v1"), "Awesome LLM V1");
  assert.equal(resolveModelDisplayName("granite-34b-code"), "Granite 34b Code");
});

test("ModelDictionary - canonical list", () => {
  const list = getCanonicalModelList();
  assert.ok(list.length >= 60, "Should have at least 60 canonical models");
  assert.ok(list.some((m) => m.id === "gemini-4-argon"));
  assert.ok(list.some((m) => m.id === "claude-fable-5"));
  assert.ok(list.some((m) => m.id === "kimi-k3"));
});

test("ModelNormalizer - normalizes strings and objects", () => {
  const normalizedStr = normalizeRegistryModel("gemini-4-argon");
  assert.equal(normalizedStr.id, "gemini-4-argon");
  assert.equal(normalizedStr.name, "Gemini 4 Argon");

  const normalizedFable = normalizeRegistryModel("claude-fable-5");
  assert.equal(normalizedFable.id, "claude-fable-5");
  assert.equal(normalizedFable.name, "Claude Fable 5");

  const normalizedKimi = normalizeRegistryModel("kimi-k3");
  assert.equal(normalizedKimi.id, "kimi-k3");
  assert.equal(normalizedKimi.name, "Kimi K3");
});

test("MITM SourceModels - suggestions for tools", () => {
  const kiroSuggestions = getSuggestedSourceModels("kiro");
  assert.ok(kiroSuggestions.length > 0);
  assert.ok(kiroSuggestions.some((s) => s.id === "auto" || s.id === "claude-sonnet-4.5"));
  assert.ok(kiroSuggestions.some((s) => s.id === "gemini-4-argon" || s.id === "claude-fable-5" || s.id === "kimi-k3"));
});
