import test from "node:test";
import assert from "node:assert/strict";
import { AnthropicAdapter } from "../src/core/adapters/anthropicAdapter.js";

test("AnthropicAdapter - anthropicToOpenAi preserves thinking blocks in conversation history", () => {
  const anthropicPayload = {
    model: "claude-3-7-sonnet",
    messages: [
      {
        role: "user",
        content: "What is 2 + 2?",
      },
      {
        role: "assistant",
        content: [
          {
            type: "thinking",
            thinking: "The user is asking a basic math question. 2 + 2 = 4.",
            signature: "sig_abc123",
          },
          {
            type: "text",
            text: "2 + 2 equals 4.",
          },
        ],
      },
      {
        role: "assistant",
        content: [
          {
            type: "thinking",
            thinking: "I should call the calculate tool.",
            signature: "sig_tool456",
          },
          {
            type: "tool_use",
            id: "call_calc_1",
            name: "calculate",
            input: { expression: "2+2" },
          },
        ],
      },
      {
        role: "assistant",
        content: [
          {
            type: "redacted_thinking",
            data: "redacted_data_xyz",
          },
          {
            type: "text",
            text: "Calculated successfully.",
          },
        ],
      },
    ],
  };

  const openAiPayload = AnthropicAdapter.anthropicToOpenAi(anthropicPayload);

  assert.equal(openAiPayload.messages.length, 4);

  // Turn 1 (Assistant text + thinking)
  const assistantTurn1 = openAiPayload.messages[1];
  assert.equal(assistantTurn1.role, "assistant");
  assert.equal(assistantTurn1.content, "2 + 2 equals 4.");
  assert.equal(
    assistantTurn1.reasoning_content,
    "The user is asking a basic math question. 2 + 2 = 4."
  );
  assert.equal(assistantTurn1.thinking_signature, "sig_abc123");

  // Turn 2 (Assistant thinking + tool_use, without text)
  const assistantTurn2 = openAiPayload.messages[2];
  assert.equal(assistantTurn2.role, "assistant");
  assert.equal(assistantTurn2.content, null);
  assert.equal(assistantTurn2.reasoning_content, "I should call the calculate tool.");
  assert.equal(assistantTurn2.thinking_signature, "sig_tool456");
  assert.equal(assistantTurn2.tool_calls.length, 1);
  assert.equal(assistantTurn2.tool_calls[0].id, "call_calc_1");

  // Turn 3 (Assistant redacted_thinking + text)
  const assistantTurn3 = openAiPayload.messages[3];
  assert.equal(assistantTurn3.role, "assistant");
  assert.equal(assistantTurn3.content, "Calculated successfully.");
  assert.equal(assistantTurn3.redacted_thinking, "redacted_data_xyz");
});

test("AnthropicAdapter - openAiToAnthropic converts reasoning_content to thinking block", () => {
  const openAiPayload = {
    model: "gpt-4o",
    messages: [
      {
        role: "assistant",
        reasoning_content: "Internal reasoning step",
        thinking_signature: "sig_reasoning_1",
        content: "Here is the response",
      },
    ],
  };

  const anthropicPayload = AnthropicAdapter.openAiToAnthropic(openAiPayload);
  const msg = anthropicPayload.messages[0];
  assert.equal(msg.role, "assistant");
  assert.ok(Array.isArray(msg.content));
  assert.equal(msg.content.length, 2);
  assert.deepEqual(msg.content[0], {
    type: "thinking",
    thinking: "Internal reasoning step",
    signature: "sig_reasoning_1",
  });
  assert.deepEqual(msg.content[1], {
    type: "text",
    text: "Here is the response",
  });
});

test("AnthropicAdapter - openAiChunkToAnthropicEvent stateful stream conversion with reasoning", () => {
  const messageId = "msg_test_reasoning_stream";
  const state = AnthropicAdapter.createStreamState(messageId);

  // 1. Chunk with reasoning_content
  const chunk1 = {
    id: "chatcmpl-1",
    choices: [
      {
        index: 0,
        delta: {
          reasoning_content: "First thought",
        },
        finish_reason: null,
      },
    ],
  };
  const events1 = AnthropicAdapter.openAiChunkToAnthropicEvent(chunk1, messageId, state);

  assert.equal(events1.length, 2);
  assert.ok(events1[0].includes("content_block_start"));
  assert.ok(events1[0].includes('"type":"thinking"'));
  assert.ok(events1[0].includes('"index":0'));
  assert.ok(events1[1].includes("content_block_delta"));
  assert.ok(events1[1].includes('"type":"thinking_delta"'));
  assert.ok(events1[1].includes('"thinking":"First thought"'));
  assert.ok(events1[1].includes('"index":0'));

  // 2. Chunk with delta.thought (Gemini / alternative vendor format)
  const chunk2 = {
    id: "chatcmpl-1",
    choices: [
      {
        index: 0,
        delta: {
          thought: " and second thought",
        },
        finish_reason: null,
      },
    ],
  };
  const events2 = AnthropicAdapter.openAiChunkToAnthropicEvent(chunk2, messageId, state);
  assert.equal(events2.length, 1);
  assert.ok(events2[0].includes("content_block_delta"));
  assert.ok(events2[0].includes('"thinking":" and second thought"'));
  assert.ok(events2[0].includes('"index":0'));

  // 3. Transition to content text (must stop thinking block 0, start text block 1, delta text)
  const chunk3 = {
    id: "chatcmpl-1",
    choices: [
      {
        index: 0,
        delta: {
          content: "Hello from model",
        },
        finish_reason: null,
      },
    ],
  };
  const events3 = AnthropicAdapter.openAiChunkToAnthropicEvent(chunk3, messageId, state);
  assert.equal(events3.length, 3);
  assert.ok(events3[0].includes("content_block_stop"));
  assert.ok(events3[0].includes('"index":0'));
  assert.ok(events3[1].includes("content_block_start"));
  assert.ok(events3[1].includes('"type":"text"'));
  assert.ok(events3[1].includes('"index":1'));
  assert.ok(events3[2].includes("content_block_delta"));
  assert.ok(events3[2].includes('"text_delta"'));
  assert.ok(events3[2].includes('"text":"Hello from model"'));
  assert.ok(events3[2].includes('"index":1'));

  // 4. Finish reason closes text block and emits message_delta & message_stop
  const chunk4 = {
    id: "chatcmpl-1",
    choices: [
      {
        index: 0,
        delta: {},
        finish_reason: "stop",
      },
    ],
    usage: {
      completion_tokens: 42,
    },
  };
  const events4 = AnthropicAdapter.openAiChunkToAnthropicEvent(chunk4, messageId, state);
  assert.equal(events4.length, 3);
  assert.ok(events4[0].includes("content_block_stop"));
  assert.ok(events4[0].includes('"index":1'));
  assert.ok(events4[1].includes("message_delta"));
  assert.ok(events4[1].includes('"stop_reason":"end_turn"'));
  assert.ok(events4[1].includes('"output_tokens":42'));
  assert.ok(events4[2].includes("message_stop"));
});

test("AnthropicAdapter - openAiChunkToAnthropicEvent tool calling lifecycle", () => {
  const messageId = "msg_test_tools";
  const state = AnthropicAdapter.createStreamState(messageId);

  // 1. Tool call start
  const chunk1 = {
    choices: [
      {
        delta: {
          tool_calls: [
            {
              index: 0,
              id: "call_abc",
              function: {
                name: "readFile",
                arguments: "",
              },
            },
          ],
        },
      },
    ],
  };
  const events1 = AnthropicAdapter.openAiChunkToAnthropicEvent(chunk1, messageId, state);
  assert.equal(events1.length, 1);
  assert.ok(events1[0].includes("content_block_start"));
  assert.ok(events1[0].includes('"type":"tool_use"'));
  assert.ok(events1[0].includes('"id":"call_abc"'));
  assert.ok(events1[0].includes('"name":"readFile"'));
  assert.ok(events1[0].includes('"index":0'));

  // 2. Tool call arg chunk
  const chunk2 = {
    choices: [
      {
        delta: {
          tool_calls: [
            {
              index: 0,
              function: {
                arguments: '{"path":"main.ts"}',
              },
            },
          ],
        },
      },
    ],
  };
  const events2 = AnthropicAdapter.openAiChunkToAnthropicEvent(chunk2, messageId, state);
  assert.equal(events2.length, 1);
  assert.ok(events2[0].includes("content_block_delta"));
  assert.ok(events2[0].includes('"type":"input_json_delta"'));
  assert.ok(events2[0].includes("main.ts"));
  assert.ok(events2[0].includes('"index":0'));

  // 3. Finish with tool_calls
  const chunk3 = {
    choices: [
      {
        delta: {},
        finish_reason: "tool_calls",
      },
    ],
  };
  const events3 = AnthropicAdapter.openAiChunkToAnthropicEvent(chunk3, messageId, state);
  assert.equal(events3.length, 3);
  assert.ok(events3[0].includes("content_block_stop"));
  assert.ok(events3[0].includes('"index":0'));
  assert.ok(events3[1].includes("message_delta"));
  assert.ok(events3[1].includes('"stop_reason":"tool_use"'));
  assert.ok(events3[2].includes("message_stop"));
});

test("AnthropicAdapter - anthropicChunkToOpenAiEvent ensures 0-based tool_calls.index", () => {
  const requestId = "req_tool_index_test";
  const state = AnthropicAdapter.createAnthropicToOpenAiState();

  // Suppose Claude returns thinking at block 0, text at block 1, and tool_use at block 2
  const eventToolStart = {
    type: "content_block_start",
    index: 2,
    content_block: {
      type: "tool_use",
      id: "toolu_01_bash",
      name: "bash",
    },
  };

  const chunks1 = AnthropicAdapter.anthropicChunkToOpenAiEvent(eventToolStart, requestId, state);
  assert.equal(chunks1.length, 1);
  const parsed1 = JSON.parse(chunks1[0].replace(/^data:\s*/, "").trim());
  assert.equal(parsed1.choices[0].delta.tool_calls[0].index, 0); // 0-based!
  assert.equal(parsed1.choices[0].delta.tool_calls[0].id, "toolu_01_bash");
  assert.equal(parsed1.choices[0].delta.tool_calls[0].function.name, "bash");

  // Subsequent delta for block 2
  const eventToolDelta = {
    type: "content_block_delta",
    index: 2,
    delta: {
      type: "input_json_delta",
      partial_json: '{"command":"ls"}',
    },
  };

  const chunks2 = AnthropicAdapter.anthropicChunkToOpenAiEvent(eventToolDelta, requestId, state);
  assert.equal(chunks2.length, 1);
  const parsed2 = JSON.parse(chunks2[0].replace(/^data:\s*/, "").trim());
  assert.equal(parsed2.choices[0].delta.tool_calls[0].index, 0); // Still index 0!
  assert.equal(parsed2.choices[0].delta.tool_calls[0].function.arguments, '{"command":"ls"}');

  // Second tool call at block index 3
  const eventTool2Start = {
    type: "content_block_start",
    index: 3,
    content_block: {
      type: "tool_use",
      id: "toolu_02_grep",
      name: "grep",
    },
  };

  const chunks3 = AnthropicAdapter.anthropicChunkToOpenAiEvent(eventTool2Start, requestId, state);
  assert.equal(chunks3.length, 1);
  const parsed3 = JSON.parse(chunks3[0].replace(/^data:\s*/, "").trim());
  assert.equal(parsed3.choices[0].delta.tool_calls[0].index, 1); // Incremented to 1!
  assert.equal(parsed3.choices[0].delta.tool_calls[0].id, "toolu_02_grep");
});
