import test from "node:test";
import assert from "node:assert/strict";
import {
  initConsoleLogCapture,
  getConsoleLogs,
  clearConsoleLogs,
  getConsoleEmitter,
  stripAnsi,
} from "../src/server/utils/consoleLogBuffer.js";

test("consoleLogBuffer - stripAnsi removes escape codes", () => {
  const colored = "\x1b[32mSuccess\x1b[0m with \x1b[1;31mError\x1b[0m";
  assert.equal(stripAnsi(colored), "Success with Error");
});

test("consoleLogBuffer - captures logs and preserves circular buffer cap", async () => {
  initConsoleLogCapture();
  clearConsoleLogs();

  assert.equal(getConsoleLogs().length, 0);

  console.log("Test log 1");
  console.info("Test info 2");
  console.warn("Test warn 3");
  console.error("Test error 4");

  const logs = getConsoleLogs();
  assert.ok(logs.some((l) => l.includes("Test log 1")));
  assert.ok(logs.some((l) => l.includes("Test info 2")));
  assert.ok(logs.some((l) => l.includes("Test warn 3")));
  assert.ok(logs.some((l) => l.includes("Test error 4")));

  // Test circular buffer cap at 300
  for (let i = 0; i < 350; i++) {
    console.log(`Flood line ${i}`);
  }

  const cappedLogs = getConsoleLogs();
  assert.equal(cappedLogs.length, 300);
  assert.ok(cappedLogs[cappedLogs.length - 1].includes("Flood line 349"));
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

  const lines = await linesPromise;
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
  await clearPromise;

  assert.equal(cleared, true);
  assert.equal(getConsoleLogs().length, 0);
});
