process.env.NODE_ENV = "test";

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  cleanJSONSchemaForAntigravity,
  normalizeGeminiContents,
  sanitizeGeminiFunctionName,
} from "../src/providers/runtime/antigravity/schema.js";
import { executeAntigravity } from "../src/providers/runtime/antigravity/executor.js";
import { AntigravityProvider } from "../src/providers/runtime/antigravity/provider.js";

describe("Google Antigravity Provider Execution & Schemas", () => {
  describe("sanitizeGeminiFunctionName", () => {
    it("preserves valid alphanumeric names", () => {
      assert.equal(sanitizeGeminiFunctionName("get_weather_123"), "get_weather_123");
    });

    it("replaces invalid characters with underscores", () => {
      assert.equal(sanitizeGeminiFunctionName("my!tool?action"), "my_tool_action");
    });
  });

  describe("cleanJSONSchemaForAntigravity", () => {
    it("removes forbidden fields like $schema and title", () => {
      const rawSchema = {
        $schema: "http://json-schema.org/draft-07/schema#",
        title: "SearchArgs",
        type: "object",
        properties: {
          query: {
            type: "string",
            description: "Search term",
            default: "hello",
          },
        },
        required: ["query"],
      };

      const cleaned = cleanJSONSchemaForAntigravity(rawSchema);
      assert.equal(cleaned.$schema, undefined);
      assert.equal(cleaned.title, undefined);
      assert.equal(cleaned.properties.query.default, undefined);
      assert.equal(cleaned.properties.query.type, "string");
    });

    it("filters out required properties not defined in properties", () => {
      const rawSchema = {
        type: "object",
        properties: {
          validProp: { type: "string" },
        },
        required: ["nonExistentProp", "validProp"],
      };

      const cleaned = cleanJSONSchemaForAntigravity(rawSchema);
      assert.deepEqual(cleaned.required, ["validProp"]);
    });

    it("deletes required completely when no properties match", () => {
      const rawSchema = {
        type: "object",
        properties: {
          foo: { type: "string" },
        },
        required: ["bar", "baz"],
      };

      const cleaned = cleanJSONSchemaForAntigravity(rawSchema);
      assert.equal(cleaned.required, undefined);
    });

    it("infers type=object and adds array items if missing", () => {
      const rawSchema = {
        properties: {
          itemsList: { type: "array" },
        },
      };

      const cleaned = cleanJSONSchemaForAntigravity(rawSchema);
      assert.equal(cleaned.type, "object");
      assert.deepEqual(cleaned.properties.itemsList.items, { type: "string" });
    });
  });

  describe("normalizeGeminiContents", () => {
    it("merges consecutive turns with same role", () => {
      const contents = [
        { role: "user", parts: [{ text: "Hello" }] },
        { role: "user", parts: [{ text: "World" }] },
      ];

      const normalized = normalizeGeminiContents(contents);
      assert.equal(normalized.length, 1);
      assert.equal(normalized[0].role, "user");
      assert.equal(normalized[0].parts.length, 2);
    });
  });

  describe("executeAntigravity", () => {
    it("packages Cloud Code PA envelope and handles SSE stream chunk translation", async () => {
      // Mock global fetch for Cloud Code PA endpoint
      const originalFetch = global.fetch;

      let capturedUrl = "";
      let capturedBody: any = null;
      let capturedHeaders: any = null;

      const mockSseStream = new ReadableStream({
        start(controller) {
          const geminiChunks = [
            {
              response: {
                candidates: [
                  {
                    content: {
                      role: "model",
                      parts: [{ thought: true, text: "I should greet the user." }],
                    },
                  },
                ],
              },
            },
            {
              response: {
                candidates: [
                  {
                    content: {
                      role: "model",
                      parts: [{ text: "Hello from Antigravity!" }],
                    },
                    finishReason: "STOP",
                  },
                ],
                usageMetadata: {
                  promptTokenCount: 15,
                  candidatesTokenCount: 8,
                  totalTokenCount: 23,
                },
              },
            },
          ];

          for (const chunk of geminiChunks) {
            controller.enqueue(new TextEncoder().encode(`data: ${JSON.stringify(chunk)}\n\n`));
          }
          controller.close();
        },
      });

      global.fetch = async (url: any, init: any) => {
        capturedUrl = String(url);
        capturedBody = JSON.parse(init.body);
        capturedHeaders = init.headers;

        return new Response(mockSseStream, {
          status: 200,
          headers: { "Content-Type": "text/event-stream" },
        });
      };

      const emittedChunks: string[] = [];

      const mockRes: any = {
        setHeader: () => {},
        flushHeaders: () => {},
        write: (chunk: string) => {
          emittedChunks.push(chunk);
        },
        end: () => {},
        on: () => {},
      };

      const mockContext: any = {
        req: {
          headers: {},
        },
        body: {
          model: "ag/gemini-3.8-flash",
          messages: [{ role: "user", content: "Hi" }],
          stream: true,
        },
        res: mockRes,
        account: {
          id: "test-acc-1",
          providerId: "antigravity",
          name: "Test Antigravity Account",
          rawApiKey: JSON.stringify({
            access_token: "mock-access-token",
            expires_at: Date.now() + 3600000,
            project_id: "test-cloud-project-123",
          }),
          providerSpecificData: {
            projectId: "test-cloud-project-123",
          },
        },
        targetModel: "ag/gemini-3.8-flash",
        clientFormat: "openai",
        requestId: `test-req-${Date.now()}-${Math.random().toString(36).substring(2)}`,
        startTime: Date.now(),
      };

      try {
        const provider = new AntigravityProvider();
        await executeAntigravity(mockContext, provider);

        // Verify URL calls Cloud Code PA v1internal:streamGenerateContent
        assert.ok(
          capturedUrl.includes("daily-cloudcode-pa.googleapis.com") ||
          capturedUrl.includes("cloudcode-pa.googleapis.com"),
          `Expected Cloud Code PA URL but got: ${capturedUrl}`
        );
        assert.ok(
          capturedUrl.includes("v1internal:streamGenerateContent"),
          `Expected streamGenerateContent endpoint but got: ${capturedUrl}`
        );

        // Verify envelope
        assert.equal(capturedBody.project, "test-cloud-project-123");
        assert.ok(
          capturedBody.model.startsWith("gemini-3.8-flash"),
          `Expected model to start with gemini-3.8-flash but got ${capturedBody.model}`
        );
        assert.ok(capturedBody.request?.contents);

        // Verify emitted OpenAI chunks
        assert.ok(emittedChunks.length > 0);
        const combinedOutput = emittedChunks.join("");
        assert.ok(combinedOutput.includes("Hello from Antigravity!"));
        assert.ok(combinedOutput.includes("I should greet the user."));
        assert.ok(combinedOutput.includes("[DONE]"));
      } finally {
        global.fetch = originalFetch;
      }
    });
  });
});
