process.env.NODE_ENV = "test";

import test from "node:test";
import assert from "node:assert/strict";
import {
  requestsAutoModeReview,
  safeguardResultsFor,
  AUTO_MODE_SAFEGUARD_TYPE,
  createStreamState,
} from "../src/core/adapters/anthropic/types.js";
import { openAiResponseToAnthropic } from "../src/core/adapters/anthropic/responseConverters.js";
import { openAiChunkToAnthropicEvent } from "../src/core/adapters/anthropic/streamOpenAiToAnthropic.js";

test("Claude Safeguards - requestsAutoModeReview detection", () => {
  assert.equal(requestsAutoModeReview(undefined), false);
  assert.equal(requestsAutoModeReview([]), false);
  assert.equal(requestsAutoModeReview([{ type: "other_review" }]), false);
  assert.equal(
    requestsAutoModeReview([{ type: AUTO_MODE_SAFEGUARD_TYPE }]),
    true
  );
  assert.equal(
    requestsAutoModeReview([{ type: "other" }, { type: "dangerous_tool_use" }]),
    true
  );
});

test("Claude Safeguards - safeguardResultsFor resolution", () => {
  // 1. Upstream results returned verbatim when available
  const upstream = [{ type: "dangerous_tool_use", status: { type: "allowed" } }];
  assert.deepEqual(safeguardResultsFor(undefined, upstream), upstream);

  // 2. Client requested review, upstream returned none -> unsupported status
  const requested = [{ type: "dangerous_tool_use" }];
  const unsupported = safeguardResultsFor(requested, undefined);
  assert.deepEqual(unsupported, [
    { type: "dangerous_tool_use", status: { type: "unsupported" } },
  ]);

  // 3. Client did not request review -> undefined
  assert.equal(safeguardResultsFor(undefined, undefined), undefined);
});

test("Claude Safeguards - non-streaming response includes safeguard_results when requested", () => {
  const fakeOpenAi = {
    id: "cmpl-123",
    model: "test-model",
    choices: [{ message: { role: "assistant", content: "Done" }, finish_reason: "stop" }],
    usage: { prompt_tokens: 10, completion_tokens: 5 },
  };

  // With safeguards in request
  const withSafeguards = openAiResponseToAnthropic(fakeOpenAi, "req-1", {
    safeguards: [{ type: "dangerous_tool_use" }],
  });
  assert.deepEqual(withSafeguards.safeguard_results, [
    { type: "dangerous_tool_use", status: { type: "unsupported" } },
  ]);

  // Without safeguards in request
  const withoutSafeguards = openAiResponseToAnthropic(fakeOpenAi, "req-2");
  assert.equal(withoutSafeguards.safeguard_results, undefined);
});

test("Claude Safeguards - streaming SSE embeds safeguard_results inside message_delta.delta", () => {
  const streamState = createStreamState(
    "msg-stream-1",
    undefined,
    [{ type: "dangerous_tool_use" }]
  );

  // Send chunk with finish_reason
  const events = openAiChunkToAnthropicEvent(
    { choices: [{ delta: {}, finish_reason: "stop" }] },
    "msg-stream-1",
    streamState
  );

  const deltaEvent = events.find((e) => e.includes("message_delta"));
  assert.ok(deltaEvent, "Must emit message_delta event");

  const jsonStr = deltaEvent.replace(/^event: message_delta\ndata: /, "").trim();
  const parsed = JSON.parse(jsonStr);

  assert.equal(parsed.type, "message_delta");
  assert.ok(parsed.delta, "Must have delta object");
  assert.deepEqual(parsed.delta.safeguard_results, [
    { type: "dangerous_tool_use", status: { type: "unsupported" } },
  ]);
});
