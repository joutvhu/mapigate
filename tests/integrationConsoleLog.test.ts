process.env.NODE_ENV = "test";

import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import app from "../src/server/index.js";
import { appendStructuredLog } from "../src/server/utils/consoleLogBuffer.js";
import type { StructuredLogEntry } from "../src/shared/types/logging.js";

test("Integration - /api/console-logs REST and SSE streaming with structured logs", async () => {
  // Start server on an ephemeral port
  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", () => resolve()));
  const address = server.address() as { port: number };
  const baseUrl = `http://127.0.0.1:${address.port}`;

  try {
    // 1. Seed structured log
    appendStructuredLog({
      id: "test-init-log",
      timestamp: Date.now(),
      level: "info",
      category: "proxy",
      message: "Initial proxy log for integration test",
      requestId: "test-init-log",
      reqTag: "🟢",
      gateway: {
        clientTool: "claude-code",
        requestedModel: "claude-3-7-sonnet",
        actualModel: "claude-3-7-sonnet-20250219",
        providerId: "anthropic",
        statusCode: 200,
        durationMs: 320,
        tokens: {
          prompt: 1000,
          completion: 200,
          cached: 500,
          savedByRtk: 80,
        },
        cost: 0.003,
      },
      rawText: "anthropic/claude-3-7-sonnet · DONE 320ms · IN 1000 · OUT 200",
    });

    // 2. Test GET /api/console-logs
    const getRes = await fetch(`${baseUrl}/api/console-logs`);
    assert.equal(getRes.status, 200);
    const getData = (await getRes.json()) as {
      success: boolean;
      logs: string[];
      structuredLogs: StructuredLogEntry[];
    };
    assert.equal(getData.success, true);
    assert.ok(Array.isArray(getData.logs));
    assert.ok(Array.isArray(getData.structuredLogs));
    assert.ok(getData.structuredLogs.length > 0);
    assert.ok(getData.structuredLogs.some((s) => s.id === "test-init-log"));

    // 3. Test GET /api/console-logs/stream (SSE)
    const controller = new AbortController();
    const sseRes = await fetch(`${baseUrl}/api/console-logs/stream`, {
      signal: controller.signal,
      headers: { Accept: "text/event-stream" },
    });

    assert.equal(sseRes.status, 200);
    assert.ok(sseRes.headers.get("content-type")?.includes("text/event-stream"));

    const reader = sseRes.body?.getReader();
    assert.ok(reader);

    const decoder = new TextDecoder();
    let receivedInit = false;
    let receivedStructuredInInit = false;
    let receivedLines = false;
    let receivedStructuredInLines = false;
    let receivedClear = false;

    // Background reader loop
    const readStream = async () => {
      let buffer = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const parts = buffer.split("\n\n");
        buffer = parts.pop() || "";

        for (const part of parts) {
          if (!part.startsWith("data:")) continue;
          const payload = part.replace(/^data:\s*/, "").trim();
          try {
            const parsed = JSON.parse(payload);
            if (parsed.type === "init") {
              receivedInit = true;
              if (Array.isArray(parsed.structured) && parsed.structured.length > 0) {
                receivedStructuredInInit = true;
              }
            } else if (parsed.type === "lines") {
              receivedLines = true;
              if (Array.isArray(parsed.structured) && parsed.structured.length > 0) {
                receivedStructuredInLines = true;
              }
            } else if (parsed.type === "clear") {
              receivedClear = true;
            }
          } catch {}
        }
      }
    };

    const streamPromise = readStream().catch(() => {});

    // Wait briefly for init event
    await new Promise((r) => setTimeout(r, 200));
    assert.equal(receivedInit, true, "Should receive SSE init event");
    assert.equal(receivedStructuredInInit, true, "Should receive structured logs in init event");

    // 4. Emit a new console log to trigger SSE lines event
    console.log("Integration test message stream probe " + Date.now());
    await new Promise((r) => setTimeout(r, 250));
    assert.equal(receivedLines, true, "Should receive SSE lines event");
    assert.equal(receivedStructuredInLines, true, "Should receive structured logs in lines event");

    // 5. Test DELETE /api/console-logs
    const delRes = await fetch(`${baseUrl}/api/console-logs`, { method: "DELETE" });
    assert.equal(delRes.status, 200);
    const delData = (await delRes.json()) as { success: boolean };
    assert.equal(delData.success, true);

    await new Promise((r) => setTimeout(r, 150));
    assert.equal(receivedClear, true, "Should receive SSE clear event");

    // Check GET returns empty after clear
    const getCleared = await fetch(`${baseUrl}/api/console-logs`);
    const clearedData = await getCleared.json();
    assert.equal(clearedData.logs.length, 0);
    assert.equal(clearedData.structuredLogs.length, 0);

    // Abort SSE client
    controller.abort();
    await streamPromise;
  } finally {
    server.close();
  }
});
