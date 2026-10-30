import test from "node:test";
import assert from "node:assert/strict";
import { estimateTokens, calculateAnthropicInputTokens } from "../src/server/proxy/countTokens.js";

test("countTokens - estimateTokens accurately calculates ASCII and Unicode text", () => {
  assert.equal(estimateTokens(""), 0);
  const helloTokens = estimateTokens("Hello, world!");
  assert.ok(helloTokens >= 3 && helloTokens <= 5, `Expected ~4 tokens, got ${helloTokens}`);

  const codeSnippet = "function add(a: number, b: number): number { return a + b; }";
  const codeTokens = estimateTokens(codeSnippet);
  assert.ok(codeTokens >= 15 && codeTokens <= 25, `Expected ~18 tokens, got ${codeTokens}`);

  const vnText = "Xin chào các lập trình viên AI!";
  const vnTokens = estimateTokens(vnText);
  assert.ok(vnTokens >= 8 && vnTokens <= 20, `Expected ~12 tokens, got ${vnTokens}`);
});

test("countTokens - calculateAnthropicInputTokens handles complex Anthropic payload", () => {
  const payload = {
    model: "claude-3-7-sonnet",
    system: "You are an expert AI engineer.",
    messages: [
      {
        role: "user",
        content: "Please write a quick sort function in TypeScript.",
      },
      {
        role: "assistant",
        content: [
          {
            type: "thinking",
            thinking: "I will explain quick sort and write the function.",
          },
          {
            type: "text",
            text: "Here is the quick sort implementation.",
          },
          {
            type: "tool_use",
            id: "call_123",
            name: "write_file",
            input: { path: "quicksort.ts", content: "export function quickSort() {}" },
          },
        ],
      },
      {
        role: "user",
        content: [
          {
            type: "tool_result",
            tool_use_id: "call_123",
            content: "File written successfully.",
          },
        ],
      },
    ],
    tools: [
      {
        name: "write_file",
        description: "Write a file to disk",
        input_schema: {
          type: "object",
          properties: {
            path: { type: "string" },
            content: { type: "string" },
          },
          required: ["path", "content"],
        },
      },
    ],
  };

  const tokens = calculateAnthropicInputTokens(payload);
  assert.ok(tokens > 50, `Expected > 50 tokens for complex prompt, got ${tokens}`);
  assert.ok(tokens < 500, `Expected < 500 tokens for prompt, got ${tokens}`);
});
