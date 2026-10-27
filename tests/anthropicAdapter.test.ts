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

test("AnthropicAdapter - openAiToAnthropic converts image_url to Anthropic image source block", () => {
  const openAiPayload = {
    model: "claude-3-5-sonnet",
    messages: [
      {
        role: "user",
        content: [
          { type: "text", text: "What is in this diagram?" },
          {
            type: "image_url",
            image_url: {
              url: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
            },
          },
        ],
      },
    ],
  };

  const anthropicPayload = AnthropicAdapter.openAiToAnthropic(openAiPayload);
  const msg = anthropicPayload.messages[0];
  assert.equal(msg.role, "user");
  assert.ok(Array.isArray(msg.content));
  assert.equal(msg.content.length, 2);
  assert.deepEqual(msg.content[0], { type: "text", text: "What is in this diagram?" });
  assert.equal(msg.content[1].type, "image");
  assert.equal(msg.content[1].source.type, "base64");
  assert.equal(msg.content[1].source.media_type, "image/png");
  assert.ok(msg.content[1].source.data.startsWith("iVBORw"));
});

test("AnthropicAdapter - anthropicToOpenAi converts Anthropic image block to image_url", () => {
  const anthropicPayload = {
    model: "gpt-4o",
    messages: [
      {
        role: "user",
        content: [
          { type: "text", text: "Analyze this image" },
          {
            type: "image",
            source: {
              type: "base64",
              media_type: "image/jpeg",
              data: "/9j/4AAQSkZJRg==",
            },
          },
        ],
      },
    ],
  };

  const openAiPayload = AnthropicAdapter.anthropicToOpenAi(anthropicPayload);
  const msg = openAiPayload.messages[0];
  assert.equal(msg.role, "user");
  assert.ok(Array.isArray(msg.content));
  assert.equal(msg.content.length, 2);
  assert.deepEqual(msg.content[0], { type: "text", text: "Analyze this image" });
  assert.deepEqual(msg.content[1], {
    type: "image_url",
    image_url: { url: "data:image/jpeg;base64,/9j/4AAQSkZJRg==" },
  });
});

test("AnthropicAdapter - anthropicChunkToOpenAiEvent captures message_start input_tokens into message_delta usage", () => {
  const requestId = "req_usage_capture_test";
  const state = AnthropicAdapter.createAnthropicToOpenAiState();

  const msgStartEvent = {
    type: "message_start",
    message: {
      id: "msg_123",
      role: "assistant",
      usage: {
        input_tokens: 1500,
        cache_creation_input_tokens: 300,
        cache_read_input_tokens: 1200,
      },
    },
  };
  AnthropicAdapter.anthropicChunkToOpenAiEvent(msgStartEvent, requestId, state);

  assert.equal(state.promptTokens, 3000);
  assert.equal(state.cachedTokens, 1200);

  const msgDeltaEvent = {
    type: "message_delta",
    delta: { stop_reason: "end_turn" },
    usage: { output_tokens: 85 },
  };
  const chunks = AnthropicAdapter.anthropicChunkToOpenAiEvent(msgDeltaEvent, requestId, state);
  assert.equal(chunks.length, 1);
  const parsed = JSON.parse(chunks[0].replace(/^data:\s*/, "").trim());
  assert.equal(parsed.usage.prompt_tokens, 3000);
  assert.equal(parsed.usage.completion_tokens, 85);
  assert.equal(parsed.usage.total_tokens, 3085);
  assert.equal(parsed.usage.prompt_tokens_details.cached_tokens, 1200);
});

test("AnthropicAdapter - openAiChunkToAnthropicEvent closes previous tool_call before starting next tool_call", () => {
  const messageId = "msg_multi_tool_test";
  const state = AnthropicAdapter.createStreamState(messageId);

  // Chunk 1: Tool call 0 starts
  const chunk1 = {
    choices: [
      {
        delta: {
          tool_calls: [
            {
              index: 0,
              id: "call_001",
              function: { name: "toolA", arguments: '{"a":' },
            },
          ],
        },
      },
    ],
  };
  const events1 = AnthropicAdapter.openAiChunkToAnthropicEvent(chunk1, messageId, state);
  assert.ok(events1.some((e) => e.includes("content_block_start") && e.includes('"name":"toolA"')));

  // Chunk 2: Tool call 1 starts (different index)
  const chunk2 = {
    choices: [
      {
        delta: {
          tool_calls: [
            {
              index: 1,
              id: "call_002",
              function: { name: "toolB", arguments: '{"b":' },
            },
          ],
        },
      },
    ],
  };
  const events2 = AnthropicAdapter.openAiChunkToAnthropicEvent(chunk2, messageId, state);

  // Must stop toolA block BEFORE starting toolB block!
  const stopIndex = events2.findIndex((e) => e.includes("content_block_stop") && e.includes('"index":0'));
  const startIndex = events2.findIndex((e) => e.includes("content_block_start") && e.includes('"name":"toolB"'));

  assert.ok(stopIndex !== -1, "Must contain content_block_stop for toolA");
  assert.ok(startIndex !== -1, "Must contain content_block_start for toolB");
  assert.ok(stopIndex < startIndex, "content_block_stop must occur before content_block_start of next tool");
});

test("AnthropicAdapter - openAiResponseToAnthropic guarantees dictionary tool input and non-empty content", () => {
  const openAiResponse = {
    id: "chatcmpl-test-response",
    model: "gpt-4o",
    choices: [
      {
        message: {
          role: "assistant",
          content: null,
          tool_calls: [
            {
              id: "",
              type: "function",
              function: {
                name: "doSomething",
                arguments: '"string_arg_not_object"',
              },
            },
          ],
        },
        finish_reason: "tool_calls",
      },
    ],
    usage: { prompt_tokens: 10, completion_tokens: 15 },
  };

  const anthropicRes = AnthropicAdapter.openAiResponseToAnthropic(openAiResponse, "req-test-resp");
  assert.equal(anthropicRes.type, "message");
  assert.equal(anthropicRes.role, "assistant");
  assert.equal(anthropicRes.stop_reason, "tool_use");
  assert.equal(anthropicRes.content.length, 1);
  const toolBlock = anthropicRes.content[0];
  assert.equal(toolBlock.type, "tool_use");
  assert.ok(toolBlock.id.startsWith("toolu_"), "Should mint valid toolu_ id");
  assert.equal(typeof toolBlock.input, "object");
  assert.equal(Array.isArray(toolBlock.input), false);
  assert.deepEqual(toolBlock.input, { input: "string_arg_not_object" });

  // Test empty content fallback
  const emptyOpenAiResponse = {
    id: "chatcmpl-empty",
    model: "gpt-4o",
    choices: [
      {
        message: { role: "assistant", content: "" },
        finish_reason: "stop",
      },
    ],
  };
  const emptyAnthropicRes = AnthropicAdapter.openAiResponseToAnthropic(emptyOpenAiResponse);
  assert.equal(emptyAnthropicRes.content.length, 1);
  assert.deepEqual(emptyAnthropicRes.content[0], { type: "text", text: "" });
});

test("AnthropicAdapter - anthropicResponseToOpenAi converts Anthropic Message response to OpenAI Chat Completion", () => {
  const anthropicRes = {
    id: "msg_test_12345",
    type: "message",
    role: "assistant",
    model: "claude-3-7-sonnet-20250219",
    content: [
      {
        type: "thinking",
        thinking: "Let me check the files.",
        signature: "sig_abc",
      },
      {
        type: "text",
        text: "Here are the files in your project.",
      },
      {
        type: "tool_use",
        id: "toolu_01_ls",
        name: "list_files",
        input: { path: "src" },
      },
    ],
    stop_reason: "tool_use",
    usage: {
      input_tokens: 250,
      output_tokens: 120,
      cache_read_input_tokens: 1500,
      cache_creation_input_tokens: 200,
    },
  };

  const openAiRes = AnthropicAdapter.anthropicResponseToOpenAi(anthropicRes, "gpt-4o-mapped");
  assert.equal(openAiRes.object, "chat.completion");
  assert.equal(openAiRes.model, "gpt-4o-mapped");
  assert.ok(openAiRes.id.startsWith("chatcmpl_test_12345"));
  assert.equal(openAiRes.choices.length, 1);

  const choice = openAiRes.choices[0];
  assert.equal(choice.finish_reason, "tool_calls");
  assert.equal(choice.message.role, "assistant");
  assert.equal(choice.message.content, "Here are the files in your project.");
  assert.equal(choice.message.reasoning_content, "Let me check the files.");
  assert.equal(choice.message.tool_calls.length, 1);
  assert.equal(choice.message.tool_calls[0].id, "toolu_01_ls");
  assert.equal(choice.message.tool_calls[0].function.name, "list_files");
  assert.equal(choice.message.tool_calls[0].function.arguments, JSON.stringify({ path: "src" }));

  // Usage: promptTokens should fold cache (250 + 1500 + 200 = 1950)
  assert.equal(openAiRes.usage.prompt_tokens, 1950);
  assert.equal(openAiRes.usage.completion_tokens, 120);
  assert.equal(openAiRes.usage.total_tokens, 2070);
  assert.equal(openAiRes.usage.prompt_tokens_details.cached_tokens, 1500);
});

test("AnthropicAdapter - openAiToAnthropic converts image_url parts in role: 'tool' to Claude image blocks", () => {
  const openAiPayload = {
    model: "claude-haiku-4-5",
    messages: [
      { role: "user", content: "Inspect screenshot" },
      {
        role: "assistant",
        content: null,
        tool_calls: [
          {
            id: "call_browser_1",
            type: "function",
            function: { name: "take_screenshot", arguments: "{}" },
          },
        ],
      },
      {
        role: "tool",
        tool_call_id: "call_browser_1",
        content: [
          { type: "text", text: "Screenshot captured:" },
          {
            type: "image_url",
            image_url: { url: "data:image/png;base64,iVBORw0KGgo=" },
          },
        ],
      },
    ],
  };

  const anthropicPayload = AnthropicAdapter.openAiToAnthropic(openAiPayload);
  assert.equal(anthropicPayload.messages.length, 3);
  const toolMsg = anthropicPayload.messages[2];
  assert.equal(toolMsg.role, "user");
  assert.ok(Array.isArray(toolMsg.content));
  const toolResult = toolMsg.content[0];
  assert.equal(toolResult.type, "tool_result");
  assert.equal(toolResult.tool_use_id, "call_browser_1");
  assert.ok(Array.isArray(toolResult.content));
  assert.equal(toolResult.content.length, 2);
  assert.deepEqual(toolResult.content[0], { type: "text", text: "Screenshot captured:" });
  assert.deepEqual(toolResult.content[1], {
    type: "image",
    source: {
      type: "base64",
      media_type: "image/png",
      data: "iVBORw0KGgo=",
    },
  });
});

test("AnthropicAdapter - bidirectional effort translation (output_config.effort <-> reasoning_effort) preserves max", () => {
  // 1. Anthropic -> OpenAI
  const anthropicReq = {
    model: "gpt-6-astra",
    messages: [{ role: "user", content: "Solve math" }],
    output_config: { effort: "max" },
  };
  const openAiOut = AnthropicAdapter.anthropicToOpenAi(anthropicReq);
  assert.equal(openAiOut.reasoning_effort, "max");

  // 2. OpenAI -> Anthropic
  const openAiReq = {
    model: "claude-haiku-5-5",
    messages: [{ role: "user", content: "Solve math" }],
    reasoning_effort: "max",
  };
  const anthropicOut = AnthropicAdapter.openAiToAnthropic(openAiReq);
  assert.deepEqual(anthropicOut.output_config, { effort: "max" });
});

test("AnthropicAdapter - openAiToAnthropic merges adjacent same-role messages ensuring strict role alternation", () => {
  const openAiPayload = {
    model: "claude-sonnet-4-5",
    messages: [
      { role: "user", content: "First turn" },
      {
        role: "assistant",
        content: null,
        tool_calls: [
          {
            id: "call_read_1",
            type: "function",
            function: { name: "read_file", arguments: '{"path":"main.ts"}' },
          },
        ],
      },
      // Tool message (converts to role: 'user')
      { role: "tool", tool_call_id: "call_read_1", content: "console.log('hello');" },
      // Followed immediately by user text message
      { role: "user", content: "Now explain the file" },
      // Followed by another user prompt
      { role: "user", content: "And summarize it" },
    ],
  };

  const anthropicPayload = AnthropicAdapter.openAiToAnthropic(openAiPayload);

  // Must have exactly 3 turns: user -> assistant -> user (merged)
  assert.equal(anthropicPayload.messages.length, 3);
  assert.equal(anthropicPayload.messages[0].role, "user");
  assert.equal(anthropicPayload.messages[1].role, "assistant");
  assert.equal(anthropicPayload.messages[2].role, "user");

  // Verify the 3 user turns were merged into array blocks of message[2]
  const lastUserTurn = anthropicPayload.messages[2];
  assert.ok(Array.isArray(lastUserTurn.content));
  assert.equal(lastUserTurn.content.length, 3);
  assert.equal(lastUserTurn.content[0].type, "tool_result");
  assert.equal(lastUserTurn.content[0].tool_use_id, "call_read_1");
  assert.equal(lastUserTurn.content[1].type, "text");
  assert.equal(lastUserTurn.content[1].text, "Now explain the file");
  assert.equal(lastUserTurn.content[2].type, "text");
  assert.equal(lastUserTurn.content[2].text, "And summarize it");
});

test("AnthropicAdapter - anthropicToOpenAi extracts image blocks from tool_result to image_url user turn", () => {
  const anthropicPayload = {
    model: "claude-3-7-sonnet",
    messages: [
      { role: "user", content: "Take a screenshot of the site" },
      {
        role: "assistant",
        content: [
          {
            type: "tool_use",
            id: "toolu_shot_1",
            name: "take_screenshot",
            input: { url: "https://example.com" },
          },
        ],
      },
      {
        role: "user",
        content: [
          {
            type: "tool_result",
            tool_use_id: "toolu_shot_1",
            content: [
              { type: "text", text: "Page captured successfully." },
              {
                type: "image",
                source: {
                  type: "base64",
                  media_type: "image/png",
                  data: "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
                },
              },
            ],
          },
          {
            type: "text",
            text: "What do you see in the screenshot?",
          },
        ],
      },
    ],
  };

  const openAiOut = AnthropicAdapter.anthropicToOpenAi(anthropicPayload);

  // Messages should contain:
  // 0: user
  // 1: assistant with tool_calls
  // 2: tool with text content "Page captured successfully."
  // 3: user turn containing the text and the extracted image_url block!
  assert.equal(openAiOut.messages.length, 4);

  const toolMsg = openAiOut.messages[2];
  assert.equal(toolMsg.role, "tool");
  assert.equal(toolMsg.tool_call_id, "toolu_shot_1");
  assert.equal(toolMsg.content, "Page captured successfully.");

  const userTurn = openAiOut.messages[3];
  assert.equal(userTurn.role, "user");
  assert.ok(Array.isArray(userTurn.content));

  // The user turn should contain the user text, tag, and image_url object
  const hasImageUrl = userTurn.content.some((b: any) => b?.type === "image_url" && b.image_url?.url?.includes("data:image/png;base64,"));
  assert.ok(hasImageUrl, "User turn must contain image_url block extracted from tool_result");

  const hasTag = userTurn.content.some((b: any) => b?.type === "text" && b.text?.includes("[Image from tool result toolu_shot_1]"));
  assert.ok(hasTag, "User turn must identify tool result source for image");
});

