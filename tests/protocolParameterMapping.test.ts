process.env.NODE_ENV = "test";

import test from "node:test";
import assert from "node:assert/strict";
import { translateAnthropicToOpenAi } from "../src/core/adapters/anthropic/requestAnthropicToOpenAi.js";
import { translateOpenAiToAnthropic } from "../src/core/adapters/anthropic/requestOpenAiToAnthropic.js";

test("Protocol Parameter Mapping - Anthropic stop_sequences -> OpenAI stop (capped at 4)", () => {
  const anthropicPayload = {
    model: "claude-3-5-sonnet",
    messages: [{ role: "user", content: "hi" }],
    max_tokens: 100,
    stop_sequences: ["\nObservation:", "Human:", "Assistant:", "STOP5", "STOP6"],
  };

  const openAiResult = translateAnthropicToOpenAi(anthropicPayload);
  assert.ok(openAiResult.stop);
  assert.deepEqual(openAiResult.stop, [
    "\nObservation:",
    "Human:",
    "Assistant:",
    "STOP5",
  ]);
  assert.equal(openAiResult.stop.length, 4);
});

test("Protocol Parameter Mapping - OpenAI stop -> Anthropic stop_sequences", () => {
  // 1. Single string stop
  const singleStop = translateOpenAiToAnthropic({
    model: "gpt-4o",
    messages: [{ role: "user", content: "hi" }],
    stop: "Observation:",
  });
  assert.deepEqual(singleStop.stop_sequences, ["Observation:"]);

  // 2. Array stop
  const arrayStop = translateOpenAiToAnthropic({
    model: "gpt-4o",
    messages: [{ role: "user", content: "hi" }],
    stop: ["stop1", "stop2"],
  });
  assert.deepEqual(arrayStop.stop_sequences, ["stop1", "stop2"]);
});

test("Protocol Parameter Mapping - parallel_tool_calls: false -> disable_parallel_tool_use: true", () => {
  const result = translateOpenAiToAnthropic({
    model: "gpt-4o",
    messages: [{ role: "user", content: "hi" }],
    parallel_tool_calls: false,
  });

  assert.ok(result.tool_choice);
  assert.equal(result.tool_choice.disable_parallel_tool_use, true);
});
