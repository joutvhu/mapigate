process.env.NODE_ENV = "test";

import test from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_CAPABILITIES,
  looksLikeVisionModel,
  matchPattern,
  getCapabilitiesForModel,
  aggregateComboCapabilities,
} from "../src/core/capabilities/index.js";

test("Capabilities - Default capabilities safe floor", () => {
  assert.equal(DEFAULT_CAPABILITIES.vision, false);
  assert.equal(DEFAULT_CAPABILITIES.pdf, false);
  assert.equal(DEFAULT_CAPABILITIES.audioInput, false);
  assert.equal(DEFAULT_CAPABILITIES.tools, true);
  assert.equal(DEFAULT_CAPABILITIES.reasoning, false);
  assert.equal(DEFAULT_CAPABILITIES.contextWindow, 200000);
});

test("Capabilities - looksLikeVisionModel heuristic", () => {
  assert.equal(looksLikeVisionModel("qwen3-vl-plus"), true);
  assert.equal(looksLikeVisionModel("glm-4.6v"), true);
  assert.equal(looksLikeVisionModel("deepseek-v4-flash-vision-exp"), true);
  assert.equal(looksLikeVisionModel("llava-v1.6-34b"), true);
  assert.equal(looksLikeVisionModel("pixtral-12b"), true);
  assert.equal(looksLikeVisionModel("internvl2-8b"), true);

  // Non-vision models must not match
  assert.equal(looksLikeVisionModel("flux-schnell"), false);
  assert.equal(looksLikeVisionModel("dall-e-3"), false);
  assert.equal(looksLikeVisionModel("text-embedding-3-small"), false);
  assert.equal(looksLikeVisionModel("whisper-large-v3"), false);
  assert.equal(looksLikeVisionModel("tts-1"), false);
  assert.equal(looksLikeVisionModel("deepseek-chat"), false);
});

test("Capabilities - matchPattern wildcard matching", () => {
  assert.equal(matchPattern("*claude*sonnet*", "claude-3-7-sonnet-20250219"), true);
  assert.equal(matchPattern("*gpt-4o*", "openai/gpt-4o-mini"), true);
  assert.equal(matchPattern("*deepseek*", "deepseek-chat"), true);
  assert.equal(matchPattern("*gemini*", "google/gemini-2.0-flash"), true);
  assert.equal(matchPattern("*gpt-4o*", "gpt-3.5-turbo"), false);
});

test("Capabilities - getCapabilitiesForModel accurately classifies models", () => {
  // Acceptance Criterion: claude-3-7-sonnet as vision+thinking
  const claude37 = getCapabilitiesForModel("anthropic", "claude-3-7-sonnet");
  assert.equal(claude37.vision, true, "claude-3-7-sonnet should have vision");
  assert.equal(claude37.reasoning, true, "claude-3-7-sonnet should have thinking/reasoning");

  // Acceptance Criterion: deepseek-chat as non-vision+thinking
  const deepseekChat = getCapabilitiesForModel("deepseek", "deepseek-chat");
  assert.equal(deepseekChat.vision, false, "deepseek-chat should NOT have vision");
  assert.equal(deepseekChat.reasoning, true, "deepseek-chat should have thinking/reasoning");

  // Acceptance Criterion: gpt-4o as vision
  const gpt4o = getCapabilitiesForModel("openai", "gpt-4o");
  assert.equal(gpt4o.vision, true, "gpt-4o should have vision");

  // Other key models
  const mimo = getCapabilitiesForModel("oc", "mimo-v2.6-flash-free");
  assert.equal(mimo.vision, true);
  assert.equal(mimo.audioInput, true);
  assert.equal(mimo.reasoning, true);

  const glmFlash = getCapabilitiesForModel("z-ai", "glm-5.3-flash");
  assert.equal(glmFlash.vision, true);
  assert.equal(glmFlash.pdf, true);
  assert.equal(glmFlash.videoInput, true);

  const gemini = getCapabilitiesForModel("google", "gemini-2.0-flash");
  assert.equal(gemini.vision, true);
  assert.equal(gemini.search, true);
});

test("Capabilities - aggregateComboCapabilities union and intersection", () => {
  // Combo with 1 non-vision text model and 1 vision model
  const models = ["deepseek/deepseek-chat", "openai/gpt-4o"];
  const aggregated = aggregateComboCapabilities(models);

  assert.ok(aggregated);
  // Union of vision
  assert.equal(aggregated.vision, true);
  // Tools intersection
  assert.equal(aggregated.tools, true);
  // Reasoning from primary (deepseek-chat)
  assert.equal(aggregated.reasoning, true);
  // Conservative contextWindow = min(128000, 128000) = 128000
  assert.equal(aggregated.contextWindow, 128000);

  // Non-vision only combo
  const textOnlyCombo = aggregateComboCapabilities(["deepseek/deepseek-chat", "openai/gpt-4"]);
  assert.ok(textOnlyCombo);
  assert.equal(textOnlyCombo.vision, false);

  // Empty combo returns null
  assert.equal(aggregateComboCapabilities([]), null);
});
