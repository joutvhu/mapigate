import test from "node:test";
import assert from "node:assert/strict";
import { OpenAiAdapter } from "../src/core/adapters/openAiAdapter.js";
import { AnthropicAdapter } from "../src/core/adapters/anthropicAdapter.js";

const TOOLS = [
  {
    type: "function",
    function: {
      name: "update_plan",
      description: "Update the execution plan",
      parameters: {
        type: "object",
        properties: {
          explanation: { type: "string" },
          plan: {
            type: "array",
            items: {
              type: "object",
              properties: {
                step: { type: "string" },
                status: { type: "string" },
              },
            },
          },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "run_bash",
      parameters: {
        type: "object",
        properties: {
          command: { type: "string" },
        },
      },
    },
  },
];

test("OpenAiAdapter - rescues inline DeepSeek/Kimi dialect into tool_calls", () => {
  const rawResponse = {
    id: "chatcmpl-123",
    choices: [
      {
        message: {
          role: "assistant",
          content:
            '<|tool_calls_section_begin|><|tool_call_begin|>functions.run_bash:0<|tool_call_argument_begin|>{"command":"npm test"}<|tool_call_end|><|tool_calls_section_end|>',
        },
        finish_reason: "stop",
      },
    ],
  };

  const processed = OpenAiAdapter.rescueAndRepairResponse(rawResponse, TOOLS);
  const msg = processed.choices[0].message;

  assert.ok(msg.tool_calls, "Must synthesize tool_calls");
  assert.equal(msg.tool_calls.length, 1);
  assert.equal(msg.tool_calls[0].function.name, "run_bash");
  assert.equal(msg.tool_calls[0].function.arguments, '{"command":"npm test"}');
  assert.equal(processed.choices[0].finish_reason, "tool_calls");
  assert.equal(msg.content, null);
});

test("OpenAiAdapter - repairs double-encoded array parameter in existing tool_calls", () => {
  const rawResponse = {
    id: "chatcmpl-456",
    choices: [
      {
        message: {
          role: "assistant",
          content: null,
          tool_calls: [
            {
              id: "call_abc",
              type: "function",
              function: {
                name: "update_plan",
                arguments: JSON.stringify({
                  explanation: "Next steps",
                  plan: '[{"step":"Implement tests","status":"in_progress"}]',
                }),
              },
            },
          ],
        },
        finish_reason: "tool_calls",
      },
    ],
  };

  const processed = OpenAiAdapter.rescueAndRepairResponse(rawResponse, TOOLS);
  const tc = processed.choices[0].message.tool_calls[0];
  const parsedArgs = JSON.parse(tc.function.arguments);

  assert.equal(Array.isArray(parsedArgs.plan), true, "plan should be decoded into real array");
  assert.equal(parsedArgs.plan[0].step, "Implement tests");
  assert.equal(parsedArgs.explanation, "Next steps");
});

test("OpenAiAdapter - leaves regular non-tool responses untouched", () => {
  const regularResponse = {
    id: "chatcmpl-789",
    choices: [
      {
        message: {
          role: "assistant",
          content: "Hello! How can I help you today?",
        },
        finish_reason: "stop",
      },
    ],
  };

  const processed = OpenAiAdapter.rescueAndRepairResponse(regularResponse, TOOLS);
  assert.equal(processed.choices[0].message.content, "Hello! How can I help you today?");
  assert.equal(processed.choices[0].message.tool_calls, undefined);
});

test("AnthropicAdapter - openAiToAnthropic rescues inline dialect and repairs double encoding", () => {
  const openAiPayload = {
    model: "claude-3-7-sonnet",
    messages: [
      {
        role: "assistant",
        content:
          '<tool_call>{"name":"update_plan","arguments":{"explanation":"rescuing","plan":"[{\\"step\\":\\"refactor\\",\\"status\\":\\"done\\"}]"}}</tool_call>',
      },
    ],
    tools: TOOLS,
  };

  const anthropicPayload = AnthropicAdapter.openAiToAnthropic(openAiPayload);
  const msg = anthropicPayload.messages[0];
  assert.equal(msg.role, "assistant");
  assert.ok(Array.isArray(msg.content));

  const toolUseBlock = msg.content.find((b: any) => b.type === "tool_use");
  assert.ok(toolUseBlock, "Must convert rescued dialect to tool_use block");
  assert.equal(toolUseBlock.name, "update_plan");
  assert.equal(Array.isArray(toolUseBlock.input.plan), true);
  assert.equal(toolUseBlock.input.plan[0].step, "refactor");
});

test("AnthropicAdapter - openAiChunkToAnthropicEvent repairs single-chunk tool call arguments", () => {
  const streamState = AnthropicAdapter.createStreamState("msg_test", TOOLS);

  const chunk1 = {
    choices: [
      {
        delta: {
          tool_calls: [
            {
              index: 0,
              id: "call_stream_1",
              function: {
                name: "update_plan",
                arguments: JSON.stringify({
                  explanation: "streamed",
                  plan: '[{"step":"deploy","status":"pending"}]',
                }),
              },
            },
          ],
        },
      },
    ],
  };

  const events = AnthropicAdapter.openAiChunkToAnthropicEvent(chunk1, "msg_test", streamState);
  assert.ok(events.length >= 2, "Should emit start and delta events");

  const deltaEvent = events.find((e) => e.includes("input_json_delta"));
  assert.ok(deltaEvent, "Must emit input_json_delta");

  const dataMatch = /data:\s*(.*)\n\n/.exec(deltaEvent!);
  assert.ok(dataMatch);
  const parsedData = JSON.parse(dataMatch[1]);
  const parsedInput = JSON.parse(parsedData.delta.partial_json);

  assert.equal(Array.isArray(parsedInput.plan), true, "Streaming tool arguments should be repaired");
  assert.equal(parsedInput.plan[0].step, "deploy");
});
