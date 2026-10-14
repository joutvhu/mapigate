import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  resolveGeminiSource,
  convertGeminiToOpenAI,
  convertOpenAIToGeminiResponse,
  convertOpenAIToGeminiChunk,
  type GeminiRequestBody,
} from "../src/mitm/handlers/antigravity/index.js";

describe("Google Antigravity Protocol Translation", () => {
  describe("resolveGeminiSource", () => {
    it("unwraps the .request envelope from CloudCode PA requests", () => {
      const enveloped: GeminiRequestBody = {
        project: "test-proj",
        model: "gemini-test",
        request: {
          contents: [{ role: "user", parts: [{ text: "Hello from cloudcode" }] }],
        },
      };

      const resolved = resolveGeminiSource(enveloped);
      assert.deepEqual(resolved.contents, [
        { role: "user", parts: [{ text: "Hello from cloudcode" }] },
      ]);
    });

    it("falls back to top-level request when .request is absent", () => {
      const topLevel: GeminiRequestBody = {
        contents: [{ role: "user", parts: [{ text: "Hello top-level" }] }],
      };

      const resolved = resolveGeminiSource(topLevel);
      assert.deepEqual(resolved.contents, [
        { role: "user", parts: [{ text: "Hello top-level" }] },
      ]);
    });
  });

  describe("convertGeminiToOpenAI", () => {
    it("converts systemInstruction and multi-turn contents to OpenAI format", () => {
      const geminiBody: GeminiRequestBody = {
        systemInstruction: {
          role: "user",
          parts: [{ text: "You are a helpful coding assistant." }],
        },
        contents: [
          { role: "user", parts: [{ text: "Write hello world in python" }] },
          { role: "model", parts: [{ text: "print('hello world')" }] },
          { role: "user", parts: [{ text: "Now in C" }] },
        ],
        generationConfig: {
          maxOutputTokens: 4096,
          temperature: 0.2,
          topP: 0.95,
          stopSequences: ["###", "END"],
        },
      };

      const openaiBody = convertGeminiToOpenAI(geminiBody, "claude-3-7-sonnet", true);

      assert.equal(openaiBody.model, "claude-3-7-sonnet");
      assert.equal(openaiBody.stream, true);
      assert.equal(openaiBody.max_tokens, 4096);
      assert.equal(openaiBody.temperature, 0.2);
      assert.equal(openaiBody.top_p, 0.95);
      assert.deepEqual(openaiBody.stop, ["###", "END"]);

      assert.deepEqual(openaiBody.messages, [
        { role: "system", content: "You are a helpful coding assistant." },
        { role: "user", content: "Write hello world in python" },
        { role: "assistant", content: "print('hello world')" },
        { role: "user", content: "Now in C" },
      ]);
    });
  });

  describe("convertOpenAIToGeminiResponse", () => {
    it("converts full OpenAI response to dual candidates format", () => {
      const openaiRes = {
        id: "chatcmpl-123",
        choices: [
          {
            index: 0,
            message: {
              role: "assistant",
              content: "int main() { printf(\"hello\\n\"); return 0; }",
              reasoning_content: "First write main function, then print.",
            },
            finish_reason: "stop",
          },
        ],
        usage: {
          prompt_tokens: 25,
          completion_tokens: 15,
          total_tokens: 40,
        },
      };

      const geminiRes = convertOpenAIToGeminiResponse(openaiRes);

      // Verify dual-structure (.response.candidates and .candidates)
      assert.ok(geminiRes.response);
      assert.ok(Array.isArray((geminiRes.response as any).candidates));
      assert.ok(Array.isArray(geminiRes.candidates));

      const candidate = (geminiRes.candidates as any[])[0];
      assert.equal(candidate.content.role, "model");
      assert.equal(candidate.finishReason, "STOP");
      assert.deepEqual(candidate.content.parts, [
        { text: "First write main function, then print.", thought: true },
        { text: "int main() { printf(\"hello\\n\"); return 0; }" },
      ]);

      // Verify usage
      const usage = (geminiRes as any).usageMetadata;
      assert.equal(usage.promptTokenCount, 25);
      assert.equal(usage.candidatesTokenCount, 15);
      assert.equal(usage.totalTokenCount, 40);
    });
  });

  describe("convertOpenAIToGeminiChunk", () => {
    it("converts text streaming delta into Gemini candidate chunk", () => {
      const openaiChunk = {
        choices: [
          {
            index: 0,
            delta: { content: "hello world" },
            finish_reason: null,
          },
        ],
      };

      const geminiChunk = convertOpenAIToGeminiChunk(openaiChunk);
      assert.ok(geminiChunk);
      const candidate = (geminiChunk as any).candidates[0];
      assert.deepEqual(candidate.content.parts, [{ text: "hello world" }]);
      assert.equal(candidate.finishReason, undefined);
    });

    it("converts reasoning delta with thought: true", () => {
      const openaiChunk = {
        choices: [
          {
            index: 0,
            delta: { reasoning_content: "thinking step 1" },
            finish_reason: null,
          },
        ],
      };

      const geminiChunk = convertOpenAIToGeminiChunk(openaiChunk);
      assert.ok(geminiChunk);
      const candidate = (geminiChunk as any).candidates[0];
      assert.deepEqual(candidate.content.parts, [{ text: "thinking step 1", thought: true }]);
    });

    it("converts finish_reason delta chunk", () => {
      const openaiChunk = {
        choices: [
          {
            index: 0,
            delta: {},
            finish_reason: "stop",
          },
        ],
      };

      const geminiChunk = convertOpenAIToGeminiChunk(openaiChunk);
      assert.ok(geminiChunk);
      const candidate = (geminiChunk as any).candidates[0];
      assert.equal(candidate.finishReason, "STOP");
    });

    it("returns null for empty delta without finish_reason", () => {
      const openaiChunk = {
        choices: [
          {
            index: 0,
            delta: {},
            finish_reason: null,
          },
        ],
      };

      const geminiChunk = convertOpenAIToGeminiChunk(openaiChunk);
      assert.equal(geminiChunk, null);
    });
  });
});
