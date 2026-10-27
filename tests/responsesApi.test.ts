process.env.NODE_ENV = "test";

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import app from "../src/server/index.js";
import {
  normalizeResponsesInput,
  convertResponsesApiFormat,
} from "../src/core/adapters/responsesAdapter.js";

describe("Responses API Adapter & Endpoints", () => {
  describe("normalizeResponsesInput", () => {
    it("normalizes string input to user message array", () => {
      const res = normalizeResponsesInput("Hello world");
      assert.deepEqual(res, [
        {
          type: "message",
          role: "user",
          content: [{ type: "input_text", text: "Hello world" }],
        },
      ]);
    });

    it("handles empty string with fallback placeholder", () => {
      const res = normalizeResponsesInput("   ");
      assert.deepEqual(res, [
        {
          type: "message",
          role: "user",
          content: [{ type: "input_text", text: "..." }],
        },
      ]);
    });

    it("handles empty array with fallback placeholder", () => {
      const res = normalizeResponsesInput([]);
      assert.deepEqual(res, [
        {
          type: "message",
          role: "user",
          content: [{ type: "input_text", text: "..." }],
        },
      ]);
    });

    it("passes non-empty array through", () => {
      const input = [{ type: "message", role: "user", content: "hi" }];
      const res = normalizeResponsesInput(input);
      assert.equal(res, input);
    });
  });

  describe("convertResponsesApiFormat", () => {
    it("converts instructions and input messages to chat completions format", () => {
      const body = {
        model: "gpt-4o",
        instructions: "System prompt instructions",
        input: [
          {
            type: "message",
            role: "user",
            content: [{ type: "input_text", text: "Hello" }],
          },
          {
            type: "message",
            role: "assistant",
            content: [{ type: "output_text", text: "Hi there" }],
          },
        ],
      };

      const converted = convertResponsesApiFormat(body);
      assert.equal(converted.messages.length, 3);
      assert.deepEqual(converted.messages[0], {
        role: "system",
        content: "System prompt instructions",
      });
      assert.deepEqual(converted.messages[1], {
        role: "user",
        content: [{ type: "text", text: "Hello" }],
      });
      assert.deepEqual(converted.messages[2], {
        role: "assistant",
        content: [{ type: "text", text: "Hi there" }],
      });
      assert.equal(converted.input, undefined);
      assert.equal(converted.instructions, undefined);
    });

    it("converts function_call and function_call_output items", () => {
      const body = {
        model: "claude-3-7-sonnet",
        input: [
          {
            type: "message",
            role: "user",
            content: "What is the weather in Tokyo?",
          },
          {
            type: "function_call",
            call_id: "call_123",
            name: "get_weather",
            arguments: JSON.stringify({ location: "Tokyo" }),
          },
          {
            type: "function_call_output",
            call_id: "call_123",
            output: JSON.stringify({ temp: 22 }),
          },
        ],
      };

      const converted = convertResponsesApiFormat(body);
      assert.equal(converted.messages.length, 3);
      assert.equal(converted.messages[0].role, "user");
      assert.equal(converted.messages[1].role, "assistant");
      assert.equal(converted.messages[1].tool_calls.length, 1);
      assert.equal(converted.messages[1].tool_calls[0].id, "call_123");
      assert.equal(converted.messages[1].tool_calls[0].function.name, "get_weather");
      assert.equal(converted.messages[2].role, "tool");
      assert.equal(converted.messages[2].tool_call_id, "call_123");
    });

    it("preserves strict chronological turn order across multi-turn tool calling", () => {
      const body = {
        model: "ag/gemini-3.8-flash",
        input: [
          {
            type: "message",
            role: "user",
            content: "Inspect project",
          },
          {
            type: "function_call",
            call_id: "call_pwsh_1",
            name: "execute_pwsh",
            arguments: JSON.stringify({ command: "dir" }),
          },
          {
            type: "function_call_output",
            call_id: "call_pwsh_1",
            output: "Directory: src\r\npackage.json",
          },
          {
            type: "function_call",
            call_id: "call_read_2",
            name: "read_file",
            arguments: JSON.stringify({ path: "src/main.rs" }),
          },
          {
            type: "function_call_output",
            call_id: "call_read_2",
            output: '<file name="src/main.rs">\nfn main() {}\n</file>',
          },
        ],
      };

      const converted = convertResponsesApiFormat(body);
      assert.equal(converted.messages.length, 5);
      // Turn 0: user message
      assert.equal(converted.messages[0].role, "user");
      assert.equal(converted.messages[0].content, "Inspect project");

      // Turn 1: assistant call_pwsh_1
      assert.equal(converted.messages[1].role, "assistant");
      assert.equal(converted.messages[1].tool_calls.length, 1);
      assert.equal(converted.messages[1].tool_calls[0].id, "call_pwsh_1");

      // Turn 2: tool output call_pwsh_1
      assert.equal(converted.messages[2].role, "tool");
      assert.equal(converted.messages[2].tool_call_id, "call_pwsh_1");
      assert.equal(converted.messages[2].content, "Directory: src\r\npackage.json");

      // Turn 3: assistant call_read_2
      assert.equal(converted.messages[3].role, "assistant");
      assert.equal(converted.messages[3].tool_calls.length, 1);
      assert.equal(converted.messages[3].tool_calls[0].id, "call_read_2");

      // Turn 4: tool output call_read_2
      assert.equal(converted.messages[4].role, "tool");
      assert.equal(converted.messages[4].tool_call_id, "call_read_2");
      assert.equal(converted.messages[4].content, '<file name="src/main.rs">\nfn main() {}\n</file>');
    });

    it("converts Kiro conversationState wire format to OpenAI messages and tools", () => {
      const kiroBody = {
        model: "ag/gemini-3.8-flash",
        conversationState: {
          currentMessage: {
            userInputMessage: {
              content: "Explain quantum computing",
              userInputMessageContext: {
                tools: [
                  {
                    toolSpecification: {
                      name: "calculator",
                      description: "Perform math",
                      inputSchema: { json: { type: "object", properties: { expr: { type: "string" } } } },
                    },
                  },
                ],
              },
            },
          },
        },
      };

      const converted = convertResponsesApiFormat(kiroBody);
      assert.ok(Array.isArray(converted.messages));
      assert.equal(converted.messages.length, 1);
      assert.equal(converted.messages[0].role, "user");
      assert.equal(converted.messages[0].content, "Explain quantum computing");
      assert.ok(Array.isArray(converted.tools));
      assert.equal(converted.tools[0].function.name, "calculator");
      assert.equal(converted.tool_choice, "auto");
    });

    it("leaves standard messages body unchanged", () => {
      const standardBody = {
        model: "gpt-4o",
        messages: [{ role: "user", content: "hi" }],
      };

      const converted = convertResponsesApiFormat(standardBody);
      assert.deepEqual(converted.messages, standardBody.messages);
    });

    it("normalizes flat Responses API tools into OpenAI Chat Completions function tools", () => {
      const responsesBody = {
        model: "xiaomi-tokenplan/mimo-v2.6-flash",
        input: [{ type: "message", role: "user", content: [{ type: "input_text", text: "What files are here?" }] }],
        tools: [
          {
            type: "function",
            name: "fs_list_dir",
            description: "Lists directory contents",
            parameters: {
              type: "object",
              properties: { path: { type: "string" } },
              required: ["path"],
            },
          },
        ],
        tool_choice: { type: "function", name: "fs_list_dir" },
        max_output_tokens: 4096,
      };

      const converted = convertResponsesApiFormat(responsesBody);
      assert.ok(Array.isArray(converted.tools));
      assert.equal(converted.tools.length, 1);
      assert.equal(converted.tools[0].type, "function");
      assert.ok(converted.tools[0].function, "Expected function property to be set on tool");
      assert.equal(converted.tools[0].function.name, "fs_list_dir");
      assert.equal(converted.tools[0].function.description, "Lists directory contents");
      assert.deepEqual(converted.tools[0].function.parameters.required, ["path"]);
      assert.deepEqual(converted.tool_choice, {
        type: "function",
        function: { name: "fs_list_dir" },
      });
      assert.equal(converted.max_tokens, 4096);
      assert.equal(converted.max_output_tokens, undefined);
    });
  });

  describe("Server endpoint /v1/responses", () => {
    it("is mounted and accepts POST requests without 404", async () => {
      const server = http.createServer(app);
      await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", () => resolve()));
      const address = server.address() as { port: number };
      const baseUrl = `http://127.0.0.1:${address.port}`;

      try {
        // Send a request to /v1/responses with an unknown model to verify route is registered (not 404)
        const res = await fetch(`${baseUrl}/v1/responses`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            model: "non-existent-test-model",
            input: "Test hello",
          }),
        });

        // It should route to handleProxyRequest, which will return 400 or 404 (model not found JSON error),
        // NOT Express default HTML 404!
        assert.notEqual(res.headers.get("content-type"), "text/html; charset=utf-8");
        const json = (await res.json()) as any;
        assert.ok(json.error, "Expected an API error response, not static 404");
      } finally {
        server.close();
      }
    });
  });

  describe("Responses API Streaming Translator", () => {
    it("translates OpenAI text chunks into Responses API SSE events", async () => {
      const { createResponsesStreamState, openAiChunkToResponsesEvents, finalizeResponsesStream } = await import(
        "../src/core/adapters/responsesAdapter.js"
      );

      const state = createResponsesStreamState("req-test-1");
      const events1 = openAiChunkToResponsesEvents(
        {
          id: "chatcmpl-test",
          choices: [{ index: 0, delta: { content: "Hello " } }],
        },
        state
      );

      assert.ok(events1.some((e) => e.event === "response.created"));
      assert.ok(events1.some((e) => e.event === "response.in_progress"));
      assert.ok(events1.some((e) => e.event === "response.output_item.added"));
      assert.ok(events1.some((e) => e.event === "response.content_part.added"));
      const deltaEv = events1.find((e) => e.event === "response.output_text.delta");
      assert.ok(deltaEv);
      assert.equal(deltaEv.data.delta, "Hello ");

      const events2 = openAiChunkToResponsesEvents(
        {
          choices: [{ index: 0, delta: { content: "world!" } }],
        },
        state
      );
      assert.equal(events2.length, 1);
      assert.equal(events2[0].event, "response.output_text.delta");
      assert.equal(events2[0].data.delta, "world!");

      const finishEvents = openAiChunkToResponsesEvents(
        {
          choices: [{ index: 0, delta: {}, finish_reason: "stop" }],
          usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
        },
        state
      );

      assert.ok(finishEvents.some((e) => e.event === "response.output_text.done"));
      assert.ok(finishEvents.some((e) => e.event === "response.content_part.done"));
      assert.ok(finishEvents.some((e) => e.event === "response.output_item.done"));
      assert.ok(finishEvents.some((e) => e.event === "response.completed"));

      const completed = finishEvents.find((e) => e.event === "response.completed");
      assert.equal(completed?.data.response.status, "completed");
      assert.ok(Array.isArray(completed?.data.response.output), "Must include output array in response.completed");
      assert.equal(completed?.data.response.output.length, 1);
      assert.equal(completed?.data.response.output[0].type, "message");
      assert.equal(completed?.data.response.output[0].content[0].text, "Hello world!");
      assert.equal(completed?.data.response.usage?.total_tokens, 15);
    });

    it("finishes cleanly when upstream stream produces 0 text without synthesizing artificial fallback text (9router standard)", async () => {
      const { createResponsesStreamState, openAiChunkToResponsesEvents, finalizeResponsesStream } = await import(
        "../src/core/adapters/responsesAdapter.js"
      );

      const state = createResponsesStreamState("req-test-empty");
      // Upstream chunk with 0 text content
      openAiChunkToResponsesEvents(
        {
          choices: [{ index: 0, delta: {} }],
        },
        state
      );

      const finalEvents = finalizeResponsesStream(state);
      assert.ok(!finalEvents.some((e) => e.event === "response.output_text.delta"));
      assert.ok(finalEvents.some((e) => e.event === "response.completed"));

      const completed = finalEvents.find((e) => e.event === "response.completed");
      assert.equal(completed?.data.response.status, "completed");
    });

    it("converts OpenAI non-streaming response to Responses API format", async () => {
      const { convertOpenAiResponseToResponsesApi } = await import(
        "../src/core/adapters/responsesAdapter.js"
      );

      const openAiRes = {
        id: "chatcmpl-123",
        created: 1700000000,
        model: "ag/gemini-3.8-flash",
        choices: [
          {
            index: 0,
            message: {
              role: "assistant",
              content: "Hello from Antigravity!",
              reasoning_content: "Thinking step",
            },
            finish_reason: "stop",
          },
        ],
        usage: { prompt_tokens: 10, completion_tokens: 8, total_tokens: 18 },
      };

      const converted = convertOpenAiResponseToResponsesApi(openAiRes);
      assert.equal(converted.id, "resp_chatcmpl-123");
      assert.equal(converted.status, "completed");
      assert.equal(converted.output.length, 2);
      assert.equal(converted.output[0].type, "reasoning");
      assert.equal(converted.output[0].content[0].text, "Thinking step");
      assert.equal(converted.output[1].type, "message");
      assert.equal(converted.output[1].content[0].text, "Hello from Antigravity!");
      assert.equal(converted.usage.total_tokens, 18);
    });

    it("accumulates tool call argument deltas and emits full arguments on done and completed", async () => {
      const { createResponsesStreamState, openAiChunkToResponsesEvents } = await import(
        "../src/core/adapters/responsesAdapter.js"
      );

      const state = createResponsesStreamState("req-test-tools");

      // Chunk 1: Tool call start with initial arguments
      const ev1 = openAiChunkToResponsesEvents(
        {
          id: "chatcmpl-tools",
          choices: [
            {
              index: 0,
              delta: {
                tool_calls: [
                  {
                    index: 0,
                    id: "call_abc",
                    function: { name: "readFile", arguments: '{"path":' },
                  },
                ],
              },
            },
          ],
        },
        state
      );
      assert.ok(ev1.some((e) => e.event === "response.output_item.added"));
      assert.ok(ev1.some((e) => e.event === "response.function_call_arguments.delta"));

      // Chunk 2: More arguments delta
      const ev2 = openAiChunkToResponsesEvents(
        {
          choices: [
            {
              index: 0,
              delta: {
                tool_calls: [
                  {
                    index: 0,
                    function: { arguments: '"src/index.ts"}' },
                  },
                ],
              },
            },
          ],
        },
        state
      );
      assert.ok(ev2.some((e) => e.event === "response.function_call_arguments.delta"));

      // Chunk 3: Finalize stream with tool_calls finish_reason
      const finishEvents = openAiChunkToResponsesEvents(
        {
          choices: [{ index: 0, delta: {}, finish_reason: "tool_calls" }],
        },
        state
      );

      const funcDone = finishEvents.find((e) => e.event === "response.function_call_arguments.done");
      assert.ok(funcDone, "Must emit response.function_call_arguments.done");
      assert.equal(funcDone.data.arguments, '{"path":"src/index.ts"}');

      const itemDone = finishEvents.find((e) => e.event === "response.output_item.done");
      assert.ok(itemDone, "Must emit response.output_item.done");
      assert.equal(itemDone.data.item.arguments, '{"path":"src/index.ts"}');

      const completed = finishEvents.find((e) => e.event === "response.completed");
      assert.ok(completed, "Must emit response.completed");
    });
  });
});
