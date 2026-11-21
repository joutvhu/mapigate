process.env.NODE_ENV = "test";

import test from "node:test";
import assert from "node:assert/strict";
import { inBandErrorEnvelope, isZeroContentResponse } from "../src/core/adapters/helpers/zeroContentCheck.js";

test("inBandErrorEnvelope - correctly detects overloaded/rate_limit 200 envelopes", () => {
  // Overloaded envelope -> 503
  const overloaded = inBandErrorEnvelope({
    error: { code: "overloaded", message: "Provider is overloaded" },
  });
  assert.ok(overloaded);
  assert.equal(overloaded?.status, 503);
  assert.equal(overloaded?.message, "Provider is overloaded");

  // Capacity / unavailable -> 503
  const busy = inBandErrorEnvelope({
    error: { type: "server_busy", message: "Capacity reached" },
  });
  assert.ok(busy);
  assert.equal(busy?.status, 503);

  // Rate limit -> 429
  const rateLimit = inBandErrorEnvelope({
    error: { code: "rate_limit_exceeded", message: "Rate limit reached" },
  });
  assert.ok(rateLimit);
  assert.equal(rateLimit?.status, 429);

  // Generic error without choices -> 502
  const generic = inBandErrorEnvelope({
    error: { code: "unknown_error", message: "Something failed" },
  });
  assert.ok(generic);
  assert.equal(generic?.status, 502);

  // Normal completion with choices -> null (not an error envelope)
  const normal = inBandErrorEnvelope({
    id: "chatcmpl-123",
    choices: [{ message: { role: "assistant", content: "Hello!" } }],
  });
  assert.equal(normal, null);

  // Content containing the word "error" in text -> null
  const toolError = inBandErrorEnvelope({
    id: "chatcmpl-123",
    choices: [{ message: { role: "assistant", content: "There was an error in your code." } }],
  });
  assert.equal(toolError, null);

  // isZeroContentResponse should also identify inBandErrorEnvelope as zero content / failure
  assert.equal(isZeroContentResponse({ error: { code: "overloaded", message: "Busy" } }), true);
});
