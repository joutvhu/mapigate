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
});
