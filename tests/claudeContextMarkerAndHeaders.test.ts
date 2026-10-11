import test from "node:test";
import assert from "node:assert/strict";
import {
  stripModelContextMarker,
  RuleEngine,
} from "../src/core/router/ruleEngine.js";
import {
  extractHeader,
  mergeAnthropicBeta,
} from "../src/server/proxy/chatProxy.js";
import type { ModelMappingRule } from "../src/shared/types/index.js";
import type { Request } from "express";

test("Context Marker [1m] - stripModelContextMarker strips [1m] suffix", () => {
  const result1 = stripModelContextMarker("claude-3-7-sonnet[1m]");
  assert.equal(result1.model, "claude-3-7-sonnet");
  assert.equal(result1.contextMarker, "1m");
  assert.equal(result1.is1mContext, true);

  const result2 = stripModelContextMarker("anthropic/claude-3-7-sonnet[1m]");
  assert.equal(result2.model, "anthropic/claude-3-7-sonnet");
  assert.equal(result2.contextMarker, "1m");
  assert.equal(result2.is1mContext, true);
});

test("Context Marker [1m] - case-insensitive matching", () => {
  const upper = stripModelContextMarker("claude-opus-5[1M]");
  assert.equal(upper.model, "claude-opus-5");
  assert.equal(upper.contextMarker, "1m");
  assert.equal(upper.is1mContext, true);
});

test("Context Marker [1m] - leaves models without [1m] untouched", () => {
  const plain = stripModelContextMarker("claude-opus-5");
  assert.equal(plain.model, "claude-opus-5");
  assert.equal(plain.contextMarker, null);
  assert.equal(plain.is1mContext, false);

  const prefixed = stripModelContextMarker("anthropic/claude-3-5-sonnet");
  assert.equal(prefixed.model, "anthropic/claude-3-5-sonnet");
  assert.equal(prefixed.contextMarker, null);
  assert.equal(prefixed.is1mContext, false);
});

test("Context Marker [1m] - only strips trailing marker, never internal substring", () => {
  const internal = stripModelContextMarker("weird[1m]model-name");
  assert.equal(internal.model, "weird[1m]model-name");
  assert.equal(internal.contextMarker, null);
  assert.equal(internal.is1mContext, false);
});

test("Context Marker [1m] - handles non-string and undefined gracefully", () => {
  const undef = stripModelContextMarker(undefined);
  assert.equal(undef.model, undefined);
  assert.equal(undef.contextMarker, null);
  assert.equal(undef.is1mContext, false);

  const nonString = stripModelContextMarker(null as any);
  assert.equal(nonString.model, null);
  assert.equal(nonString.contextMarker, null);
  assert.equal(nonString.is1mContext, false);
});

test("RuleEngine - resolveModel strips [1m] marker and records is1mContext", () => {
  const rules: ModelMappingRule[] = [
    {
      id: "rule-1",
      alias: "claude-sonnet",
      targetModel: "claude-3-7-sonnet-20250219",
      targetProviderId: "anthropic",
      fallbackRules: [],
      isDefault: true,
    },
  ];

  const engine = new RuleEngine(rules);

  // 1. Model matching rule with [1m]
  const res1 = engine.resolveModel("claude-sonnet[1m]");
  assert.equal(res1.model, "claude-3-7-sonnet-20250219");
  assert.equal(res1.is1mContext, true);
  assert.equal(res1.rule?.targetProviderId, "anthropic");

  // 2. Direct model not in rules with [1m]
  const res2 = engine.resolveModel("claude-3-7-sonnet[1m]");
  assert.equal(res2.model, "claude-3-7-sonnet");
  assert.equal(res2.is1mContext, true);
  assert.equal(res2.rule, undefined);

  // 3. Direct model without [1m]
  const res3 = engine.resolveModel("claude-3-7-sonnet");
  assert.equal(res3.model, "claude-3-7-sonnet");
  assert.equal(res3.is1mContext, false);
});

test("Anthropic Header Forwarding - mergeAnthropicBeta merges and dedupes flags", () => {
  assert.equal(
    mergeAnthropicBeta("claude-code-20250219", "context-1m-2025-08-07"),
    "claude-code-20250219,context-1m-2025-08-07"
  );

  assert.equal(
    mergeAnthropicBeta("a, b , c", "b, d", undefined, "", "e "),
    "a,b,c,d,e"
  );

  assert.equal(mergeAnthropicBeta(undefined, null, ""), "");
});

test("Anthropic Header Forwarding - extractHeader extracts headers case-insensitively", () => {
  const mockReq = {
    headers: {
      "anthropic-beta": "context-1m-2025-08-07",
      "anthropic-version": "2023-06-01",
      "custom-list": ["val1", "val2"],
    },
  } as unknown as Request;

  assert.equal(extractHeader(mockReq, "anthropic-beta"), "context-1m-2025-08-07");
  assert.equal(extractHeader(mockReq, "Anthropic-Beta"), "context-1m-2025-08-07");
  assert.equal(extractHeader(mockReq, "ANTHROPIC-VERSION"), "2023-06-01");
  assert.equal(extractHeader(mockReq, "custom-list"), "val1,val2");
  assert.equal(extractHeader(mockReq, "non-existent"), undefined);
});
