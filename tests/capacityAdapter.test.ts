process.env.NODE_ENV = "test";

import test from "node:test";
import assert from "node:assert/strict";
import {
  detectRequiredCapabilities,
  augmentModelsWithCapacityAdapter,
  stripHistoryForContext,
} from "../src/core/router/capacityAdapter.js";
import { type CapacityAdapterSettings, DEFAULT_FALLBACK_MODEL } from "../src/storage/repositories/settingsRepo.js";

test("CapacityAdapter - detectRequiredCapabilities across formats", () => {
  // 1. OpenAI format with image_url
  const openAiImageBody = {
    messages: [
      { role: "system", content: "You are a helpful assistant." },
      {
        role: "user",
        content: [
          { type: "text", text: "What is this image?" },
          { type: "image_url", image_url: { url: "https://example.com/test.png" } },
        ],
      },
    ],
  };
  const caps1 = detectRequiredCapabilities(openAiImageBody);
  assert.ok(caps1.has("vision"));
  assert.equal(caps1.has("audioInput"), false);

  // 2. Anthropic format with base64 image block
  const anthropicImageBody = {
    messages: [
      {
        role: "user",
        content: [
          { type: "image", source: { type: "base64", media_type: "image/jpeg", data: "..." } },
          { type: "text", text: "Analyze this image." },
        ],
      },
    ],
  };
  const caps2 = detectRequiredCapabilities(anthropicImageBody);
  assert.ok(caps2.has("vision"));

  // 3. Audio input detection
  const audioBody = {
    messages: [
      {
        role: "user",
        content: [
          { type: "input_audio", input_audio: { format: "wav", data: "..." } },
        ],
      },
    ],
  };
  const caps3 = detectRequiredCapabilities(audioBody);
  assert.ok(caps3.has("audioInput"));

  // 4. PDF document detection
  const pdfBody = {
    messages: [
      {
        role: "user",
        content: [
          { type: "document", source: { media_type: "application/pdf", data: "..." } },
        ],
      },
    ],
  };
  const caps4 = detectRequiredCapabilities(pdfBody);
  assert.ok(caps4.has("pdf"));

  // 5. Plain text only has no modalities
  const plainBody = {
    messages: [{ role: "user", content: "Hello world!" }],
  };
  const caps5 = detectRequiredCapabilities(plainBody);
  assert.equal(caps5.size, 0);

  // 6. Old turns with media are NOT detected if trailing turn is text only
  const historyBody = {
    messages: [
      {
        role: "user",
        content: [{ type: "image_url", image_url: { url: "https://example.com/old.png" } }],
      },
      { role: "assistant", content: "I see an apple." },
      { role: "user", content: "Can you tell me more about apples?" },
    ],
  };
  const caps6 = detectRequiredCapabilities(historyBody);
  assert.equal(caps6.has("vision"), false, "History media must not trigger active capacity adapter");
});

test("CapacityAdapter - augmentModelsWithCapacityAdapter prepends adapter when needed", () => {
  const testSettings: CapacityAdapterSettings = {
    vision: {
      enabled: true,
      roundRobin: false,
      models: [DEFAULT_FALLBACK_MODEL, "google/gemini-2.0-flash"],
    },
    audioInput: {
      enabled: true,
      roundRobin: false,
      models: [DEFAULT_FALLBACK_MODEL],
    },
    pdf: {
      enabled: false,
      roundRobin: false,
      models: [],
    },
  };

  // Case A: Model already has vision -> NO prepending
  const visionCapable = ["anthropic/claude-3-7-sonnet"];
  const out1 = augmentModelsWithCapacityAdapter(visionCapable, new Set(["vision"]), testSettings);
  assert.deepEqual(out1, visionCapable);

  // Case B: Model lacks vision -> Prepends capable adapter models
  const nonVisionModels = ["deepseek/deepseek-chat"];
  const out2 = augmentModelsWithCapacityAdapter(nonVisionModels, new Set(["vision"]), testSettings);
  assert.equal(out2[0], DEFAULT_FALLBACK_MODEL);
  assert.ok(out2.includes("google/gemini-2.0-flash"));
  assert.ok(out2.includes("deepseek/deepseek-chat"));
  // Original model must be preserved as fallback
  assert.equal(out2[out2.length - 1], "deepseek/deepseek-chat");

  // Case C: Capability not enabled in settings -> No change
  const out3 = augmentModelsWithCapacityAdapter(nonVisionModels, new Set(["pdf"]), testSettings);
  assert.deepEqual(out3, nonVisionModels);

  // Case D: Empty required capabilities -> No change
  const out4 = augmentModelsWithCapacityAdapter(nonVisionModels, new Set(), testSettings);
  assert.deepEqual(out4, nonVisionModels);
});

test("CapacityAdapter - stripHistoryForContext keeps system and tail turn", () => {
  const longPrompt = "A".repeat(5000);
  const body = {
    messages: [
      { role: "system", content: "System instructions here." },
      { role: "user", content: "Turn 1 " + longPrompt },
      { role: "assistant", content: "Turn 2 " + longPrompt },
      { role: "user", content: "Turn 3 " + longPrompt },
      { role: "assistant", content: "Turn 4 " + longPrompt },
      { role: "user", content: "Active tail user turn with image" },
    ],
  };

  // Strip with a very small context window budget (e.g. 1000 tokens ~ 4000 chars * 0.8 = 3200 chars)
  const trimmed = stripHistoryForContext(body, 1000);
  assert.ok(trimmed.messages.length < body.messages.length);

  // System prompt MUST be preserved
  assert.equal(trimmed.messages[0].role, "system");
  assert.equal(trimmed.messages[0].content, "System instructions here.");

  // Tail user prompt MUST be preserved
  const lastMsg = trimmed.messages[trimmed.messages.length - 1];
  assert.equal(lastMsg.role, "user");
  assert.equal(lastMsg.content, "Active tail user turn with image");
});
