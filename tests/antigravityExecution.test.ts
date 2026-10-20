process.env.NODE_ENV = "test";

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import {
  cleanJSONSchemaForAntigravity,
  normalizeGeminiContents,
  sanitizeGeminiFunctionName,
  fixMissingToolResponses,
  createToolCallIdUniquifier,
  sanitizeFunctionResponsePayload,
  sanitizeFunctionResponsePart,
  toNumericSessionId,
  resolveSessionId,
  convertConstToEnum,
  convertEnumValuesToStrings,
  mergeAllOf,
  convertPrefixItems,
  flattenTypeArrays,
  removeUnsupportedKeywords,
  DEFAULT_THINKING_AG_SIGNATURE,
  DEFAULT_THINKING_GEMINI_CLI_SIGNATURE,
  getDefaultThinkingSignature,
  ANTIGRAVITY_REQUEST_BLACKLIST,
  stripBlacklisted,
  buildIdeRequestId,
} from "../src/providers/runtime/antigravity/schema.js";
import {
  storeGeminiThoughtSignature,
  getGeminiThoughtSignatureSync,
  clearThoughtSignatureStore,
} from "../src/providers/runtime/antigravity/thoughtSignatureStore.js";
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

  describe("getDefaultThinkingSignature", () => {
    it("returns DEFAULT_THINKING_AG_SIGNATURE for Claude models", () => {
      assert.equal(getDefaultThinkingSignature("claude-3-5-sonnet"), DEFAULT_THINKING_AG_SIGNATURE);
      assert.equal(getDefaultThinkingSignature("claude-opus-4-6-thinking"), DEFAULT_THINKING_AG_SIGNATURE);
      assert.equal(getDefaultThinkingSignature("ag/claude-3-7-sonnet"), DEFAULT_THINKING_AG_SIGNATURE);
    });

    it("returns DEFAULT_THINKING_GEMINI_CLI_SIGNATURE for Gemini models and fallbacks", () => {
      assert.equal(getDefaultThinkingSignature("gemini-3.8-flash"), DEFAULT_THINKING_GEMINI_CLI_SIGNATURE);
      assert.equal(getDefaultThinkingSignature("ag/gemini-3.8-flash-high"), DEFAULT_THINKING_GEMINI_CLI_SIGNATURE);
      assert.equal(getDefaultThinkingSignature("gemini-2.5-pro"), DEFAULT_THINKING_GEMINI_CLI_SIGNATURE);
      assert.equal(getDefaultThinkingSignature(), DEFAULT_THINKING_GEMINI_CLI_SIGNATURE);
      assert.equal(getDefaultThinkingSignature(""), DEFAULT_THINKING_GEMINI_CLI_SIGNATURE);
      assert.equal(getDefaultThinkingSignature("unknown-model"), DEFAULT_THINKING_GEMINI_CLI_SIGNATURE);
    });
  });

  describe("ANTIGRAVITY_REQUEST_BLACKLIST & stripBlacklisted", () => {
    it("defines the exact rejected fields from Google Cloud Code PA", () => {
      assert.deepEqual(ANTIGRAVITY_REQUEST_BLACKLIST, [
        "output_config",
        "thinking",
        "reasoning_effort",
        "reasoning",
        "enable_thinking",
        "thinking_budget",
        "thinkingConfig",
      ]);
    });

    it("strips blacklisted fields from an object in-place while preserving safe fields", () => {
      const obj: any = {
        temperature: 0.7,
        maxOutputTokens: 8192,
        thinking: { type: "enabled" },
        thinkingConfig: { thinkingLevel: "high" },
        reasoning_effort: "low",
        output_config: {},
        enable_thinking: true,
        thinking_budget: 1024,
        reasoning: "none",
      };
      stripBlacklisted(obj);
      assert.deepEqual(obj, {
        temperature: 0.7,
        maxOutputTokens: 8192,
      });
    });

    it("handles null, undefined, and non-object inputs gracefully", () => {
      assert.doesNotThrow(() => stripBlacklisted(null));
      assert.doesNotThrow(() => stripBlacklisted(undefined));
      assert.doesNotThrow(() => stripBlacklisted("string"));
      assert.doesNotThrow(() => stripBlacklisted(123));
    });
  });

  describe("buildIdeRequestId", () => {
    it("generates trajectory ID adhering to agent/conversationId/timestamp/trajectoryId/step pattern", () => {
      const id = buildIdeRequestId({
        sessionId: "session_123",
        model: "gemini-3.8-flash",
        contentCount: 2,
        requestType: "agent",
      });
      assert.match(
        id,
        /^agent\/[0-9a-f-]+\/\d+\/[0-9a-f-]+\/3$/,
        `Expected trajectory ID with step 3, got: ${id}`
      );
    });

    it("calculates trajectory step index based on contentCount: max(1, contentCount * 2 - 1)", () => {
      const id1 = buildIdeRequestId({ sessionId: "s", model: "m", contentCount: 1 });
      assert.ok(id1.endsWith("/1"));

      const id2 = buildIdeRequestId({ sessionId: "s", model: "m", contentCount: 3 });
      assert.ok(id2.endsWith("/5"));

      const id0 = buildIdeRequestId({ sessionId: "s", model: "m", contentCount: 0 });
      assert.ok(id0.endsWith("/1"));
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

    it("convertConstToEnum: converts const to enum array and deletes const", () => {
      const schema: any = {
        type: "object",
        properties: {
          status: { const: "running" },
        },
      };
      convertConstToEnum(schema);
      assert.equal(schema.properties.status.const, undefined);
      assert.deepEqual(schema.properties.status.enum, ["running"]);
    });

    it("convertEnumValuesToStrings: stringifies enum elements and enforces type: string", () => {
      const schema: any = {
        properties: {
          code: { enum: [200, 404, "500"] },
        },
      };
      convertEnumValuesToStrings(schema);
      assert.deepEqual(schema.properties.code.enum, ["200", "404", "500"]);
      assert.equal(schema.properties.code.type, "string");
    });

    it("mergeAllOf: flattens allOf properties and merges required into parent", () => {
      const schema: any = {
        type: "object",
        allOf: [
          { properties: { name: { type: "string" } }, required: ["name"] },
          { properties: { age: { type: "number" } }, required: ["age"] },
        ],
      };
      mergeAllOf(schema);
      assert.equal(schema.allOf, undefined);
      assert.ok(schema.properties.name);
      assert.ok(schema.properties.age);
      assert.deepEqual(schema.required, ["name", "age"]);
    });

    it("convertPrefixItems: converts tuple validation prefixItems to items", () => {
      const single: any = { type: "array", prefixItems: [{ type: "string" }] };
      convertPrefixItems(single);
      assert.equal(single.prefixItems, undefined);
      assert.deepEqual(single.items, { type: "string" });

      const multi: any = {
        type: "array",
        prefixItems: [{ type: "string" }, { type: "number" }],
      };
      convertPrefixItems(multi);
      assert.equal(multi.prefixItems, undefined);
      assert.deepEqual(multi.items, {
        anyOf: [{ type: "string" }, { type: "number" }],
      });
    });

    it("flattenTypeArrays: converts type array to single string and sets nullable", () => {
      const nullableStr: any = { type: ["string", "null"] };
      flattenTypeArrays(nullableStr);
      assert.equal(nullableStr.type, "string");
      assert.equal(nullableStr.nullable, true);

      const pureType: any = { type: ["number"] };
      flattenTypeArrays(pureType);
      assert.equal(pureType.type, "number");
      assert.equal(pureType.nullable, undefined);
    });

    it("removeUnsupportedKeywords: strips x- vendor properties and unsupported keywords recursively", () => {
      const schema: any = {
        type: "object",
        "x-vendor-custom": true,
        properties: {
          cmd: {
            type: "string",
            minLength: 5,
            maxLength: 100,
            "x-taplo-info": "taplo",
          },
          items: [
            {
              format: "uri",
              "x-inner": 123,
            },
          ],
        },
      };
      removeUnsupportedKeywords(schema, ["minLength", "maxLength", "format"]);
      assert.equal(schema["x-vendor-custom"], undefined);
      assert.equal(schema.properties.cmd.minLength, undefined);
      assert.equal(schema.properties.cmd.maxLength, undefined);
      assert.equal(schema.properties.cmd["x-taplo-info"], undefined);
      assert.equal(schema.properties.items[0].format, undefined);
      assert.equal(schema.properties.items[0]["x-inner"], undefined);
    });

    it("cleanJSONSchemaForAntigravity end-to-end handles full 5-phase normalization", () => {
      const complexSchema = {
        type: "object",
        "x-custom-rule": "internal",
        allOf: [
          {
            properties: {
              mode: { const: "fast" },
              encoding: { enum: [1, 2] },
            },
            required: ["mode"],
          },
        ],
        properties: {
          target: { type: ["string", "null"], minLength: 3 },
          tuple: { prefixItems: [{ type: "number" }] },
        },
      };

      const cleaned = cleanJSONSchemaForAntigravity(complexSchema);
      assert.equal(cleaned["x-custom-rule"], undefined);
      assert.equal(cleaned.allOf, undefined);
      // const -> enum
      assert.deepEqual(cleaned.properties.mode.enum, ["fast"]);
      // enum values -> string
      assert.deepEqual(cleaned.properties.encoding.enum, ["1", "2"]);
      assert.equal(cleaned.properties.encoding.type, "string");
      // type array -> string + nullable, minLength stripped
      assert.equal(cleaned.properties.target.type, "string");
      assert.equal(cleaned.properties.target.nullable, true);
      assert.equal(cleaned.properties.target.minLength, undefined);
      // prefixItems -> items
      assert.deepEqual(cleaned.properties.tuple.items, { type: "number" });
      assert.equal(cleaned.properties.tuple.prefixItems, undefined);
      // merged required
      assert.ok(cleaned.required.includes("mode"));
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

  describe("createToolCallIdUniquifier", () => {
    it("assigns unique IDs across multiple turns with identical base IDs", () => {
      const u = createToolCallIdUniquifier();
      assert.equal(u.next("call_1"), "call_1");
      assert.equal(u.next("call_1"), "call_1-2");
      assert.equal(u.next("call_1"), "call_1-3");
      assert.equal(u.next("call_2"), "call_2");
    });
  });

  describe("toNumericSessionId", () => {
    it("returns '-1' when sessionId is missing, null, undefined, or empty", () => {
      assert.equal(toNumericSessionId(), "-1");
      assert.equal(toNumericSessionId(null), "-1");
      assert.equal(toNumericSessionId(""), "-1");
      assert.equal(toNumericSessionId("   "), "-1");
    });

    it("preserves already-numeric string session IDs", () => {
      assert.equal(toNumericSessionId("-1234567890"), "-1234567890");
      assert.equal(toNumericSessionId("9876543210"), "9876543210");
      assert.equal(toNumericSessionId("0"), "0");
    });

    it("hashes string to 64-bit masked negative bigint string deterministically", () => {
      const id1 = toNumericSessionId("session_test_abc_123");
      const id2 = toNumericSessionId("session_test_abc_123");
      assert.equal(id1, id2);
      assert.match(id1, /^-\d+$/);

      const h = crypto.createHash("sha256").update("session_test_abc_123").digest();
      const n = h.readBigUInt64BE(0) & 0x7fffffffffffffffn;
      assert.equal(id1, `-${n.toString()}`);
    });
  });

  describe("resolveSessionId", () => {
    it("prefers client session from headers if present", () => {
      const sid = resolveSessionId(
        { headers: { "x-session-id": "sess_hdr_123" } },
        {},
        "test-account"
      );
      assert.equal(sid, "sess_hdr_123");
    });

    it("prefers client session from body if present", () => {
      const sid1 = resolveSessionId(null, { _clientSessionId: "client_body_sid" }, "acc");
      assert.equal(sid1, "client_body_sid");

      const sid2 = resolveSessionId(null, { conversation_id: "conv_id_abc" }, "acc");
      assert.equal(sid2, "conv_id_abc");
    });

    it("falls back to stable account identifier when client session is absent", () => {
      const sidStr = resolveSessionId(null, {}, "my-google-acc");
      assert.equal(sidStr, "antigravity:account:my-google-acc");

      const sidObj = resolveSessionId(null, {}, { id: "acc-id-1", name: "acc-name-1" });
      assert.equal(sidObj, "antigravity:account:acc-id-1");

      const sidAnon = resolveSessionId(null, {}, null);
      assert.equal(sidAnon, "antigravity:account:anonymous");
    });

    it("produces identical toNumericSessionId across multiple turns for the same account (enabling Cloud Code Prompt Caching)", () => {
      const acc = { id: "user_developer_1", name: "Dev 1", email: "dev1@example.com" };

      // Turn 1
      const turn1Raw = resolveSessionId({ headers: {} }, { messages: [{ role: "user", content: "turn 1" }] }, acc);
      const turn1Numeric = toNumericSessionId(turn1Raw);

      // Turn 2
      const turn2Raw = resolveSessionId({ headers: {} }, { messages: [{ role: "user", content: "turn 2" }] }, acc);
      const turn2Numeric = toNumericSessionId(turn2Raw);

      // Turn 100
      const turn100Raw = resolveSessionId({ headers: {} }, { messages: [{ role: "user", content: "turn 100" }] }, acc);
      const turn100Numeric = toNumericSessionId(turn100Raw);

      assert.equal(turn1Numeric, turn2Numeric);
      assert.equal(turn1Numeric, turn100Numeric);
      assert.match(turn1Numeric, /^-\d+$/);
    });
  });

  describe("fixMissingToolResponses", () => {
    it("synthesizes empty tool response for missing tool results in turn history", () => {
      const messages = [
        { role: "user", content: "read file" },
        {
          role: "assistant",
          tool_calls: [
            { id: "call_1", function: { name: "readFile", arguments: "{}" } },
            { id: "call_2", function: { name: "listDir", arguments: "{}" } },
          ],
        },
        { role: "tool", tool_call_id: "call_1", content: "file content" },
        // call_2 is missing!
        { role: "user", content: "next prompt" },
      ];

      const fixed = fixMissingToolResponses(messages);
      assert.equal(fixed.length, 5);
      const inserted = fixed.find((m) => m.role === "tool" && m.tool_call_id === "call_2");
      assert.ok(inserted, "Missing tool response should be synthesized");
      assert.equal(inserted.content, "");
    });
  });

  describe("sanitizeFunctionResponsePayload", () => {
    it("renames $ref to _ref recursively to avoid Gemini rejection", () => {
      const payload = {
        title: "Test",
        schema: {
          $ref: "#/definitions/Item",
          items: [{ $ref: "#/definitions/SubItem" }],
        },
      };

      const sanitized = sanitizeFunctionResponsePayload(payload);
      assert.equal(sanitized.schema.$ref, undefined);
      assert.equal(sanitized.schema._ref, "#/definitions/Item");
      assert.equal(sanitized.schema.items[0]._ref, "#/definitions/SubItem");
    });
  });

  describe("sanitizeFunctionResponsePart & FunctionResponse Structure", () => {
    it("preserves response structure and renames $ref to _ref", () => {
      const part = {
        functionResponse: {
          id: "call_schema_1",
          name: "describe_table",
          response: {
            result: {
              $ref: "#/definitions/Table",
              details: "sqlite",
            },
          },
        },
      };

      const sanitized = sanitizeFunctionResponsePart(part);
      assert.deepEqual(sanitized.functionResponse.response, {
        result: {
          _ref: "#/definitions/Table",
          details: "sqlite",
        },
      });
    });

    it("returns part unchanged if response is not an object", () => {
      const part = {
        functionResponse: {
          id: "call_1",
          name: "test",
          response: "raw string",
        },
      };
      assert.deepEqual(sanitizeFunctionResponsePart(part), part);
    });

    it("returns part unchanged if functionResponse is missing", () => {
      const part = { text: "hello" };
      assert.deepEqual(sanitizeFunctionResponsePart(part), part);
    });
  });

  describe("thoughtSignatureStore", () => {
    it("stores and retrieves cryptographic signatures across turns", () => {
      clearThoughtSignatureStore();
      storeGeminiThoughtSignature("call_abc_123", "sig_crypto_valid_hex", "session_1", "gemini-3.8-flash");

      const retrievedWithSession = getGeminiThoughtSignatureSync("call_abc_123", "session_1", "gemini-3.8-flash");
      assert.equal(retrievedWithSession, "sig_crypto_valid_hex");

      const retrievedDirect = getGeminiThoughtSignatureSync("call_abc_123");
      assert.equal(retrievedDirect, "sig_crypto_valid_hex");

      const missing = getGeminiThoughtSignatureSync("call_non_existent");
      assert.equal(missing, null);
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
        assert.equal(capturedBody.request?.generationConfig?.maxOutputTokens, 16384);
        assert.deepEqual(capturedBody.request?.generationConfig?.thinkingConfig, {
          thinkingBudget: 8192,
          includeThoughts: true,
        });

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

    it("emits finish_reason tool_calls when function calls are present and caches thoughtSignature", async () => {
      const originalFetch = global.fetch;
      const emittedChunks: string[] = [];

      const mockSseStream = new ReadableStream({
        start(controller) {
          const geminiChunks = [
            {
              response: {
                candidates: [
                  {
                    content: {
                      parts: [
                        {
                          functionCall: {
                            id: "call_tool_test_999",
                            name: "readFile",
                            args: { path: "README.md" },
                          },
                          thoughtSignature: "sig_crypto_verified_12345",
                        },
                      ],
                    },
                    finishReason: "STOP",
                  },
                ],
              },
            },
          ];

          for (const c of geminiChunks) {
            controller.enqueue(new TextEncoder().encode(`data: ${JSON.stringify(c)}\n\n`));
          }
          controller.close();
        },
      });

      global.fetch = async () =>
        new Response(mockSseStream, {
          status: 200,
          headers: { "content-type": "text/event-stream" },
        }) as any;

      const mockContext: any = {
        req: {
          headers: { authorization: "Bearer fake-test-key" },
          body: {
            model: "ag/gemini-3.8-flash",
            messages: [{ role: "user", content: "read the readme" }],
            stream: true,
          },
        },
        res: {
          setHeader: () => {},
          flushHeaders: () => {},
          write: (chunk: string) => {
            emittedChunks.push(chunk);
          },
          end: () => {},
        },
        provider: {
          id: "antigravity",
          baseUrl: "https://daily-cloudcode-pa.googleapis.com",
        },
        account: {
          id: "test-account",
          name: "test-account-1",
          rawApiKey: JSON.stringify({
            access_token: "test-oauth-token-xyz",
            project_id: "test-project-123",
          }),
        },
        targetModel: "ag/gemini-3.8-flash",
        clientFormat: "openai",
        requestId: `test-tool-req-${Date.now()}`,
        startTime: Date.now(),
      };

      try {
        const provider = new AntigravityProvider();
        await executeAntigravity(mockContext, provider);

        const combinedOutput = emittedChunks.join("");
        // Must emit tool_calls finish_reason, NOT stop
        assert.ok(
          combinedOutput.includes('"finish_reason":"tool_calls"'),
          `Expected finish_reason to be tool_calls but got: ${combinedOutput}`
        );
        assert.ok(!combinedOutput.includes('"finish_reason":"stop"'), "Should not emit finish_reason stop for tool turn");

        // Verify thought signature is cached
        const cachedSig = getGeminiThoughtSignatureSync("call_tool_test_999");
        assert.equal(cachedSig, "sig_crypto_verified_12345", "Thought signature must be cached in store");

        // Verify separated SSE chunk delta between role and tool_calls
        const dataChunks = emittedChunks
          .map((c) => c.trim())
          .filter((c) => c.startsWith("data:") && !c.includes("[DONE]"))
          .map((c) => JSON.parse(c.slice(5).trim()));

        assert.ok(dataChunks.length >= 2, "Must emit at least initial chunk and tool_calls chunk");
        const initialChunk = dataChunks[0];
        assert.equal(initialChunk.choices[0].delta.role, "assistant");
        assert.equal(initialChunk.choices[0].delta.tool_calls, undefined, "Initial chunk must not have tool_calls");
        assert.equal(initialChunk.choices[0].delta.content, undefined, "Initial chunk must not have content");

        const toolCallChunk = dataChunks.find((c) => c.choices[0]?.delta?.tool_calls);
        assert.ok(toolCallChunk, "Expected a chunk with tool_calls delta");
        assert.equal(toolCallChunk.choices[0].delta.role, undefined, "Tool calls chunk must NOT contain role");
        assert.equal(toolCallChunk.choices[0].delta.content, undefined, "Tool calls chunk must NOT contain content");
        assert.equal(toolCallChunk.choices[0].delta.tool_calls.length, 1);
        assert.equal(toolCallChunk.choices[0].delta.tool_calls[0].function.name, "readFile");
      } finally {
        global.fetch = originalFetch;
      }
    });

    it("sets appropriate thinkingConfig and maxOutputTokens floor for Gemini models", async () => {
      const originalFetch = global.fetch;
      let capturedBody: any = null;

      global.fetch = async (_url: any, init: any) => {
        capturedBody = JSON.parse(init.body);
        return new Response(
          new ReadableStream({
            start(controller) {
              controller.close();
            },
          }),
          { status: 200, headers: { "Content-Type": "text/event-stream" } }
        ) as any;
      };

      const mockContext: any = {
        req: { headers: {} },
        body: {
          model: "ag/gemini-3.8-flash-high",
          messages: [{ role: "user", content: "Hi" }],
          stream: true,
        },
        res: { setHeader: () => {}, flushHeaders: () => {}, write: () => {}, end: () => {} },
        account: {
          id: "test-acc-1",
          rawApiKey: JSON.stringify({ access_token: "mock-token", project_id: "test-proj" }),
        },
        targetModel: "ag/gemini-3.8-flash-high",
        clientFormat: "openai",
        requestId: `test-req-high-${Date.now()}`,
        startTime: Date.now(),
      };

      try {
        const provider = new AntigravityProvider();
        await executeAntigravity(mockContext, provider);

        assert.equal(capturedBody.request?.generationConfig?.maxOutputTokens, 65535);
        assert.deepEqual(capturedBody.request?.generationConfig?.thinkingConfig, {
          thinkingBudget: 24576,
          includeThoughts: true,
        });
      } finally {
        global.fetch = originalFetch;
      }
    });

    it("respects custom max_tokens when specified", async () => {
      const originalFetch = global.fetch;
      let capturedBody: any = null;

      global.fetch = async (_url: any, init: any) => {
        capturedBody = JSON.parse(init.body);
        return new Response(
          new ReadableStream({
            start(controller) {
              controller.close();
            },
          }),
          { status: 200, headers: { "Content-Type": "text/event-stream" } }
        ) as any;
      };

      const mockContext: any = {
        req: { headers: {} },
        body: {
          model: "ag/gemini-3.8-flash",
          max_tokens: 70000,
          messages: [{ role: "user", content: "Hi" }],
          stream: true,
        },
        res: { setHeader: () => {}, flushHeaders: () => {}, write: () => {}, end: () => {} },
        account: {
          id: "test-acc-1",
          rawApiKey: JSON.stringify({ access_token: "mock-token", project_id: "test-proj" }),
        },
        targetModel: "ag/gemini-3.8-flash",
        clientFormat: "openai",
        requestId: `test-req-custom-${Date.now()}`,
        startTime: Date.now(),
      };

      try {
        const provider = new AntigravityProvider();
        await executeAntigravity(mockContext, provider);

        assert.equal(capturedBody.request?.generationConfig?.maxOutputTokens, 70000);
      } finally {
        global.fetch = originalFetch;
      }
    });

    it("standardizes requestId to trajectory format agent/${conversationId}/${Date.now()}/${trajectoryId}/${step} matching 9router", async () => {
      const originalFetch = global.fetch;
      let capturedBody: any = null;

      global.fetch = async (_url: any, init: any) => {
        capturedBody = JSON.parse(init.body);
        return new Response(
          new ReadableStream({
            start(controller) {
              controller.close();
            },
          }),
          { status: 200, headers: { "Content-Type": "text/event-stream" } }
        ) as any;
      };

      const mockContext: any = {
        req: { headers: {} },
        body: {
          model: "ag/gemini-3.8-flash",
          messages: [{ role: "user", content: "test requestId" }],
          stream: true,
        },
        res: { setHeader: () => {}, flushHeaders: () => {}, write: () => {}, end: () => {} },
        account: {
          id: "test-acc-1",
          rawApiKey: JSON.stringify({ access_token: "mock-token", project_id: "test-proj" }),
        },
        targetModel: "ag/gemini-3.8-flash",
        clientFormat: "openai",
        requestId: `test-req-id-${Date.now()}`,
        startTime: Date.now(),
      };

      try {
        const provider = new AntigravityProvider();
        await executeAntigravity(mockContext, provider);

        assert.match(
          capturedBody.requestId,
          /^agent\/[0-9a-f-]+\/\d+\/[0-9a-f-]+\/\d+$/,
          `Expected requestId to match trajectory regex, got: ${capturedBody.requestId}`
        );
      } finally {
        global.fetch = originalFetch;
      }
    });

    it("selects AG fallback signature for historical tool calls without cached signature", async () => {
      const originalFetch = global.fetch;
      let capturedGeminiBody: any = null;
      let capturedClaudeBody: any = null;

      global.fetch = async (_url: any, init: any) => {
        const parsed = JSON.parse(init.body);
        if (parsed.model.includes("gemini")) {
          capturedGeminiBody = parsed;
        } else {
          capturedClaudeBody = parsed;
        }
        return new Response(
          new ReadableStream({
            start(controller) {
              controller.close();
            },
          }),
          { status: 200, headers: { "Content-Type": "text/event-stream" } }
        ) as any;
      };

      const toolCallIdGemini = `call_gemini_${Date.now()}`;
      const mockGeminiContext: any = {
        req: { headers: {} },
        body: {
          model: "ag/gemini-3.8-flash",
          messages: [
            { role: "user", content: "run tool" },
            {
              role: "assistant",
              tool_calls: [
                {
                  id: toolCallIdGemini,
                  type: "function",
                  function: { name: "test_tool", arguments: "{}" },
                },
              ],
            },
            { role: "tool", tool_call_id: toolCallIdGemini, content: "ok" },
          ],
          stream: true,
        },
        res: { setHeader: () => {}, flushHeaders: () => {}, write: () => {}, end: () => {} },
        account: {
          id: "test-acc-1",
          rawApiKey: JSON.stringify({ access_token: "mock-token", project_id: "test-proj" }),
        },
        targetModel: "ag/gemini-3.8-flash",
        clientFormat: "openai",
        requestId: `test-sig-gemini-${Date.now()}`,
        startTime: Date.now(),
      };

      const toolCallIdClaude = `call_claude_${Date.now()}`;
      const mockClaudeContext: any = {
        req: { headers: {} },
        body: {
          model: "ag/claude-3.5-sonnet",
          messages: [
            { role: "user", content: "run tool" },
            {
              role: "assistant",
              tool_calls: [
                {
                  id: toolCallIdClaude,
                  type: "function",
                  function: { name: "test_tool", arguments: "{}" },
                },
              ],
            },
            { role: "tool", tool_call_id: toolCallIdClaude, content: "ok" },
          ],
          stream: true,
        },
        res: { setHeader: () => {}, flushHeaders: () => {}, write: () => {}, end: () => {} },
        account: {
          id: "test-acc-1",
          rawApiKey: JSON.stringify({ access_token: "mock-token", project_id: "test-proj" }),
        },
        targetModel: "ag/claude-3.5-sonnet",
        clientFormat: "openai",
        requestId: `test-sig-claude-${Date.now()}`,
        startTime: Date.now(),
      };

      try {
        const provider = new AntigravityProvider();
        await executeAntigravity(mockGeminiContext, provider);
        await executeAntigravity(mockClaudeContext, provider);

        const geminiModelPart = capturedGeminiBody.request.contents[1].parts[0];
        assert.equal(
          geminiModelPart.thoughtSignature,
          DEFAULT_THINKING_GEMINI_CLI_SIGNATURE,
          "Gemini fallback thoughtSignature must match DEFAULT_THINKING_GEMINI_CLI_SIGNATURE"
        );

        const claudeModelPart = capturedClaudeBody.request.contents[1].parts[0];
        assert.equal(
          claudeModelPart.thoughtSignature,
          DEFAULT_THINKING_AG_SIGNATURE,
          "Claude fallback thoughtSignature must match DEFAULT_THINKING_AG_SIGNATURE"
        );
      } finally {
        global.fetch = originalFetch;
      }
    });

    it("packages functionResponse properly: wraps in { result: ... } matching 9router", async () => {
      const originalFetch = global.fetch;
      let capturedBody: any = null;

      global.fetch = async (_url: any, init: any) => {
        capturedBody = JSON.parse(init.body);
        return new Response(
          new ReadableStream({
            start(controller) {
              controller.close();
            },
          }),
          { status: 200, headers: { "Content-Type": "text/event-stream" } }
        ) as any;
      };

      const callId1 = `call_str_${Date.now()}`;
      const callId2 = `call_json_${Date.now()}`;

      const mockContext: any = {
        req: { headers: {} },
        body: {
          model: "ag/gemini-3.8-flash",
          messages: [
            { role: "user", content: "run commands" },
            {
              role: "assistant",
              tool_calls: [
                {
                  id: callId1,
                  type: "function",
                  function: { name: "execute_pwsh", arguments: '{"command":"ls"}' },
                },
                {
                  id: callId2,
                  type: "function",
                  function: { name: "file_search", arguments: '{"query":"test"}' },
                },
              ],
            },
            // Tool 1: raw string (e.g. CLI stdout)
            { role: "tool", tool_call_id: callId1, content: "Directory: C:\\workspace\r\nfile1.txt" },
            // Tool 2: JSON string
            { role: "tool", tool_call_id: callId2, content: '{"files":["a.ts","b.ts"],"count":2}' },
          ],
          stream: true,
        },
        res: { setHeader: () => {}, flushHeaders: () => {}, write: () => {}, end: () => {} },
        account: {
          id: "test-acc-1",
          rawApiKey: JSON.stringify({ access_token: "mock-token", project_id: "test-proj" }),
        },
        targetModel: "ag/gemini-3.8-flash",
        clientFormat: "openai",
        requestId: `test-func-resp-${Date.now()}`,
        startTime: Date.now(),
      };

      try {
        const provider = new AntigravityProvider();
        await executeAntigravity(mockContext, provider);

        const toolTurn = capturedBody.request.contents[2];
        assert.equal(toolTurn.role, "user");
        assert.equal(toolTurn.parts.length, 2);

        // String result must be packaged as { result: { result: "..." } }
        const resp1 = toolTurn.parts[0].functionResponse;
        assert.equal(resp1.name, "execute_pwsh");
        assert.deepEqual(resp1.response, {
          result: {
            result: "Directory: C:\\workspace\r\nfile1.txt",
          },
        });

        // JSON object result must be packaged directly as struct { result: { files: [...], count: 2 } }
        const resp2 = toolTurn.parts[1].functionResponse;
        assert.equal(resp2.name, "file_search");
        assert.deepEqual(resp2.response, {
          result: {
            files: ["a.ts", "b.ts"],
            count: 2,
          },
        });
      } finally {
        global.fetch = originalFetch;
      }
    });

    it("emits data: [DONE]\\n\\n after response.completed event when clientFormat is responses", async () => {
      const originalFetch = global.fetch;
      const emittedChunks: string[] = [];

      const mockSseStream = new ReadableStream({
        start(controller) {
          const geminiChunks = [
            {
              response: {
                candidates: [
                  {
                    content: {
                      role: "model",
                      parts: [{ text: "Responses API stream test" }],
                    },
                    finishReason: "STOP",
                  },
                ],
                usageMetadata: {
                  promptTokenCount: 10,
                  candidatesTokenCount: 5,
                  totalTokenCount: 15,
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

      global.fetch = async () =>
        new Response(mockSseStream, {
          status: 200,
          headers: { "Content-Type": "text/event-stream" },
        }) as any;

      const mockRes: any = {
        setHeader: () => {},
        flushHeaders: () => {},
        write: (chunk: string) => {
          emittedChunks.push(chunk);
        },
        end: () => {},
      };

      const mockContext: any = {
        req: { headers: {} },
        body: {
          model: "ag/gemini-3.8-flash",
          messages: [{ role: "user", content: "hello" }],
          stream: true,
        },
        res: mockRes,
        account: {
          id: "test-acc-1",
          rawApiKey: JSON.stringify({ access_token: "mock-token", project_id: "test-proj" }),
        },
        targetModel: "ag/gemini-3.8-flash",
        clientFormat: "responses",
        requestId: `test-responses-done-${Date.now()}`,
        startTime: Date.now(),
      };

      try {
        const provider = new AntigravityProvider();
        await executeAntigravity(mockContext, provider);

        const joined = emittedChunks.join("");
        assert.ok(joined.includes("response.completed"), "Must emit response.completed event");
        assert.ok(joined.includes("data: [DONE]\n\n"), "Must emit data: [DONE]\\n\\n sentinel");
        // Verify data: [DONE]\n\n comes after response.completed
        const completedIndex = joined.indexOf("response.completed");
        const doneIndex = joined.indexOf("data: [DONE]\n\n");
        assert.ok(doneIndex > completedIndex, "data: [DONE]\\n\\n must follow response.completed");
      } finally {
        global.fetch = originalFetch;
      }
    });

    it("captures and caches snake_case thought_signature in streaming execution", async () => {
      const originalFetch = global.fetch;
      clearThoughtSignatureStore();

      const toolCallId = `call_snake_stream_${Date.now()}`;
      const mockSseStream = new ReadableStream({
        start(controller) {
          const chunk = {
            response: {
              candidates: [
                {
                  content: {
                    parts: [
                      {
                        functionCall: {
                          id: toolCallId,
                          name: "testSnakeTool",
                          args: { foo: "bar" },
                        },
                        thought_signature: "sig_from_snake_case_stream_xyz",
                      },
                    ],
                  },
                  finishReason: "STOP",
                },
              ],
            },
          };
          controller.enqueue(new TextEncoder().encode(`data: ${JSON.stringify(chunk)}\n\n`));
          controller.close();
        },
      });

      global.fetch = async () =>
        new Response(mockSseStream, {
          status: 200,
          headers: { "content-type": "text/event-stream" },
        }) as any;

      const mockContext: any = {
        req: { headers: {} },
        body: {
          model: "ag/gemini-3.8-flash",
          messages: [{ role: "user", content: "test snake stream" }],
          stream: true,
        },
        res: { setHeader: () => {}, flushHeaders: () => {}, write: () => {}, end: () => {} },
        account: {
          id: "test-acc-1",
          rawApiKey: JSON.stringify({ access_token: "mock-token", project_id: "test-proj" }),
        },
        targetModel: "ag/gemini-3.8-flash",
        clientFormat: "openai",
        requestId: `test-snake-stream-${Date.now()}`,
        startTime: Date.now(),
      };

      try {
        const provider = new AntigravityProvider();
        await executeAntigravity(mockContext, provider);

        const cachedSig = getGeminiThoughtSignatureSync(toolCallId);
        assert.equal(
          cachedSig,
          "sig_from_snake_case_stream_xyz",
          "Snake_case thought_signature must be cached in streaming mode"
        );
      } finally {
        global.fetch = originalFetch;
      }
    });

    it("captures and caches snake_case thought_signature in non-streaming execution", async () => {
      const originalFetch = global.fetch;
      clearThoughtSignatureStore();

      const toolCallId = `call_snake_nonstream_${Date.now()}`;
      const nonStreamResponse = {
        response: {
          candidates: [
            {
              content: {
                parts: [
                  {
                    functionCall: {
                      id: toolCallId,
                      name: "testSnakeNonStream",
                      args: { key: "val" },
                    },
                    thought_signature: "sig_from_snake_case_nonstream_123",
                  },
                ],
              },
              finishReason: "STOP",
            },
          ],
        },
      };

      global.fetch = async () =>
        new Response(JSON.stringify(nonStreamResponse), {
          status: 200,
          headers: { "content-type": "application/json" },
        }) as any;

      let sentStatus = 0;
      let sentJson: any = null;
      const mockRes: any = {
        status: (code: number) => {
          sentStatus = code;
          return {
            json: (payload: any) => {
              sentJson = payload;
            },
          };
        },
      };

      const mockContext: any = {
        req: { headers: {} },
        body: {
          model: "ag/gemini-3.8-flash",
          messages: [{ role: "user", content: "test snake non-stream" }],
          stream: false,
        },
        res: mockRes,
        account: {
          id: "test-acc-1",
          rawApiKey: JSON.stringify({ access_token: "mock-token", project_id: "test-proj" }),
        },
        targetModel: "ag/gemini-3.8-flash",
        clientFormat: "openai",
        requestId: `test-snake-nonstream-${Date.now()}`,
        startTime: Date.now(),
      };

      try {
        const provider = new AntigravityProvider();
        const result = await executeAntigravity(mockContext, provider);

        assert.equal(result.ok, true);
        assert.equal(sentStatus, 200);
        assert.equal(sentJson.choices[0].message.tool_calls[0].function.name, "testSnakeNonStream");

        const cachedSig = getGeminiThoughtSignatureSync(toolCallId);
        assert.equal(
          cachedSig,
          "sig_from_snake_case_nonstream_123",
          "Snake_case thought_signature must be cached in non-streaming mode"
        );
      } finally {
        global.fetch = originalFetch;
      }
    });
  });
});
