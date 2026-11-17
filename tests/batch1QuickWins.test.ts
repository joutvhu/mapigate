process.env.NODE_ENV = "test";

import test from "node:test";
import assert from "node:assert/strict";
import { TLS_ECDH_CURVE } from "../src/shared/utils/dnsResolver.js";
import { autoDetectFilter } from "../src/core/tokenSaver/methods/rtk/autodetect.js";
import { grep } from "../src/core/tokenSaver/methods/rtk/filters/grep.js";
import { dedupLog } from "../src/core/tokenSaver/methods/rtk/filters/dedupLog.js";
import { DEDUP_LINE_MAX } from "../src/core/tokenSaver/methods/rtk/constants.js";

test("dnsResolver - TLS_ECDH_CURVE defaults to X25519:prime256v1:secp384r1", () => {
  if (!process.env.MAPIGATE_TLS_ECDH_CURVE) {
    assert.equal(TLS_ECDH_CURVE, "X25519:prime256v1:secp384r1");
  }
  assert.ok(TLS_ECDH_CURVE.startsWith("X25519"));
});

test("RTK autodetect - timestamped logs are not misdetected as grep output", () => {
  const timestampedLogs = [
    "2026-11-10 12:30:45 INFO Server started on port 20128",
    "2026-11-10 12:30:46 INFO Connected to SQLite WAL database",
    "2026-11-10 12:30:47 WARN Cache miss for key user:123",
    "2026-11-10 12:30:48 INFO Request completed in 12ms",
    "2026-11-10 12:30:49 INFO Health check OK",
  ].join("\n");

  const detected = autoDetectFilter(timestampedLogs);
  assert.notEqual(detected?.filterName, "grep");
  assert.equal(detected?.filterName, "dedup-log");

  // Direct grep() call must also fail open on timestamped logs
  assert.equal(grep(timestampedLogs), timestampedLogs);
});

test("RTK autodetect - real grep output is detected and compressed, mixed minority fails open", () => {
  const realGrep = [
    "src/core/router.ts:12:export function routeRequest() {",
    "src/core/router.ts:45:  return selectProvider();",
    "src/server/index.ts:88:app.use('/v1', router);",
    "src/shared/logger.ts:5:export const logger = {};",
  ].join("\n");

  const detected = autoDetectFilter(realGrep);
  assert.equal(detected?.filterName, "grep");
  const compressed = grep(realGrep);
  assert.ok(compressed.includes("4 matches in 3F:"));

  // Minority grep lines (< 60%) should not trigger grep filter and grep() should fail open
  const minorityGrep = [
    "src/core/router.ts:12:export function routeRequest() {",
    "plain log line 1",
    "plain log line 2",
    "plain log line 3",
    "plain log line 4",
  ].join("\n");

  assert.notEqual(autoDetectFilter(minorityGrep)?.filterName, "grep");
  assert.equal(grep(minorityGrep), minorityGrep);
});

test("RTK dedupLog - truncation marker reports omitted line count", () => {
  const totalLines = DEDUP_LINE_MAX + 25;
  const lines = Array.from({ length: totalLines }, (_, i) => `unique log line ${i}`);
  const out = dedupLog(lines.join("\n"));

  assert.ok(out.includes(`... (truncated at ${DEDUP_LINE_MAX} lines, 25 lines omitted)`));
});
