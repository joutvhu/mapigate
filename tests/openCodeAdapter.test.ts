import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  generateSessionId,
  generateRequestId,
  translateSessionId,
  getStableSessionId,
  deriveRequestId,
  applyFingerprintTools,
  restoreToolNames,
  isResponsesModel,
  isMessagesModel,
  buildOpenCodeUrl,
  buildOpenCodeHeaders,
  OPENCODE_SESSION_RE,
  OPENCODE_REQUEST_RE,
  OPENCODE_FINGERPRINT_TOOLS,
} from "../src/core/adapters/openCodeAdapter.js";

describe("OpenCode Adapter - Session and Request IDs", () => {
  test("generates valid session ID matching upstream regex", () => {
    const id = generateSessionId();
    assert.match(id, OPENCODE_SESSION_RE);
  });

  test("generates valid request ID matching upstream regex", () => {
    const id = generateRequestId();
    assert.match(id, OPENCODE_REQUEST_RE);
  });

  test("translates arbitrary string into valid canonical session ID", () => {
    const translated = translateSessionId("client-session-12345", "claude");
    assert.match(translated, OPENCODE_SESSION_RE);
  });

  test("preserves already canonical session ID on translation", () => {
    const canonical = generateSessionId();
    const translated = translateSessionId(canonical);
    assert.equal(translated, canonical);
  });

  test("caches stable session ID per client identity", () => {
    const id1 = getStableSessionId("account_test_1");
    const id2 = getStableSessionId("account_test_1");
    const idDiff = getStableSessionId("account_test_2");

    assert.equal(id1, id2);
    assert.match(id1, OPENCODE_SESSION_RE);
    assert.notEqual(id1, idDiff);
  });

  test("deriveRequestId produces deterministic ID for identical session and message", () => {
    const session = generateSessionId();
    const body = {
      messages: [{ role: "user", content: "Write a quick test" }],
    };
    const reqId1 = deriveRequestId(session, body);
    const reqId2 = deriveRequestId(session, body);

    assert.equal(reqId1, reqId2);
    assert.match(reqId1, OPENCODE_REQUEST_RE);
  });
});

describe("OpenCode Adapter - Fingerprint Tool Quartet Injection and Restoration", () => {
  test("appends missing fingerprint tools (read, shell) to empty tools array", () => {
    const body: any = { tools: [] };
    const map = applyFingerprintTools(body);

    assert.equal(body.tools.length, 2);
    const names = body.tools.map((t: any) => t.function?.name);
    for (const expected of OPENCODE_FINGERPRINT_TOOLS) {
      assert.ok(names.includes(expected));
    }
    assert.equal(map.size, 0);
  });

  test("canonicalizes case variants of quartet tools and records mapping", () => {
    const body: any = {
      tools: [
        { type: "function", function: { name: "Read", description: "Read file" } },
        { type: "function", function: { name: "CustomTool", description: "Other" } },
      ],
      tool_choice: { type: "function", function: { name: "Read" } },
    };

    const map = applyFingerprintTools(body);

    assert.equal(map.get("read"), "Read");
    const readTool = body.tools.find((t: any) => t.function?.name === "read");
    assert.ok(readTool);
    assert.equal(body.tool_choice.function.name, "read");

    // All fingerprint tools must now be present: Read (canonicalized) + CustomTool + shell
    assert.equal(body.tools.length, 3);
  });

  test("appends missing fingerprint quartet with Claude schema when format is claude", () => {
    const body: any = { tools: [] };
    const map = applyFingerprintTools(body, "claude");

    assert.equal(body.tools.length, 2);
    for (const tool of body.tools) {
      assert.ok(tool.name, "Must have tool name");
      assert.ok(tool.input_schema, "Must have Anthropic input_schema");
      assert.equal(tool.type, undefined, "Anthropic tool must not have type: function");
      assert.equal(tool.function, undefined, "Anthropic tool must not be wrapped in function object");
    }
    assert.notEqual(body.tool_choice, "none", "Anthropic request must never have tool_choice: none");
    assert.equal(map.size, 0);
  });

  test("retargets and canonicalizes Claude tools", () => {
    const body: any = {
      tools: [
        { name: "Read", description: "Read file", input_schema: { type: "object", properties: {} } },
      ],
      tool_choice: { type: "tool", name: "Read" },
    };
    const map = applyFingerprintTools(body, "claude");

    assert.equal(map.get("read"), "Read");
    const readTool = body.tools.find((t: any) => t.name === "read");
    assert.ok(readTool);
    assert.equal(body.tool_choice.name, "read");
    assert.equal(body.tools.length, 2); // Read (canonicalized) + shell
  });

  test("restores original tool names in OpenAI chunk delta", () => {
    const map = new Map<string, string>([["bash", "Bash"]]);
    const chunk = {
      choices: [
        {
          delta: {
            tool_calls: [
              {
                id: "call_123",
                type: "function",
                function: { name: "bash", arguments: '{"command":"ls"}' },
              },
            ],
          },
        },
      ],
    };

    restoreToolNames(chunk, map);
    assert.equal(chunk.choices[0].delta.tool_calls[0].function.name, "Bash");
  });

  test("restores original tool names in Anthropic content block", () => {
    const map = new Map<string, string>([["bash", "Bash"]]);
    const payload = {
      type: "content_block_start",
      content_block: {
        type: "tool_use",
        id: "toolu_123",
        name: "bash",
      },
    };

    restoreToolNames(payload, map);
    assert.equal(payload.content_block.name, "Bash");
  });
});

describe("OpenCode Adapter - URL Routing and Header Construction", () => {
  test("routes models correctly to their upstream endpoints", () => {
    assert.equal(buildOpenCodeUrl("union-alpha"), "https://opencode.ai/inference/v1/messages");
    assert.equal(
      buildOpenCodeUrl("muse-spark-1.2-contributor-free"),
      "https://opencode.ai/inference/v1/responses"
    );
    assert.equal(
      buildOpenCodeUrl("muse-spark-1.3-contributor-free"),
      "https://opencode.ai/inference/v1/responses"
    );
    assert.equal(buildOpenCodeUrl("jev-1.13-free"), "https://opencode.ai/inference/v1/chat/completions");
    assert.equal(buildOpenCodeUrl("unknown-model"), "https://opencode.ai/inference/v1/chat/completions");
  });

  test("identifies model families correctly", () => {
    assert.equal(isMessagesModel("union-alpha"), true);
    assert.equal(isMessagesModel("muse-spark-1.2-contributor-free"), false);
    assert.equal(isResponsesModel("muse-spark-1.2-contributor-free"), true);
    assert.equal(isResponsesModel("muse-spark-1.3-contributor-free"), true);
    assert.equal(isResponsesModel("union-alpha"), false);
  });

  test("builds headers with public bearer and OpenCode session/client metadata", () => {
    const headers = buildOpenCodeHeaders(
      { "User-Agent": "Claude-Code/1.0" },
      undefined,
      undefined,
      "https://opencode.ai/inference/v1/messages"
    );

    assert.equal(headers["Authorization"], "Bearer public");
    assert.equal(headers["User-Agent"], "opencode/latest/2.0.26/cli");
    assert.equal(headers["x-opencode-client"], "cli");
    assert.equal(headers["x-opencode-project"], "global");
    assert.match(headers["x-opencode-session"], OPENCODE_SESSION_RE);
    assert.match(headers["x-opencode-session-id"], OPENCODE_SESSION_RE);
    assert.equal(headers["anthropic-version"], "2023-06-01");
  });

  test("preserves downstream User-Agent if already a genuine OpenCode client", () => {
    const headers = buildOpenCodeHeaders({
      "user-agent": "opencode/latest/2.0.29/desktop",
    });

    assert.equal(headers["User-Agent"], "opencode/latest/2.0.29/desktop");
  });
});
