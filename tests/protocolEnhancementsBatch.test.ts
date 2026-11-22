process.env.NODE_ENV = "test";

import test from "node:test";
import assert from "node:assert/strict";
import {
  convertOpenAiResponseToResponsesApi,
  getResponsesIncompleteReason,
  openAiChunkToResponsesEvents,
  createResponsesStreamState,
} from "../src/core/adapters/responsesAdapter.js";
import {
  extractSessionIdentityMessages,
} from "../src/server/proxy/executorHelpers.js";
import {
  extractConversationPrefixHash,
} from "../src/core/caching/promptCacheAffinity.js";
import {
  advertisedContextWindow,
  CONTEXT_WINDOW_SAFETY_FACTOR,
} from "../src/server/routes/apiModels.js";

test("Responses API - incomplete status and reason on length truncation", () => {
  assert.equal(getResponsesIncompleteReason("length"), "max_output_tokens");
  assert.equal(getResponsesIncompleteReason("content_filter"), "content_filter");
  assert.equal(getResponsesIncompleteReason("stop"), undefined);

  // 1. Non-streaming turn truncated
  const openAiTruncated = {
    id: "chatcmpl-trunc",
    model: "gpt-4o",
    choices: [
      {
        finish_reason: "length",
        message: { role: "assistant", content: "function foo() {\n  return 1;" },
      },
    ],
    usage: { prompt_tokens: 10, completion_tokens: 20 },
  };

  const responseObj = convertOpenAiResponseToResponsesApi(openAiTruncated);
  assert.equal(responseObj.status, "incomplete");
  assert.deepEqual(responseObj.incomplete_details, { reason: "max_output_tokens" });
  assert.equal(responseObj.output[0].status, "incomplete");

  // 2. Non-streaming turn completed normally
  const openAiNormal = {
    id: "chatcmpl-norm",
    model: "gpt-4o",
    choices: [
      {
        finish_reason: "stop",
        message: { role: "assistant", content: "Done!" },
      },
    ],
    usage: { prompt_tokens: 10, completion_tokens: 5 },
  };

  const normalObj = convertOpenAiResponseToResponsesApi(openAiNormal);
  assert.equal(normalObj.status, "completed");
  assert.equal(normalObj.incomplete_details, undefined);
  assert.equal(normalObj.output[0].status, "completed");
});

test("Responses API Stream - emits response.incomplete when finish_reason is length", () => {
  const state = createResponsesStreamState("resp-stream-1");

  // Chunk with text
  openAiChunkToResponsesEvents(
    {
      id: "resp-stream-1",
      model: "gpt-4o",
      choices: [{ delta: { content: "partial code" }, finish_reason: null }],
    },
    state
  );

  // Chunk with length finish_reason
  const events = openAiChunkToResponsesEvents(
    {
      id: "resp-stream-1",
      model: "gpt-4o",
      choices: [{ delta: {}, finish_reason: "length" }],
      usage: { prompt_tokens: 5, completion_tokens: 10 },
    },
    state
  );

  const incompleteEvent = events.find((e) => e.event === "response.incomplete");
  assert.ok(incompleteEvent, "Stream must emit response.incomplete on length truncation");

  const completedEvent = events.find((e) => e.event === "response.completed");
  assert.equal(completedEvent, undefined, "Stream must not emit response.completed");

  assert.equal(incompleteEvent.data.response.status, "incomplete");
  assert.deepEqual(incompleteEvent.data.response.incomplete_details, { reason: "max_output_tokens" });
});

test("Streamed Tool Calls - ensures continuous sequential indexing for parallel calls", () => {
  const state = createResponsesStreamState("resp-stream-tools");

  // Simulated parallel tool calls in one chunk with missing indices
  openAiChunkToResponsesEvents(
    {
      id: "resp-tools",
      model: "gemini-2.5-flash",
      choices: [
        {
          delta: {
            tool_calls: [
              { function: { name: "Bash", arguments: '{"command":"ls"}' } },
              { function: { name: "Read", arguments: '{"file_path":"app.ts"}' } },
            ],
          },
          finish_reason: null,
        },
      ],
    },
    state
  );

  // Check state tool calls map has distinct indices
  assert.equal(state.funcNames[0], "Bash");
  assert.equal(state.funcNames[1], "Read");
  assert.equal(state.funcArgsBuf[0], '{"command":"ls"}');
  assert.equal(state.funcArgsBuf[1], '{"file_path":"app.ts"}');

  // Verify multi-chunk sequential tool calls without index don't overwrite index 0
  const seqState = createResponsesStreamState("resp-stream-seq");
  openAiChunkToResponsesEvents(
    {
      id: "resp-seq",
      choices: [{ delta: { tool_calls: [{ function: { name: "Bash" } }] }, finish_reason: null }],
    },
    seqState
  );
  openAiChunkToResponsesEvents(
    {
      id: "resp-seq",
      choices: [{ delta: { tool_calls: [{ function: { arguments: '{"command":"pwd"}' } }] }, finish_reason: null }],
    },
    seqState
  );
  openAiChunkToResponsesEvents(
    {
      id: "resp-seq",
      choices: [{ delta: { tool_calls: [{ function: { name: "Read" } }] }, finish_reason: null }],
    },
    seqState
  );
  openAiChunkToResponsesEvents(
    {
      id: "resp-seq",
      choices: [{ delta: { tool_calls: [{ function: { arguments: '{"file":"b.ts"}' } }] }, finish_reason: null }],
    },
    seqState
  );

  assert.equal(seqState.funcNames[0], "Bash");
  assert.equal(seqState.funcNames[1], "Read");
  assert.equal(seqState.funcArgsBuf[0], '{"command":"pwd"}');
  assert.equal(seqState.funcArgsBuf[1], '{"file":"b.ts"}');
});

test("Session Identity - preserves first user turn across compression snapshot", () => {
  const originalMessages = [
    { role: "system", content: "You are an assistant" },
    { role: "user", content: "Initial user instruction with complex details" },
    { role: "assistant", content: "Working on it" },
  ];

  const sessionSnapshot = extractSessionIdentityMessages(originalMessages);
  assert.equal(sessionSnapshot[1].content, "Initial user instruction with complex details");

  // Modify original messages (simulating aging or Token Saver compression)
  originalMessages[1].content = "[compressed turn 1]";

  // Snapshot remains unmodified
  assert.equal(sessionSnapshot[1].content, "Initial user instruction with complex details");
});

test("Advertised Context Window - safely scales down by router buffer margin", () => {
  assert.equal(advertisedContextWindow(128000), Math.floor(128000 / CONTEXT_WINDOW_SAFETY_FACTOR)); // 102400
  assert.equal(advertisedContextWindow(200000), 160000);
  assert.equal(advertisedContextWindow(4096), 3276);
  assert.equal(advertisedContextWindow(null), null);
  assert.equal(advertisedContextWindow(undefined), null);
  assert.equal(advertisedContextWindow(0), null);
});

test("Prompt Cache Affinity - handles body object, direct messages array, and pre-saver parity", () => {
  const reqBody = {
    system: "System instructions",
    messages: [
      { role: "user", content: "Hello world" },
      { role: "assistant", content: "Hi" },
    ],
  };

  const bodyHash = extractConversationPrefixHash(reqBody);
  assert.ok(bodyHash && typeof bodyHash === "string");

  // Direct array of messages (defensive against callers passing messages[])
  const arrayHash = extractConversationPrefixHash(reqBody.messages);
  assert.ok(arrayHash && typeof arrayHash === "string");

  // Pre-saver calculation retains hash stability when messages are snapshotted
  const snapshot = extractSessionIdentityMessages(reqBody.messages);
  const snapshotBodyHash = extractConversationPrefixHash({ ...reqBody, messages: snapshot });
  assert.equal(snapshotBodyHash, bodyHash);
});
