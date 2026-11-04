import test from "node:test";
import assert from "node:assert/strict";
import {
  initConsoleLogCapture,
  getConsoleLogs,
  getStructuredLogs,
  appendStructuredLog,
  clearConsoleLogs,
  getConsoleEmitter,
  stripAnsi,
  maskSecretsInText,
  parseRawLineToStructured,
} from "../src/server/utils/consoleLogBuffer.js";
import {
  createStreamTrackingState,
  recordStreamToolCall,
} from "../src/server/proxy/streaming/streamState.js";

test("consoleLogBuffer - stripAnsi removes escape codes", () => {
  const colored = "\x1b[32mSuccess\x1b[0m with \x1b[1;31mError\x1b[0m";
  assert.equal(stripAnsi(colored), "Success with Error");
});

test("consoleLogBuffer - maskSecretsInText redacts sk- keys and Bearer tokens", () => {
  const line1 = "Using key sk-ant-api03-12345678abcdef for upstream";
  const masked1 = maskSecretsInText(line1);
  assert.ok(!masked1.includes("12345678abcdef"));
  assert.ok(masked1.includes("sk-a...cdef"));

  const line2 = "Authorization: Bearer secret-oauth-token-12345678";
  const masked2 = maskSecretsInText(line2);
  assert.ok(!masked2.includes("secret-oauth-token-12345678"));
  assert.ok(masked2.startsWith("Authorization: Bearer "));

  const line3 = '{"password":"superSecretPassword123","username":"admin"}';
  const masked3 = maskSecretsInText(line3);
  assert.ok(!masked3.includes("superSecretPassword123"));
});

test("consoleLogBuffer - parseRawLineToStructured extracts levels, tags, and categories", () => {
  // Proxy category and tag
  const line1 = "[14:20:30] 🟢 📥 POST /v1/messages · client: claude-code · model: claude-3-7-sonnet";
  const parsed1 = parseRawLineToStructured(line1);
  assert.equal(parsed1.category, "proxy");
  assert.equal(parsed1.reqTag, "🟢");
  assert.equal(parsed1.level, "info");

  // Error level
  const line2 = "[14:20:31] 🔴 ❌ Upstream call failed with 500 ERROR: Overloaded";
  const parsed2 = parseRawLineToStructured(line2);
  assert.equal(parsed2.level, "error");
  assert.equal(parsed2.category, "proxy");

  // Scheduler category
  const line3 = "[14:21:00] [SCHEDULER] Periodic tick executed";
  const parsed3 = parseRawLineToStructured(line3);
  assert.equal(parsed3.category, "scheduler");

  // MITM category
  const line4 = "[MITM] Intercepting request for api.anthropic.com";
  const parsed4 = parseRawLineToStructured(line4);
  assert.equal(parsed4.category, "mitm");
});

test("consoleLogBuffer - captures logs and preserves circular buffer cap at 500", async () => {
  initConsoleLogCapture();
  clearConsoleLogs();

  assert.equal(getConsoleLogs().length, 0);
  assert.equal(getStructuredLogs().length, 0);

  console.log("Test log 1");
  console.info("Test info 2");
  console.warn("Test warn 3");
  console.error("Test error 4");

  const logs = getConsoleLogs();
  assert.ok(logs.some((l) => l.includes("Test log 1")));
  assert.ok(logs.some((l) => l.includes("Test info 2")));
  assert.ok(logs.some((l) => l.includes("Test warn 3")));
  assert.ok(logs.some((l) => l.includes("Test error 4")));

  const structured = getStructuredLogs();
  assert.equal(structured.length, 4);
  assert.ok(structured.some((s) => s.message.includes("Test log 1")));

  // Test circular buffer cap at 500
  for (let i = 0; i < 550; i++) {
    console.log(`Flood line ${i}`);
  }

  const cappedLogs = getConsoleLogs();
  assert.equal(cappedLogs.length, 500);
  assert.ok(cappedLogs[cappedLogs.length - 1].includes("Flood line 549"));

  const cappedStructured = getStructuredLogs();
  assert.equal(cappedStructured.length, 500);
  assert.ok(cappedStructured[cappedStructured.length - 1].message.includes("Flood line 549"));
});

test("consoleLogBuffer - appendStructuredLog adds and enriches structured entries", () => {
  clearConsoleLogs();

  appendStructuredLog({
    id: "req-123",
    timestamp: Date.now(),
    level: "info",
    category: "proxy",
    message: "Proxy request completed",
    requestId: "req-123",
    reqTag: "🟢",
    gateway: {
      clientTool: "claude-code",
      requestedModel: "claude-3-7-sonnet",
      actualModel: "claude-3-7-sonnet-20250219",
      providerId: "anthropic",
      statusCode: 200,
      durationMs: 450,
      ttftMs: 120,
      tokens: {
        prompt: 1500,
        completion: 350,
        cached: 800,
        savedByRtk: 120,
      },
      cost: 0.005,
    },
    rawText: "anthropic/claude-3-7-sonnet · DONE 450ms · TTFT 120ms · IN 1500",
  });

  const structured = getStructuredLogs();
  assert.equal(structured.length, 1);
  assert.equal(structured[0].gateway?.clientTool, "claude-code");
  assert.equal(structured[0].gateway?.tokens?.cached, 800);
  assert.equal(structured[0].gateway?.cost, 0.005);
});

test("consoleLogBuffer - deduplication mutates pendingStructured in-place for real-time SSE", async () => {
  initConsoleLogCapture();
  clearConsoleLogs();

  const emitter = getConsoleEmitter();

  let emittedStructured: any[] = [];
  emitter.once("structured", (items: any[]) => {
    emittedStructured = items;
  });

  // 1. Simulate logger.line printing a completion line
  console.log("🟢 📥 anthropic/claude-3-7-sonnet · DONE 450ms · TTFT 120ms · IN 1500 · OUT 350");

  // At this moment, state has a parsed un-enriched entry in structuredLogs and pendingStructured
  const unEnriched = getStructuredLogs();
  assert.equal(unEnriched.length, 1);
  assert.equal(unEnriched[0].gateway, undefined);

  // 2. Immediately call appendStructuredLog with enriched gateway metadata and matching reqTag
  appendStructuredLog({
    id: "req-enrich-test",
    timestamp: Date.now(),
    level: "info",
    category: "proxy",
    message: "anthropic/claude-3-7-sonnet · DONE 450ms · TTFT 120ms · IN 1500 · OUT 350",
    reqTag: "🟢",
    gateway: {
      clientTool: "claude-code",
      requestedModel: "claude-3-7-sonnet",
      statusCode: 200,
      durationMs: 450,
      tokens: { prompt: 1500, completion: 350 },
    },
  });

  // Verify that structuredLogs length did not duplicate
  const enriched = getStructuredLogs();
  assert.equal(enriched.length, 1);
  assert.equal(enriched[0].gateway?.clientTool, "claude-code");
  assert.equal(enriched[0].gateway?.tokens?.prompt, 1500);

  // Wait for batch flush
  await new Promise((resolve) => setTimeout(resolve, 150));

  // The emitted structured logs via SSE must contain the enriched gateway metadata!
  assert.equal(emittedStructured.length, 1);
  assert.equal(emittedStructured[0].gateway?.clientTool, "claude-code");
  assert.equal(emittedStructured[0].gateway?.tokens?.prompt, 1500);
});

test("consoleLogBuffer - emits batched lines event and clear event", async () => {
  initConsoleLogCapture();
  clearConsoleLogs();

  const emitter = getConsoleEmitter();

  let receivedBatch: string[] = [];
  const linesPromise = new Promise<string[]>((resolve) => {
    emitter.once("lines", (lines: string[]) => {
      receivedBatch = lines;
      resolve(lines);
    });
  });

  console.log("Batch message 1");
  console.log("Batch message 2");

  // Wait for batch flush timer to trigger and resolve
  const lines = await Promise.race([
    linesPromise,
    new Promise<string[]>((_, reject) =>
      setTimeout(() => reject(new Error("Timeout waiting for lines event")), 1000)
    ),
  ]);
  assert.ok(lines.length >= 2);
  assert.ok(receivedBatch.some((l) => l.includes("Batch message 1")));
  assert.ok(receivedBatch.some((l) => l.includes("Batch message 2")));

  // Test clear event
  let cleared = false;
  const clearPromise = new Promise<void>((resolve) => {
    emitter.once("clear", () => {
      cleared = true;
      resolve();
    });
  });

  clearConsoleLogs();
  await Promise.race([
    clearPromise,
    new Promise<void>((_, reject) =>
      setTimeout(() => reject(new Error("Timeout waiting for clear event")), 1000)
    ),
  ]);

  assert.equal(cleared, true);
  assert.equal(getConsoleLogs().length, 0);
  assert.equal(getStructuredLogs().length, 0);
});

test("streamState - recordStreamToolCall deduplicates repetitive streaming tool call chunks", () => {
  const state = createStreamTrackingState();
  const loggedNames: string[] = [];
  const onLog = (name: string) => loggedNames.push(name);

  // Chunk 1: OpenAI tool call start with function name and id
  const chunk1 = {
    choices: [
      {
        delta: {
          tool_calls: [
            {
              index: 0,
              id: "call_abc123",
              function: { name: "read_file", arguments: '{"path":' },
            },
          ],
        },
      },
    ],
  };
  recordStreamToolCall(chunk1, state, onLog);

  // Chunk 2: Upstream repeats function name in next delta chunk with more arguments
  const chunk2 = {
    choices: [
      {
        delta: {
          tool_calls: [
            {
              index: 0,
              id: "call_abc123",
              function: { name: "read_file", arguments: ' "file.txt"}' },
            },
          ],
        },
      },
    ],
  };
  recordStreamToolCall(chunk2, state, onLog);

  // Chunk 3: Second tool call with index 1
  const chunk3 = {
    choices: [
      {
        delta: {
          tool_calls: [
            {
              index: 1,
              id: "call_def456",
              function: { name: "execute_command", arguments: '{"cmd":"ls"}' },
            },
          ],
        },
      },
    ],
  };
  recordStreamToolCall(chunk3, state, onLog);

  // Must only record 2 tool calls total, not 3
  assert.equal(state.tools.length, 2);
  assert.equal(state.tools[0].name, "read_file");
  assert.equal(state.tools[1].name, "execute_command");
  assert.equal(loggedNames.length, 2);
  assert.deepEqual(loggedNames, ["read_file", "execute_command"]);

  // Also test Anthropic format deduplication with same block index
  const anthropicChunk1 = {
    type: "content_block_start",
    index: 2,
    content_block: { type: "tool_use", name: "grep_search" },
  };
  recordStreamToolCall(anthropicChunk1, state, onLog);
  recordStreamToolCall(anthropicChunk1, state, onLog); // duplicate

  assert.equal(state.tools.length, 3);
  assert.equal(state.tools[2].name, "grep_search");
  assert.equal(loggedNames.length, 3);
});
