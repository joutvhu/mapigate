process.env.NODE_ENV = "test";

import test from "node:test";
import assert from "node:assert/strict";
import {
  Logger,
  LogLevel,
  formatTime,
  maskKey,
  sanitizeMetadata,
  tagForSession,
  nextTag,
  formatDoneLine,
  REQ_TAGS,
  LogSymbol,
} from "../src/shared/logger.js";
import { requestLogger } from "../src/server/middlewares/requestLogger.js";
import { getConsoleLogs, initConsoleLogCapture } from "../src/server/utils/consoleLogBuffer.js";

test("Logger - log level filtering suppresses lower severity logs", () => {
  const logger = new Logger();
  const captured: string[] = [];
  const originalLog = console.log;
  const originalWarn = console.warn;
  const originalError = console.error;

  console.log = (msg?: any, ...args: any[]) => captured.push([msg, ...args].join(" "));
  console.warn = (msg?: any, ...args: any[]) => captured.push([msg, ...args].join(" "));
  console.error = (msg?: any, ...args: any[]) => captured.push([msg, ...args].join(" "));

  try {
    // 1. INFO level (default)
    logger.setLevel(LogLevel.INFO);
    logger.debug("TEST", "Debug message should be suppressed");
    assert.equal(captured.length, 0, "DEBUG should not be output when level is INFO");

    logger.info("TEST", "Info message should appear");
    assert.equal(captured.length, 1);
    assert.ok(captured[0].includes("Info message should appear"));

    // 2. WARN level
    logger.setLevel(LogLevel.WARN);
    logger.info("TEST", "Info message should now be suppressed");
    assert.equal(captured.length, 1, "INFO should be suppressed when level is WARN");

    logger.warn("TEST", "Warning message should appear");
    assert.equal(captured.length, 2);
    assert.ok(captured[1].includes("Warning message should appear"));

    // 3. ERROR level
    logger.setLevel(LogLevel.ERROR);
    logger.warn("TEST", "Warn should now be suppressed");
    assert.equal(captured.length, 2);

    logger.error("TEST", "Error message should appear");
    assert.equal(captured.length, 3);
    assert.ok(captured[2].includes("Error message should appear"));

    // 4. errorLine is ALWAYS printed regardless of log level
    logger.errorLine("🔴", LogSymbol.ERROR, "Critical error line");
    assert.equal(captured.length, 4);
    assert.ok(captured[3].includes("Critical error line"));
  } finally {
    console.log = originalLog;
    console.warn = originalWarn;
    console.error = originalError;
  }
});

test("Logger - formatTime outputs valid 24-hour timestamp", () => {
  const time = formatTime();
  assert.match(time, /^\d{2}:\d{2}:\d{2}$/, "formatTime must return HH:MM:SS format");
});

test("Logger - tagForSession returns consistent tag for identical seeds", () => {
  const seedA = "req_12345678";
  const seedB = "req_87654321";

  const tag1 = tagForSession(seedA);
  const tag2 = tagForSession(seedA);
  assert.equal(tag1, tag2, "Same seed must always yield the same tag");
  assert.ok(REQ_TAGS.includes(tag1 as any), "Tag must be in REQ_TAGS");

  const tagB = tagForSession(seedB);
  assert.ok(REQ_TAGS.includes(tagB as any));

  // Empty seed uses nextTag fallback without crashing
  const fallback = tagForSession("");
  assert.ok(REQ_TAGS.includes(fallback as any));
});

test("Logger - nextTag rotates through available tags", () => {
  const seen = new Set<string>();
  for (let i = 0; i < REQ_TAGS.length * 2; i++) {
    seen.add(nextTag());
  }
  assert.equal(seen.size, REQ_TAGS.length, "nextTag should cover all tags");
});

test("Logger - maskKey secures sensitive credentials", () => {
  assert.equal(maskKey(""), "***");
  assert.equal(maskKey(null), "***");
  assert.equal(maskKey(undefined), "***");
  assert.equal(maskKey("short"), "***");
  assert.equal(maskKey("12345678"), "***");

  // Medium key (9-16 chars)
  assert.equal(maskKey("1234567890"), "123...890");

  // Long API key (Anthropic/OpenAI)
  const longKey = "sk-ant-api03-1234567890abcdef";
  const masked = maskKey(longKey);
  assert.equal(masked, "sk-a...cdef");
  assert.ok(!masked.includes("1234567890"));
});

test("Logger - sanitizeMetadata redacts sensitive headers and fields recursively", () => {
  const input = {
    model: "claude-3-5-sonnet",
    messages: [{ role: "user", content: "hello" }],
    authorization: "Bearer sk-ant-api03-abcdef123456789",
    headers: {
      "x-api-key": "secret-key-1234567890",
      "user-agent": "Claude-Code/1.0",
      cookie: "session_token=xyz987654321",
    },
    nested: {
      password: "SuperSecretPassword123",
      apiKey: "sk-openai-key-9876543210",
      normalField: "public-value",
    },
  };

  const sanitized = sanitizeMetadata(input);

  assert.equal(sanitized.model, "claude-3-5-sonnet");
  assert.equal(sanitized.nested.normalField, "public-value");
  assert.ok(sanitized.authorization.includes("Bearer"));
  assert.ok(!sanitized.authorization.includes("abcdef123456789"));
  assert.ok(!sanitized.headers["x-api-key"].includes("1234567890"));
  assert.ok(!sanitized.nested.password.includes("SuperSecretPassword123"));
  assert.ok(!sanitized.nested.apiKey.includes("9876543210"));
});

test("Logger - sanitizeMetadata handles circular references defensively (fail-open)", () => {
  const circular: any = { name: "test" };
  circular.self = circular;

  const result = sanitizeMetadata(circular);
  assert.equal(result.name, "test");
  assert.equal(result.self, "[Circular]");
});

test("Logger - formatDoneLine produces structured summary matching 9router standard", () => {
  const summary = formatDoneLine({
    durationMs: 420,
    ttftMs: 150,
    promptTokens: 1200,
    completionTokens: 350,
    cachedTokens: 800,
    cacheCreationTokens: 200,
    tokensSaved: 180,
    cost: 0.0042,
  });

  assert.ok(summary.includes("DONE 420ms"));
  assert.ok(summary.includes("TTFT 150ms"));
  assert.ok(summary.includes("IN 1200 (CACHE ↻800 +200)"));
  assert.ok(summary.includes("OUT 350"));
  assert.ok(summary.includes("SAVED 180"));
  assert.ok(summary.includes("$0.0042"));
});

test("RequestLogger middleware - tags request and tracks completion", () => {
  const req: any = {
    method: "POST",
    path: "/v1/messages",
    headers: {
      "user-agent": "Claude-Code/1.0.0",
    },
    body: {
      model: "claude-3-5-sonnet",
    },
  };

  const finishListeners: Array<() => void> = [];
  const res: any = {
    statusCode: 200,
    on: (event: string, cb: () => void) => {
      if (event === "finish") finishListeners.push(cb);
    },
  };

  let nextCalled = false;
  requestLogger(req, res, () => {
    nextCalled = true;
  });

  assert.ok(nextCalled, "next() must be called");
  assert.ok(req.reqId, "reqId should be assigned");
  assert.ok(req.reqTag, "reqTag should be assigned");
  assert.ok(REQ_TAGS.includes(req.reqTag as any));

  // Trigger response finish
  for (const listener of finishListeners) {
    listener();
  }
});

test("Integration - Logger output is captured by consoleLogBuffer", () => {
  initConsoleLogCapture();
  const logger = new Logger();
  const testMarker = `LOGGER_TEST_PROBE_${Date.now()}`;
  logger.info("TEST_INTEGRATION", testMarker);

  const logs = getConsoleLogs();
  assert.ok(
    logs.some((l) => l.includes(testMarker)),
    "Logs emitted by logger must appear in consoleLogBuffer for Web Dashboard streaming"
  );
});
