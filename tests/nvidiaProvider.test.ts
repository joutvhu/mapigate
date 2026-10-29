import test from "node:test";
import assert from "node:assert/strict";
import { NvidiaProvider } from "../src/providers/catalog/nvidia/provider.js";

test("NvidiaProvider - normalizes reasoning aliases to reasoning_content on assistant messages", () => {
  const provider = new NvidiaProvider();
  const context: any = {
    targetModel: "deepseek-ai/deepseek-v4-pro",
    body: {
      model: "deepseek-ai/deepseek-v4-pro",
      messages: [
        { role: "assistant", content: "", reasoning: "alias", reasoning_content: "canonical" },
        { role: "assistant", content: "", reasoning: "alias only" },
        { role: "assistant", content: "", reasoning_content: "canonical only" },
        { role: "user", content: "hello" },
      ],
    },
  };

  const transformed = provider.transformRequestBody(context);
  assert.equal(transformed.messages[0].reasoning, undefined);
  assert.equal(transformed.messages[0].reasoning_content, "canonical");

  assert.equal(transformed.messages[1].reasoning, undefined);
  assert.equal(transformed.messages[1].reasoning_content, "alias only");

  assert.equal(transformed.messages[2].reasoning_content, "canonical only");
  assert.equal(transformed.messages[3].content, "hello");
});
