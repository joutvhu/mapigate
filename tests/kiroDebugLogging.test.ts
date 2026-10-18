process.env.NODE_ENV = "test";

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  extractToolResultContent,
  convertUserInputMessage,
  safeArgsString,
} from "../src/mitm/handlers/kiro/converter.js";

describe("Kiro Converter & Debug Enhancements", () => {
  describe("extractToolResultContent", () => {
    it("extracts text from standard array with text block", () => {
      const tr = {
        toolUseId: "call_1",
        content: [{ text: "File content here\nLine 2" }],
      };
      assert.equal(extractToolResultContent(tr), "File content here\nLine 2");
    });

    it("extracts and stringifies JSON content blocks", () => {
      const tr = {
        toolUseId: "call_2",
        content: [{ json: { status: "success", files: ["a.rs", "b.rs"] } }],
      };
      assert.equal(
        extractToolResultContent(tr),
        JSON.stringify({ status: "success", files: ["a.rs", "b.rs"] })
      );
    });

    it("extracts direct string content", () => {
      const tr = {
        toolUseId: "call_3",
        content: "Raw direct string output",
      };
      assert.equal(extractToolResultContent(tr), "Raw direct string output");
    });

    it("extracts array of strings", () => {
      const tr = {
        toolUseId: "call_4",
        content: ["Line 1", "Line 2"],
      };
      assert.equal(extractToolResultContent(tr), "Line 1\nLine 2");
    });

    it("extracts error message when status is error", () => {
      const tr = {
        toolUseId: "call_5",
        status: "error",
        message: "File not found: README.md",
      };
      assert.equal(extractToolResultContent(tr), "Error: File not found: README.md");
    });

    it("returns empty string on empty/null input", () => {
      assert.equal(extractToolResultContent(null), "");
      assert.equal(extractToolResultContent({ content: [] }), "");
      assert.equal(extractToolResultContent({}), "");
    });
  });

  describe("safeArgsString (9router standard)", () => {
    it("returns raw JSON string as-is without re-encoding or mutating", () => {
      const rawJson = '{"file_path":"/workspace/src/index.ts","limit":50}';
      assert.equal(safeArgsString(rawJson), rawJson);
    });

    it("returns empty object string for null and undefined", () => {
      assert.equal(safeArgsString(null), "{}");
      assert.equal(safeArgsString(undefined), "{}");
    });

    it("serializes plain objects to JSON string", () => {
      const obj = { query: "hello", recursive: true };
      assert.equal(safeArgsString(obj), JSON.stringify(obj));
    });

    it("safely handles circular structures without throwing", () => {
      const circular: any = {};
      circular.self = circular;
      assert.equal(safeArgsString(circular), "{}");
    });
  });

  describe("convertUserInputMessage", () => {
    it("converts userInputMessage with diverse tool results", () => {
      const uim = {
        content: "",
        userInputMessageContext: {
          toolResults: [
            {
              toolUseId: "call_text",
              content: [{ text: "hello" }],
            },
            {
              toolUseId: "call_json",
              content: [{ json: { foo: "bar" } }],
            },
            {
              toolUseId: "call_err",
              status: "error",
              message: "Access denied",
            },
          ],
        },
      };

      const out = convertUserInputMessage(uim);
      assert.equal(out.length, 3);
      assert.equal(out[0].role, "tool");
      assert.equal(out[0].tool_call_id, "call_text");
      assert.equal(out[0].content, "hello");

      assert.equal(out[1].role, "tool");
      assert.equal(out[1].tool_call_id, "call_json");
      assert.equal(out[1].content, '{"foo":"bar"}');

      assert.equal(out[2].role, "tool");
      assert.equal(out[2].tool_call_id, "call_err");
      assert.equal(out[2].content, "Error: Access denied");
    });
  });

  describe("requestLogger middleware", () => {
    it("handles complex multi-turn payload with tool calls safely", async () => {
      const { requestLogger } = await import("../src/server/middlewares/requestLogger.js");
      const req: any = {
        path: "/v1/chat/completions",
        method: "POST",
        headers: {
          "user-agent": "aws-sdk-js/1.0.0 ua/2.1 os/win32",
        },
        body: {
          model: "antigravity/gemini-3.8-flash",
          stream: true,
          tools: [{ function: { name: "read_file" } }, { function: { name: "execute_pwsh" } }],
          messages: [
            { role: "system", content: "System rules..." },
            {
              role: "assistant",
              tool_calls: [
                {
                  id: "call_123",
                  type: "function",
                  function: { name: "read_file", arguments: '{"path":"README.md"}' },
                },
              ],
            },
            {
              role: "tool",
              tool_call_id: "call_123",
              content: "",
            },
          ],
        },
      };

      const res: any = {
        on: (_evt: string, _fn: any) => {},
      };

      let nextCalled = false;
      requestLogger(req, res, () => {
        nextCalled = true;
      });

      assert.equal(nextCalled, true);
      assert.ok(req.reqId);
      assert.ok(req.reqTag);
    });
  });
});
