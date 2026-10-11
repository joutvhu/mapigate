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
  test("appends missing fingerprint quartet (bash, glob, grep, read) to empty tools array", () => {
    const body: any = { tools: [] };
    const map = applyFingerprintTools(body);

    assert.equal(body.tools.length, 4);
    const names = body.tools.map((t: any) => t.function?.name);
    for (const expected of OPENCODE_FINGERPRINT_TOOLS) {
      assert.ok(names.includes(expected));
    }
    assert.equal(map.size, 0);
  });

  test("canonicalizes case variants of quartet tools and records mapping", () => {
    const body: any = {
      tools: [
        { type: "function", function: { name: "Bash", description: "Run shell command" } },
        { type: "function", function: { name: "CustomTool", description: "Other" } },
      ],
      tool_choice: { type: "function", function: { name: "Bash" } },
    };

    const map = applyFingerprintTools(body);

    assert.equal(map.get("bash"), "Bash");
    const bashTool = body.tools.find((t: any) => t.function?.name === "bash");
    assert.ok(bashTool);
    assert.equal(body.tool_choice.function.name, "bash");

    // All 4 quartet tools must now be present
    assert.equal(body.tools.length, 5); // Bash (canonicalized) + CustomTool + glob + grep + read
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
    assert.equal(buildOpenCodeUrl("union-alpha"), "https://opencode.ai/zen/v1/messages");
    assert.equal(
      buildOpenCodeUrl("muse-spark-1.2-contributor-free"),
      "https://opencode.ai/zen/v1/responses"
    );
    assert.equal(
      buildOpenCodeUrl("muse-spark-1.3-contributor-free"),
      "https://opencode.ai/zen/v1/responses"
    );
    assert.equal(buildOpenCodeUrl("jev-1.13-free"), "https://opencode.ai/zen/v1/chat/completions");
    assert.equal(buildOpenCodeUrl("unknown-model"), "https://opencode.ai/zen/v1/chat/completions");
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
      "https://opencode.ai/zen/v1/messages"
    );

    assert.equal(headers["Authorization"], "Bearer public");
    assert.equal(headers["User-Agent"], "opencode/1.18.31");
    assert.equal(headers["x-opencode-client"], "desktop");
    assert.equal(headers["x-opencode-project"], "global");
    assert.match(headers["x-opencode-session"], OPENCODE_SESSION_RE);
    assert.match(headers["x-opencode-request"], OPENCODE_REQUEST_RE);
    assert.equal(headers["anthropic-version"], "2023-06-01");
  });

  test("preserves downstream User-Agent if already a genuine OpenCode client", () => {
    const headers = buildOpenCodeHeaders({
      "user-agent": "opencode/1.19.0 (darwin; arm64)",
    });

    assert.equal(headers["User-Agent"], "opencode/1.19.0 (darwin; arm64)");
  });
});
