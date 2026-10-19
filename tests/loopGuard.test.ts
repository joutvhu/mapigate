import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import {
  computeLoopSignature,
  checkLoopGuard,
  recordLoopTurnResult,
  resetLoopGuard,
  detectToolCallLoopInMessages,
  computeToolCallSignature,
} from "../src/core/router/loopGuard.js";

describe("LoopGuard Engine", () => {
  beforeEach(() => {
    resetLoopGuard();
  });

  it("computes reproducible signatures", () => {
    const sig1 = computeLoopSignature("kiro", "antigravity/gemini-3.8-flash", 67, "test prompt");
    const sig2 = computeLoopSignature("kiro", "antigravity/gemini-3.8-flash", 67, "test prompt");
    assert.equal(sig1, sig2);
    assert.ok(sig1.includes("kiro"));
    assert.ok(sig1.includes("67"));
  });

  it("does not halt on initial attempts", () => {
    const sig = computeLoopSignature("kiro", "gemini", 10, "prompt");
    const check1 = checkLoopGuard(sig, { enabled: true, maxConsecutiveEmpty: 3, maxConsecutiveToolCalls: 3 });
    assert.equal(check1.shouldHalt, false);
    assert.equal(check1.count, 0);

    recordLoopTurnResult(sig, 0);
    const check2 = checkLoopGuard(sig, { enabled: true, maxConsecutiveEmpty: 3, maxConsecutiveToolCalls: 3 });
    assert.equal(check2.shouldHalt, false);
    assert.equal(check2.count, 1);
  });

  it("halts when consecutive empty attempts reach threshold", () => {
    const sig = computeLoopSignature("kiro", "gemini", 10, "prompt");
    recordLoopTurnResult(sig, 0);
    recordLoopTurnResult(sig, 0);
    recordLoopTurnResult(sig, 0);

    const check = checkLoopGuard(sig, { enabled: true, maxConsecutiveEmpty: 3, maxConsecutiveToolCalls: 3 });
    assert.equal(check.shouldHalt, true);
    assert.equal(check.reason, "empty_turn");
    assert.equal(check.count, 3);
  });

  it("resets count when tokens are successfully generated", () => {
    const sig = computeLoopSignature("kiro", "gemini", 10, "prompt");
    recordLoopTurnResult(sig, 0);
    recordLoopTurnResult(sig, 0);
    assert.equal(checkLoopGuard(sig, { enabled: true, maxConsecutiveEmpty: 3, maxConsecutiveToolCalls: 3 }).count, 2);

    // Turn succeeds with 45 tokens (no tool calls)
    recordLoopTurnResult(sig, 45);

    const check = checkLoopGuard(sig, { enabled: true, maxConsecutiveEmpty: 3, maxConsecutiveToolCalls: 3 });
    assert.equal(check.shouldHalt, false);
    assert.equal(check.count, 0);
  });

  it("does not halt if LoopGuard is disabled in settings", () => {
    const sig = computeLoopSignature("kiro", "gemini", 10, "prompt");
    recordLoopTurnResult(sig, 0);
    recordLoopTurnResult(sig, 0);
    recordLoopTurnResult(sig, 0);
    recordLoopTurnResult(sig, 0);

    const check = checkLoopGuard(sig, { enabled: false, maxConsecutiveEmpty: 3, maxConsecutiveToolCalls: 3 });
    assert.equal(check.shouldHalt, false);
  });

  describe("Tool Call Loop Detection in Conversation History (Messages)", () => {
    it("detects 3 consecutive assistant turns calling same tool with same arguments", () => {
      const messages = [
        { role: "user", content: "read file" },
        {
          role: "assistant",
          tool_calls: [
            {
              id: "call_1",
              type: "function",
              function: { name: "readFile", arguments: JSON.stringify({ path: "test.txt" }) },
            },
          ],
        },
        { role: "tool", content: "file content 1" },
        {
          role: "assistant",
          tool_calls: [
            {
              id: "call_2",
              type: "function",
              function: { name: "readFile", arguments: JSON.stringify({ path: "test.txt" }) },
            },
          ],
        },
        { role: "tool", content: "file content 1" },
        {
          role: "assistant",
          tool_calls: [
            {
              id: "call_3",
              type: "function",
              function: { name: "readFile", arguments: JSON.stringify({ path: "test.txt" }) },
            },
          ],
        },
      ];

      const detected = detectToolCallLoopInMessages(messages, 3);
      assert.equal(detected.isLoop, true);
      assert.equal(detected.count, 3);
      assert.equal(detected.toolName, "readFile");
    });

    it("does not trigger loop when tool arguments change", () => {
      const messages = [
        {
          role: "assistant",
          tool_calls: [
            {
              type: "function",
              function: { name: "readFile", arguments: JSON.stringify({ path: "file1.txt" }) },
            },
          ],
        },
        { role: "tool", content: "content 1" },
        {
          role: "assistant",
          tool_calls: [
            {
              type: "function",
              function: { name: "readFile", arguments: JSON.stringify({ path: "file2.txt" }) },
            },
          ],
        },
        { role: "tool", content: "content 2" },
        {
          role: "assistant",
          tool_calls: [
            {
              type: "function",
              function: { name: "readFile", arguments: JSON.stringify({ path: "file3.txt" }) },
            },
          ],
        },
      ];

      const detected = detectToolCallLoopInMessages(messages, 3);
      assert.equal(detected.isLoop, false);
      assert.equal(detected.count, 1);
    });

    it("breaks streak when an assistant message produces normal text without tools", () => {
      const messages = [
        {
          role: "assistant",
          tool_calls: [
            {
              type: "function",
              function: { name: "readFile", arguments: { path: "same.txt" } },
            },
          ],
        },
        {
          role: "assistant",
          tool_calls: [
            {
              type: "function",
              function: { name: "readFile", arguments: { path: "same.txt" } },
            },
          ],
        },
        {
          role: "assistant",
          content: "Here is your summary.",
        },
      ];

      const detected = detectToolCallLoopInMessages(messages, 3);
      assert.equal(detected.isLoop, false);
      assert.equal(detected.count, 0);
    });

    it("supports Anthropic tool_use content blocks", () => {
      const messages = [
        {
          role: "assistant",
          content: [{ type: "tool_use", name: "search", input: { query: "mapigate" } }],
        },
        { role: "user", content: [{ type: "tool_result", content: "found 1 result" }] },
        {
          role: "assistant",
          content: [{ type: "tool_use", name: "search", input: { query: "mapigate" } }],
        },
        { role: "user", content: [{ type: "tool_result", content: "found 1 result" }] },
        {
          role: "assistant",
          content: [{ type: "tool_use", name: "search", input: { query: "mapigate" } }],
        },
      ];

      const detected = detectToolCallLoopInMessages(messages, 3);
      assert.equal(detected.isLoop, true);
      assert.equal(detected.count, 3);
      assert.equal(detected.toolName, "search");
    });

    it("checkLoopGuard halts with reason tool_loop when messages contains repeated calls", () => {
      const sig = computeLoopSignature("kiro", "gemini", 10, "prompt");
      const messages = [
        { role: "assistant", tool_calls: [{ function: { name: "grep", arguments: { q: "abc" } } }] },
        { role: "assistant", tool_calls: [{ function: { name: "grep", arguments: { q: "abc" } } }] },
        { role: "assistant", tool_calls: [{ function: { name: "grep", arguments: { q: "abc" } } }] },
      ];

      const check = checkLoopGuard(
        sig,
        { enabled: true, maxConsecutiveEmpty: 3, maxConsecutiveToolCalls: 3 },
        messages
      );
      assert.equal(check.shouldHalt, true);
      assert.equal(check.reason, "tool_loop");
      assert.equal(check.count, 3);
    });

    it("detects loop for meta-tools (update_session_information, set_session_info, heartbeat) even when description/summary changes", () => {
      const messages = [
        {
          role: "assistant",
          tool_calls: [
            {
              id: "call_meta_1",
              type: "function",
              function: {
                name: "update_session_information",
                arguments: JSON.stringify({ summary: "First update", description: "Step 1" }),
              },
            },
          ],
        },
        { role: "tool", content: "ok" },
        {
          role: "assistant",
          tool_calls: [
            {
              id: "call_meta_2",
              type: "function",
              function: {
                name: "update_session_information",
                arguments: JSON.stringify({ summary: "Second update", description: "Step 2" }),
              },
            },
          ],
        },
        { role: "tool", content: "ok" },
        {
          role: "assistant",
          tool_calls: [
            {
              id: "call_meta_3",
              type: "function",
              function: {
                name: "update_session_information",
                arguments: JSON.stringify({ summary: "Third update", description: "Step 3" }),
              },
            },
          ],
        },
      ];

      const detected = detectToolCallLoopInMessages(messages, 3);
      assert.equal(detected.isLoop, true);
      assert.equal(detected.count, 3);
      assert.equal(detected.toolName, "update_session_information");
    });

    it("detects loop for file_search when query is identical even if explanation changes", () => {
      const messages = [
        {
          role: "assistant",
          tool_calls: [
            {
              id: "call_fs_1",
              type: "function",
              function: {
                name: "file_search",
                arguments: JSON.stringify({ query: "find_user", explanation: "Looking for user service" }),
              },
            },
          ],
        },
        { role: "tool", content: "found 0 files" },
        {
          role: "assistant",
          tool_calls: [
            {
              id: "call_fs_2",
              type: "function",
              function: {
                name: "file_search",
                arguments: JSON.stringify({ query: "find_user", explanation: "Searching repository again" }),
              },
            },
          ],
        },
        { role: "tool", content: "found 0 files" },
        {
          role: "assistant",
          tool_calls: [
            {
              id: "call_fs_3",
              type: "function",
              function: {
                name: "file_search",
                arguments: JSON.stringify({ query: "find_user", explanation: "Retrying file search" }),
              },
            },
          ],
        },
      ];

      const detected = detectToolCallLoopInMessages(messages, 3);
      assert.equal(detected.isLoop, true);
      assert.equal(detected.count, 3);
      assert.equal(detected.toolName, "file_search");
    });

    it("does not detect file_search loop when query changes", () => {
      const messages = [
        {
          role: "assistant",
          tool_calls: [
            {
              id: "call_fs_1",
              type: "function",
              function: { name: "file_search", arguments: JSON.stringify({ query: "user_a" }) },
            },
          ],
        },
        { role: "tool", content: "none" },
        {
          role: "assistant",
          tool_calls: [
            {
              id: "call_fs_2",
              type: "function",
              function: { name: "file_search", arguments: JSON.stringify({ query: "user_b" }) },
            },
          ],
        },
        { role: "tool", content: "none" },
        {
          role: "assistant",
          tool_calls: [
            {
              id: "call_fs_3",
              type: "function",
              function: { name: "file_search", arguments: JSON.stringify({ query: "user_c" }) },
            },
          ],
        },
      ];

      const detected = detectToolCallLoopInMessages(messages, 3);
      assert.equal(detected.isLoop, false);
    });

    it("detects loop for read_file when path is identical even if explanation changes", () => {
      const messages = [
        {
          role: "assistant",
          tool_calls: [
            {
              id: "call_rf_1",
              type: "function",
              function: {
                name: "read_file",
                arguments: JSON.stringify({ path: "src/main.ts", explanation: "Inspect entry point" }),
              },
            },
          ],
        },
        { role: "tool", content: "file content" },
        {
          role: "assistant",
          tool_calls: [
            {
              id: "call_rf_2",
              type: "function",
              function: {
                name: "read_file",
                arguments: JSON.stringify({ path: "src/main.ts", explanation: "Re-read entry point" }),
              },
            },
          ],
        },
        { role: "tool", content: "file content" },
        {
          role: "assistant",
          tool_calls: [
            {
              id: "call_rf_3",
              type: "function",
              function: {
                name: "read_file",
                arguments: JSON.stringify({ path: "src/main.ts", explanation: "Check entry point again" }),
              },
            },
          ],
        },
      ];

      const detected = detectToolCallLoopInMessages(messages, 3);
      assert.equal(detected.isLoop, true);
      assert.equal(detected.count, 3);
      assert.equal(detected.toolName, "read_file");
    });
  });

  describe("In-Memory Consecutive Tool Call Loop Tracking", () => {
    it("halts when same tool call is repeated across turns even when outputTokens > 0", () => {
      const sig = computeLoopSignature("kiro", "gemini", 10, "prompt");
      const toolCall = [{ name: "readFile", arguments: { path: "test.txt" } }];

      recordLoopTurnResult(sig, 50, toolCall);
      assert.equal(checkLoopGuard(sig, { enabled: true, maxConsecutiveEmpty: 3, maxConsecutiveToolCalls: 3 }).shouldHalt, false);

      recordLoopTurnResult(sig, 55, toolCall);
      assert.equal(checkLoopGuard(sig, { enabled: true, maxConsecutiveEmpty: 3, maxConsecutiveToolCalls: 3 }).shouldHalt, false);

      recordLoopTurnResult(sig, 52, toolCall);
      const check3 = checkLoopGuard(sig, { enabled: true, maxConsecutiveEmpty: 3, maxConsecutiveToolCalls: 3 });
      assert.equal(check3.shouldHalt, true);
      assert.equal(check3.reason, "tool_loop");
      assert.equal(check3.count, 3);
    });

    it("resets in-memory tool loop counter when tool name or arguments change", () => {
      const sig = computeLoopSignature("kiro", "gemini", 10, "prompt");

      recordLoopTurnResult(sig, 50, [{ name: "readFile", arguments: { path: "test.txt" } }]);
      recordLoopTurnResult(sig, 50, [{ name: "readFile", arguments: { path: "test.txt" } }]);

      // 3rd turn calls a different file
      recordLoopTurnResult(sig, 50, [{ name: "readFile", arguments: { path: "other.txt" } }]);
      const check = checkLoopGuard(sig, { enabled: true, maxConsecutiveEmpty: 3, maxConsecutiveToolCalls: 3 });
      assert.equal(check.shouldHalt, false);
      assert.equal(check.count, 1);
    });

    it("resets in-memory tool loop counter when model outputs normal text without tools", () => {
      const sig = computeLoopSignature("kiro", "gemini", 10, "prompt");

      recordLoopTurnResult(sig, 50, [{ name: "readFile", arguments: { path: "test.txt" } }]);
      recordLoopTurnResult(sig, 50, [{ name: "readFile", arguments: { path: "test.txt" } }]);

      // Model returns normal text answer
      recordLoopTurnResult(sig, 120);
      const check = checkLoopGuard(sig, { enabled: true, maxConsecutiveEmpty: 3, maxConsecutiveToolCalls: 3 });
      assert.equal(check.shouldHalt, false);
      assert.equal(check.count, 0);
    });

    it("tracks tool loops across turns even if messagesCount increases", () => {
      const sig1 = computeLoopSignature("kiro", "gemini", 10, "prompt");
      const sig2 = computeLoopSignature("kiro", "gemini", 12, "tool result prompt");
      const sig3 = computeLoopSignature("kiro", "gemini", 14, "second tool result");
      const toolCall = [{ name: "file_search", arguments: { query: "index" } }];

      recordLoopTurnResult(sig1, 40, toolCall);
      recordLoopTurnResult(sig2, 42, toolCall);
      recordLoopTurnResult(sig3, 41, toolCall);

      // Next turn with messagesCount 16
      const sig4 = computeLoopSignature("kiro", "gemini", 16, "third tool result");
      const check = checkLoopGuard(sig4, { enabled: true, maxConsecutiveEmpty: 3, maxConsecutiveToolCalls: 3 });
      assert.equal(check.shouldHalt, true);
      assert.equal(check.reason, "tool_loop");
      assert.equal(check.count, 3);
    });

    it("tracks in-memory file_search tool loops across turns when explanation changes but query is identical", () => {
      const sig1 = computeLoopSignature("kiro", "gemini", 10, "prompt 1");
      const sig2 = computeLoopSignature("kiro", "gemini", 12, "prompt 2");
      const sig3 = computeLoopSignature("kiro", "gemini", 14, "prompt 3");

      recordLoopTurnResult(sig1, 30, [{ name: "file_search", arguments: { query: "search_target", explanation: "First try" } }]);
      recordLoopTurnResult(sig2, 35, [{ name: "file_search", arguments: { query: "search_target", explanation: "Second try" } }]);
      recordLoopTurnResult(sig3, 32, [{ name: "file_search", arguments: { query: "search_target", explanation: "Third try" } }]);

      const sig4 = computeLoopSignature("kiro", "gemini", 16, "prompt 4");
      const check = checkLoopGuard(sig4, { enabled: true, maxConsecutiveEmpty: 3, maxConsecutiveToolCalls: 3 });
      assert.equal(check.shouldHalt, true);
      assert.equal(check.reason, "tool_loop");
      assert.equal(check.count, 3);
    });

    it("tracks in-memory meta-tool loops across turns regardless of description changes", () => {
      const sig1 = computeLoopSignature("kiro", "gemini", 10, "prompt 1");
      const sig2 = computeLoopSignature("kiro", "gemini", 12, "prompt 2");
      const sig3 = computeLoopSignature("kiro", "gemini", 14, "prompt 3");

      recordLoopTurnResult(sig1, 20, [{ name: "update_session_information", arguments: { description: "state A" } }]);
      recordLoopTurnResult(sig2, 25, [{ name: "update_session_information", arguments: { description: "state B" } }]);
      recordLoopTurnResult(sig3, 22, [{ name: "update_session_information", arguments: { description: "state C" } }]);

      const sig4 = computeLoopSignature("kiro", "gemini", 16, "prompt 4");
      const check = checkLoopGuard(sig4, { enabled: true, maxConsecutiveEmpty: 3, maxConsecutiveToolCalls: 3 });
      assert.equal(check.shouldHalt, true);
      assert.equal(check.reason, "tool_loop");
      assert.equal(check.count, 3);
    });
  });
});
