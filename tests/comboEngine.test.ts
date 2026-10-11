process.env.NODE_ENV = "test";

import test from "node:test";
import assert from "node:assert/strict";
import {
  getRotatedModels,
  resetComboRotation,
  comboRotationState,
  flattenToolHistory,
  buildJudgePrompt,
  extractPanelText,
  handleFallbackChat,
  handleFusionChat,
  checkFallbackError,
} from "../src/core/router/comboEngine.js";

test("ComboEngine - Round Robin rotation with sticky limit", () => {
  resetComboRotation("test-combo");
  const models = ["model-a", "model-b", "model-c"];

  // Sticky limit = 2 (each model is used 2 times before rotating)
  const req1 = getRotatedModels(models, "test-combo", "round-robin", 2);
  assert.equal(req1[0], "model-a");

  const req2 = getRotatedModels(models, "test-combo", "round-robin", 2);
  assert.equal(req2[0], "model-a");

  // On 3rd request, rotates to model-b
  const req3 = getRotatedModels(models, "test-combo", "round-robin", 2);
  assert.equal(req3[0], "model-b");

  const req4 = getRotatedModels(models, "test-combo", "round-robin", 2);
  assert.equal(req4[0], "model-b");

  // On 5th request, rotates to model-c
  const req5 = getRotatedModels(models, "test-combo", "round-robin", 2);
  assert.equal(req5[0], "model-c");

  // Reset rotation
  resetComboRotation("test-combo");
  assert.equal(comboRotationState.has("test-combo"), false);
});

test("ComboEngine - flattenToolHistory converts structured tools to plain prose", () => {
  const messagesWithTools = [
    { role: "user", content: "Check the weather in Hanoi" },
    {
      role: "assistant",
      content: "Let me check.",
      tool_calls: [
        { id: "call_1", function: { name: "get_weather", arguments: '{"city":"Hanoi"}' } },
      ],
    },
    {
      role: "tool",
      tool_call_id: "call_1",
      content: '{"temp": 28, "unit": "C"}',
    },
    {
      role: "assistant",
      content: [
        { type: "text", text: "Got result." },
        { type: "tool_use", id: "call_2", name: "get_forecast" },
      ],
    },
    {
      role: "user",
      content: [
        { type: "tool_result", tool_use_id: "call_2", content: "Sunny tomorrow" },
      ],
    },
  ];

  const flattened = flattenToolHistory(messagesWithTools);

  // Message 2: assistant with tool_calls -> content must contain "[Called tools: get_weather]"
  assert.ok(flattened[1].content.includes("[Called tools: get_weather]"));
  assert.equal(flattened[1].tool_calls, undefined);

  // Message 3: role tool -> role assistant with "[Tool result:"
  assert.equal(flattened[2].role, "assistant");
  assert.ok(flattened[2].content.includes("[Tool result:"));

  // Message 4: array content with tool_use -> inlined "[Called tools: get_forecast]"
  assert.ok(flattened[3].content.includes("[Called tools: get_forecast]"));

  // Message 5: array content with tool_result -> inlined "[Tool result: Sunny tomorrow]"
  assert.ok(flattened[4].content.includes("[Tool result: Sunny tomorrow]"));
});

test("ComboEngine - buildJudgePrompt and extractPanelText", () => {
  const answers = [
    { model: "model-alpha", text: "Answer from model Alpha." },
    { model: "model-beta", text: "Answer from model Beta with additional insights." },
  ];

  const prompt = buildJudgePrompt(answers);
  assert.ok(prompt.includes("You are the JUDGE in a model-fusion panel"));
  assert.ok(prompt.includes("[Source 1]"));
  assert.ok(prompt.includes("Answer from model Alpha."));
  assert.ok(prompt.includes("[Source 2]"));
  assert.ok(prompt.includes("Answer from model Beta with additional insights."));
  assert.ok(!prompt.includes("model-alpha"), "Source model names must be anonymized");

  // extractPanelText tests
  const openAiJson = { choices: [{ message: { content: "OpenAI response text" } }] };
  assert.equal(extractPanelText(openAiJson), "OpenAI response text");

  const claudeJson = { content: [{ type: "text", text: "Claude response text" }] };
  assert.equal(extractPanelText(claudeJson), "Claude response text");

  const geminiJson = { candidates: [{ content: { parts: [{ text: "Gemini response text" }] } }] };
  assert.equal(extractPanelText(geminiJson), "Gemini response text");
});

test("ComboEngine - checkFallbackError classification", () => {
  assert.equal(checkFallbackError(429).shouldFallback, true);
  assert.equal(checkFallbackError(502).shouldFallback, true);
  assert.equal(checkFallbackError(503).shouldFallback, true);
  assert.equal(checkFallbackError(504).shouldFallback, true);
  assert.equal(checkFallbackError(400, "resource_exhausted: quota exceeded").shouldFallback, true);
  assert.equal(checkFallbackError(401, "insufficient credits").shouldFallback, true);
  assert.equal(checkFallbackError(400, "invalid json syntax").shouldFallback, false);
});

test("ComboEngine - handleFallbackChat sequential fallback on 429/503", async () => {
  const callLog: string[] = [];
  const fakeHandler = async (_body: any, modelStr: string) => {
    callLog.push(modelStr);
    if (modelStr === "provider-1/model-a") {
      return { ok: false, status: 429, error: "Rate limit reached" };
    }
    if (modelStr === "provider-2/model-b") {
      return { ok: false, status: 503, error: "Service unavailable" };
    }
    if (modelStr === "provider-3/model-c") {
      return { ok: true, status: 200, text: "Success from Model C" };
    }
    return { ok: false, status: 500 };
  };

  const models = ["provider-1/model-a", "provider-2/model-b", "provider-3/model-c"];
  const result = await handleFallbackChat({
    body: { messages: [{ role: "user", content: "Hi" }] },
    models,
    handleSingleModel: fakeHandler,
    comboName: "test-fallback",
    comboStrategy: "fallback",
    log: { info: () => {}, warn: () => {} },
  });

  assert.equal(result.ok, true);
  assert.equal(result.modelUsed, "provider-3/model-c");
  assert.equal(result.text, "Success from Model C");
  assert.deepEqual(callLog, ["provider-1/model-a", "provider-2/model-b", "provider-3/model-c"]);
});

test("ComboEngine - handleFusionChat parallel fan-out and Judge synthesis", async () => {
  const panelCalls: string[] = [];
  let judgeCalled = false;
  let judgePromptPassed = "";

  const fakeHandler = async (body: any, modelStr: string, isPanel = false) => {
    if (isPanel) {
      panelCalls.push(modelStr);
      assert.equal(body.stream, false, "Panel models must run with stream: false");
      assert.equal(body.tools, undefined, "Panel models must have tools stripped");
      return {
        ok: true,
        status: 200,
        json: {
          choices: [{ message: { content: `Analysis from ${modelStr}` } }],
        },
      };
    }

    // Judge Model call
    judgeCalled = true;
    const lastUserMsg = body.messages[body.messages.length - 1];
    judgePromptPassed = lastUserMsg.content;
    return {
      ok: true,
      status: 200,
      text: "Final synthesized judgment from all panel experts.",
    };
  };

  const panelModels = ["provider-1/expert-a", "provider-2/expert-b"];
  const result = await handleFusionChat({
    body: {
      messages: [{ role: "user", content: "What is quantum computing?" }],
      stream: true,
      tools: [{ type: "function", function: { name: "search" } }],
    },
    models: panelModels,
    handleSingleModel: fakeHandler,
    comboName: "test-fusion",
    judgeModel: "provider-1/judge-supreme",
    log: { info: () => {}, warn: () => {} },
  });

  assert.equal(result.ok, true);
  assert.equal(panelCalls.length, 2);
  assert.ok(panelCalls.includes("provider-1/expert-a"));
  assert.ok(panelCalls.includes("provider-2/expert-b"));
  assert.equal(judgeCalled, true);
  assert.ok(judgePromptPassed.includes("Analysis from provider-1/expert-a"));
  assert.ok(judgePromptPassed.includes("Analysis from provider-2/expert-b"));
  assert.equal(result.text, "Final synthesized judgment from all panel experts.");
});
