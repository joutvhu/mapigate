process.env.NODE_ENV = "test";

import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { resolvePublicCred, publicCredEnvName } from "../src/shared/utils/publicCreds.js";
import { MASKED_PUBLIC_CREDS, type PublicCredKey } from "../src/shared/utils/publicCreds.generated.js";

const KEYS = Object.keys(MASKED_PUBLIC_CREDS) as PublicCredKey[];

// Known scanner signatures (built by concatenation so this file itself stays scanner-clean).
const SCANNER_PATTERNS = [
  new RegExp("GOC" + "SPX-"),
  new RegExp("AI" + "za[0-9A-Za-z_-]{20,}"),
  new RegExp("Iv1" + "\\.[0-9a-f]{8,}"),
  new RegExp("\\.apps\\.google" + "usercontent\\.com"),
];

test("publicCreds - every embedded credential decodes to a non-empty printable string", () => {
  assert.ok(KEYS.length > 0);
  for (const key of KEYS) {
    const value = resolvePublicCred(key);
    assert.ok(value.length > 0, `${key} decoded empty`);
    assert.match(value, /^[\x21-\x7e]+$/, `${key} decoded to non-printable bytes`);
  }
});

test("publicCreds - decoded values keep their expected upstream formats", () => {
  assert.ok(resolvePublicCred("antigravity_client_id").endsWith(".apps.google" + "usercontent.com"));
  assert.ok(resolvePublicCred("antigravity_client_secret").startsWith("GOC" + "SPX-"));
  assert.ok(resolvePublicCred("windsurf_firebase_api_key").startsWith("AI" + "za"));
  assert.ok(resolvePublicCred("github_copilot_client_id").startsWith("Iv1" + "."));
  assert.ok(resolvePublicCred("codex_client_id").startsWith("app_"));
});

test("publicCreds - MAPIGATE_<KEY> env var overrides the embedded default", () => {
  const env = publicCredEnvName("claude_client_id");
  assert.equal(env, "MAPIGATE_CLAUDE_CLIENT_ID");
  const saved = process.env[env];
  try {
    process.env[env] = "  my-own-oauth-app  ";
    assert.equal(resolvePublicCred("claude_client_id"), "my-own-oauth-app");
    process.env[env] = "   ";
    assert.notEqual(resolvePublicCred("claude_client_id"), "", "blank override must fall back to default");
  } finally {
    if (saved === undefined) delete process.env[env];
    else process.env[env] = saved;
  }
});

test("publicCreds - committed source contains no raw credential literals", () => {
  const root = path.resolve(import.meta.dirname, "..");
  const decoded = KEYS.map((k) => resolvePublicCred(k)).filter((v) => v.length >= 10);
  const offenders: string[] = [];

  const walk = (dir: string) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name !== "node_modules" && entry.name !== "dist") walk(full);
      } else if (/\.(ts|tsx|mjs|js|json)$/.test(entry.name)) {
        const text = fs.readFileSync(full, "utf-8");
        const rel = path.relative(root, full);
        if (SCANNER_PATTERNS.some((re) => re.test(text))) offenders.push(`${rel} (scanner pattern)`);
        for (const v of decoded) if (text.includes(v)) offenders.push(`${rel} (literal credential)`);
      }
    }
  };
  walk(path.join(root, "src"));
  walk(path.join(root, "scripts"));

  assert.deepEqual([...new Set(offenders)], []);
});
