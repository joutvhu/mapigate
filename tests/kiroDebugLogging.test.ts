process.env.NODE_ENV = "test";

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  convertUserInputMessage,
  safeArgsString,
} from "../src/mitm/handlers/kiro/converter.js";

describe("Kiro Converter & Debug Enhancements", () => {
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
    it("converts userInputMessage with standard tool results (9router format)", () => {
      const uim = {
        content: "",
        userInputMessageContext: {
          toolResults: [
            {
              toolUseId: "call_text",
              content: [{ text: "hello" }],
            },
            {
              toolUseId: "call_multi",
              content: [{ text: "line 1" }, { text: "line 2" }],
            },
          ],
        },
      };

      const out = convertUserInputMessage(uim);
      assert.equal(out.length, 2);
      assert.equal(out[0].role, "tool");
      assert.equal(out[0].tool_call_id, "call_text");
      assert.equal(out[0].content, "hello");

      assert.equal(out[1].role, "tool");
      assert.equal(out[1].tool_call_id, "call_multi");
      assert.equal(out[1].content, "line 1\nline 2");
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
