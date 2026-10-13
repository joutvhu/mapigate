process.env.NODE_ENV = "test";

import test from "node:test";
import assert from "node:assert/strict";
import {
  CAVEMAN_LEVELS,
  CAVEMAN_PROMPTS,
  CavemanMethod,
  PONYTAIL_LEVELS,
  PONYTAIL_PROMPTS,
  PonytailMethod,
  injectSystemPrompt,
} from "../src/core/tokenSaver/index.js";

test("Caveman - prompt coverage & quality constraints", () => {
  const levels = Object.values(CAVEMAN_LEVELS);
  for (const lvl of levels) {
    const prompt = CAVEMAN_PROMPTS[lvl];
    assert.ok(typeof prompt === "string", `Prompt for ${lvl} should be string`);
    assert.ok(prompt.length > 50, `Prompt for ${lvl} should be non-trivial`);
    assert.ok(prompt.includes("No invented abbreviations"), `Missing abbrev guidance in ${lvl}`);
    assert.ok(prompt.includes("Preserve the user's dominant language"), `Missing lang guidance in ${lvl}`);
    assert.ok(prompt.includes("No self-reference"), `Missing self-ref guidance in ${lvl}`);
    assert.ok(prompt.includes("No decorative emoji"), `Missing emoji guidance in ${lvl}`);
    // Should NOT contain Unicode causality arrow
    assert.ok(!prompt.includes("→"), `Should not contain Unicode arrow in ${lvl}`);
  }
});

test("Ponytail - prompt coverage & senior dev ladder", () => {
  const levels = Object.values(PONYTAIL_LEVELS);
  for (const lvl of levels) {
    const prompt = PONYTAIL_PROMPTS[lvl];
    assert.ok(typeof prompt === "string", `Prompt for ${lvl} should be string`);
    assert.ok(prompt.length > 50, `Prompt for ${lvl} should be non-trivial`);
    assert.ok(prompt.includes("lazy senior developer"), `Missing persona in ${lvl}`);
    assert.ok(prompt.includes("YAGNI"), `Missing YAGNI in ${lvl}`);
    assert.ok(prompt.includes("Code first"), `Missing output format in ${lvl}`);
    assert.ok(prompt.includes("Never simplify away"), `Missing safety boundary in ${lvl}`);
  }
});

test("System Injector - OpenAI Chat messages format", () => {
  // Case A: No existing system message -> inserts at index 0
  const bodyA = {
    messages: [
      { role: "user", content: "Hello" },
    ],
  };
  const injectedA = injectSystemPrompt(bodyA, "openai", "Test system instruction");
  assert.equal(injectedA, true);
  assert.equal(bodyA.messages[0].role, "system");
  assert.equal(bodyA.messages[0].content, "Test system instruction");

  // Case B: Existing system message -> appends with delimiter
  const bodyB = {
    messages: [
      { role: "system", content: "Base system prompt" },
      { role: "user", content: "Hello" },
    ],
  };
  const injectedB = injectSystemPrompt(bodyB, "openai", "Test system instruction");
  assert.equal(injectedB, true);
  assert.equal(bodyB.messages[0].content, "Base system prompt\n\nTest system instruction");

  // Case C: Idempotent -> second injection does not duplicate
  const injectedC = injectSystemPrompt(bodyB, "openai", "Test system instruction");
  assert.equal(injectedC, false);
  assert.equal(bodyB.messages[0].content, "Base system prompt\n\nTest system instruction");
});

test("System Injector - OpenAI Responses input format", () => {
  const body = {
    input: [
      { type: "message", role: "user", content: [{ type: "input_text", text: "Hello" }] },
    ],
  };
  const injected = injectSystemPrompt(body, "openai", "Responses system prompt");
  assert.equal(injected, true);
  assert.equal(body.input[0].type, "message");
  assert.equal(body.input[0].role, "system");
  assert.deepEqual(body.input[0].content, [{ type: "input_text", text: "Responses system prompt" }]);
});

test("System Injector - Claude format (string and array with cache control)", () => {
  // String system prompt
  const bodyStr = {
    system: "Original Claude instructions",
    messages: [{ role: "user", content: "Hi" }],
  };
  injectSystemPrompt(bodyStr, "claude", "Terse caveman mode");
  assert.equal(bodyStr.system, "Original Claude instructions\n\nTerse caveman mode");

  // Array system prompt with cache_control
  const bodyArr = {
    system: [
      { type: "text", text: "Base prompt block" },
      { type: "text", text: "Cached block", cache_control: { type: "ephemeral" } },
    ],
    messages: [{ role: "user", content: "Hi" }],
  };
  injectSystemPrompt(bodyArr, "claude", "Injected block");
  // Injected before the last cache_control block
  assert.equal(bodyArr.system.length, 3);
  assert.equal(bodyArr.system[1].text, "Injected block");
  assert.equal(bodyArr.system[2].text, "Cached block");
});

test("System Injector - Gemini format", () => {
  const body = {
    contents: [{ role: "user", parts: [{ text: "Hi" }] }],
  };
  injectSystemPrompt(body, "gemini", "Gemini instruction");
  assert.deepEqual((body as any).systemInstruction, {
    parts: [{ text: "Gemini instruction" }],
  });
});

test("System Injector - Kiro format (conversationState)", () => {
  const body = {
    conversationState: {
      history: [
        { userInputMessage: { content: "Original user turn" } },
      ],
      currentMessage: { userInputMessage: { content: "Current turn" } },
    },
  };
  injectSystemPrompt(body, "kiro", "Kiro injected prompt");
  const firstUser = body.conversationState.history[0].userInputMessage.content;
  assert.equal(firstUser, "Original user turn\n\nKiro injected prompt");

  // Idempotency check
  injectSystemPrompt(body, "kiro", "Kiro injected prompt");
  assert.equal(body.conversationState.history[0].userInputMessage.content, "Original user turn\n\nKiro injected prompt");
});

test("Method integration - CavemanMethod and PonytailMethod execution", () => {
  const caveman = new CavemanMethod();
  const ponytail = new PonytailMethod();

  const body1 = { messages: [{ role: "user", content: "Code this" }] };
  const res1 = caveman.process(body1, { enabled: true, level: "ultra" });
  assert.equal(res1.applied, true);
  assert.equal(res1.tokensSaved, 0);
  assert.ok(body1.messages[0].content.includes("Respond ultra-terse"));

  const body2 = { messages: [{ role: "user", content: "Refactor this" }] };
  const res2 = ponytail.process(body2, { enabled: true, level: "full" });
  assert.equal(res2.applied, true);
  assert.ok(body2.messages[0].content.includes("lazy senior developer"));
});
