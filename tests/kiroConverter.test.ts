import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { buildKiroPayload, normalizeKiroToolSpecs } from "../src/providers/runtime/kiro/converter.js";

describe("Kiro Converter - OpenAI to CodeWhisperer wire format", () => {
  it("normalizes tool specifications to AWS CodeWhisperer inputSchema format", () => {
    const openAiTools = [
      {
        type: "function",
        function: {
          name: "read_file",
          description: "Read file contents",
          parameters: {
            type: "object",
            properties: {
              path: { type: "string" },
            },
            required: ["path"],
            additionalProperties: false,
          },
        },
      },
    ];

    const specs = normalizeKiroToolSpecs(openAiTools);
    assert.equal(specs.length, 1);
    assert.equal(specs[0].toolSpecification.name, "read_file");
    assert.equal(specs[0].toolSpecification.description, "Read file contents");
    assert.deepEqual(specs[0].toolSpecification.inputSchema.json, {
      type: "object",
      properties: { path: { type: "string" } },
      required: ["path"],
    });
    // additionalProperties should be stripped
    assert.equal(specs[0].toolSpecification.inputSchema.json.additionalProperties, undefined);
  });

  it("converts simple user message into valid conversationState payload", () => {
    const body = {
      messages: [
        { role: "system", content: "You are an expert coder" },
        { role: "user", content: "review lại các phân tích xem đúng không" },
      ],
    };

    const payload = buildKiroPayload(body, "claude-sonnet-5.5", {
      providerSpecificData: {
        authMethod: "builder-id",
        profileArn: "arn:aws:codewhisperer:us-east-1:12345:profile/test",
      },
    });

    assert.ok(payload.conversationState, "Must have conversationState");
    assert.equal(payload.conversationState.chatTriggerType, "MANUAL");
    assert.equal(payload.profileArn, "arn:aws:codewhisperer:us-east-1:12345:profile/test");

    const currentMsg = payload.conversationState.currentMessage?.userInputMessage;
    assert.ok(currentMsg, "Must have currentMessage.userInputMessage");
    assert.equal(currentMsg.modelId, "claude-sonnet-5.5");
    assert.equal(currentMsg.origin, "AI_EDITOR");
    assert.ok(currentMsg.content.includes("<instructions>\nYou are an expert coder\n</instructions>"));
    assert.ok(currentMsg.content.includes("review lại các phân tích xem đúng không"));
  });

  it("converts multi-turn conversation with assistant tool calls and user tool results", () => {
    const body = {
      messages: [
        { role: "user", content: "Check git status" },
        {
          role: "assistant",
          content: "Let me run git status",
          tool_calls: [
            {
              id: "call_abc123",
              type: "function",
              function: {
                name: "execute_pwsh",
                arguments: '{"command":"git status"}',
              },
            },
          ],
        },
        {
          role: "tool",
          tool_call_id: "call_abc123",
          content: "On branch main, working tree clean",
        },
      ],
      tools: [
        {
          type: "function",
          function: {
            name: "execute_pwsh",
            description: "Run command",
            parameters: {
              type: "object",
              properties: { command: { type: "string" } },
            },
          },
        },
      ],
    };

    const payload = buildKiroPayload(body, "claude-sonnet-5.5");
    const cs = payload.conversationState;

    assert.equal(cs.history.length, 2);
    // Turn 1 in history: user
    assert.equal(cs.history[0].userInputMessage.content, "Check git status");
    // Turn 2 in history: assistant with toolUses
    assert.equal(cs.history[1].assistantResponseMessage.toolUses.length, 1);
    assert.equal(cs.history[1].assistantResponseMessage.toolUses[0].name, "execute_pwsh");

    // Current message: tool result
    const currentMsg = cs.currentMessage.userInputMessage;
    assert.ok(currentMsg.userInputMessageContext?.toolResults);
    assert.equal(currentMsg.userInputMessageContext.toolResults.length, 1);
    assert.equal(currentMsg.userInputMessageContext.toolResults[0].toolUseId, "call_abc123");
    assert.equal(currentMsg.userInputMessageContext.toolResults[0].content[0].text, "On branch main, working tree clean");

    // Tools attached to current context
    assert.equal(currentMsg.userInputMessageContext.tools.length, 1);
    assert.equal(currentMsg.userInputMessageContext.tools[0].toolSpecification.name, "execute_pwsh");
  });

  it("assembles fragmented toolUseEvent chunks and emits valid tool call sequence with finish_reason tool_calls", async () => {
    const { executeKiro } = await import("../src/providers/runtime/kiro/executor.js");
    const { buildEventStreamFrame } = await import("../src/mitm/handlers/kiro/state.js");

    // Construct mock frames from AWS CodeWhisperer
    const frame1 = buildEventStreamFrame("assistantResponseEvent", { content: "Searching code..." });
    // Frame 2: Init frame (name + toolUseId, no input)
    const frame2 = buildEventStreamFrame("toolUseEvent", { toolUseId: "call_grep_1", name: "grep_search" });
    // Frame 3: Input fragment 1
    const frame3 = buildEventStreamFrame("toolUseEvent", { toolUseId: "call_grep_1", input: '{"query":' });
    // Frame 4: Input fragment 2
    const frame4 = buildEventStreamFrame("toolUseEvent", { toolUseId: "call_grep_1", input: '"test"}' });

    const fullBinaryStream = Buffer.concat([frame1, frame2, frame3, frame4]);

    const originalFetch = global.fetch;
    global.fetch = async () =>
      new Response(fullBinaryStream, {
        status: 200,
        headers: { "Content-Type": "application/vnd.amazon.eventstream" },
      });

    try {
      const writtenChunks: string[] = [];
      const mockRes: any = {
        headersSent: false,
        writableEnded: false,
        destroyed: false,
        setHeader() {},
        flushHeaders() {},
        write(chunk: string) {
          writtenChunks.push(chunk);
          return true;
        },
        end() {
          this.writableEnded = true;
        },
      };

      const result = await executeKiro({
        req: {} as any,
        res: mockRes,
        clientFormat: "openai",
        targetModel: "claude-sonnet-5.5",
        targetFormat: "openai",
        body: { stream: true, messages: [{ role: "user", content: "search test" }] },
        requestId: "test_req_123",
        startTime: Date.now(),
      });

      assert.equal(result.ok, true);
      assert.equal(result.status, 200);

      const parsedChunks = writtenChunks
        .map((str) => str.trim())
        .filter((str) => str.startsWith("data: ") && str !== "data: [DONE]")
        .map((str) => JSON.parse(str.slice(6)));

      // 1. Text chunk
      const textChunk = parsedChunks.find((c) => c.choices?.[0]?.delta?.content === "Searching code...");
      assert.ok(textChunk, "Must contain assistantResponse text chunk");

      // 2. Tool call init chunk must have arguments: "" (NEVER "{}")
      const initToolChunk = parsedChunks.find((c) => c.choices?.[0]?.delta?.tool_calls?.[0]?.function?.name === "grep_search");
      assert.ok(initToolChunk, "Must emit tool call init chunk");
      assert.equal(initToolChunk.choices[0].delta.tool_calls[0].id, "call_grep_1");
      assert.equal(initToolChunk.choices[0].delta.tool_calls[0].function.arguments, "");

      // 3. Full arguments chunk must assemble fragments
      const argsToolChunk = parsedChunks.find(
        (c) => c.choices?.[0]?.delta?.tool_calls?.[0]?.function?.arguments === '{"query":"test"}'
      );
      assert.ok(argsToolChunk, "Must assemble input chunks into valid JSON argument");

      // 4. Terminal chunk must have finish_reason: "tool_calls"
      const finishChunk = parsedChunks.find((c) => c.choices?.[0]?.finish_reason === "tool_calls");
      assert.ok(finishChunk, "Must emit finish_reason: tool_calls when tool was called");

      // 5. Must conclude with data: [DONE]
      assert.ok(writtenChunks.some((w) => w.includes("data: [DONE]")));
    } finally {
      global.fetch = originalFetch;
    }
  });
});
