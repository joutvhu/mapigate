process.env.NODE_ENV = "test";

import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import app from "../src/server/index.js";

test("Integration - /api/console-logs REST and SSE streaming", async () => {
  // Start server on an ephemeral port
  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", () => resolve()));
  const address = server.address() as { port: number };
  const baseUrl = `http://127.0.0.1:${address.port}`;

  try {
    // 1. Test GET /api/console-logs
    const getRes = await fetch(`${baseUrl}/api/console-logs`);
    assert.equal(getRes.status, 200);
    const getData = (await getRes.json()) as { success: boolean; logs: string[] };
    assert.equal(getData.success, true);
    assert.ok(Array.isArray(getData.logs));

    // 2. Test GET /api/console-logs/stream (SSE)
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
    let receivedLines = false;
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
            } else if (parsed.type === "lines") {
              receivedLines = true;
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

    // 3. Emit a new console log to trigger SSE lines event
    console.log("Integration test message stream probe " + Date.now());
    await new Promise((r) => setTimeout(r, 250));
    assert.equal(receivedLines, true, "Should receive SSE lines event");

    // 4. Test DELETE /api/console-logs
    const delRes = await fetch(`${baseUrl}/api/console-logs`, { method: "DELETE" });
    assert.equal(delRes.status, 200);
    const delData = (await delRes.json()) as { success: boolean };
    assert.equal(delData.success, true);

    await new Promise((r) => setTimeout(r, 150));
    assert.equal(receivedClear, true, "Should receive SSE clear event");

    // Abort SSE client
    controller.abort();
    await streamPromise;
  } finally {
    server.close();
  }
});
