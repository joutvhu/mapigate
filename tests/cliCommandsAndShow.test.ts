import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import {
  ALL_TOOL_HANDLERS,
  SUPPORTED_TOOL_IDS,
  resolveToolHandlers,
  resolveToolHandlersWithValidation,
  pruneTomlSection,
} from "../src/cli/commands/toolConfigs.js";
import { inspectTool, printToolRecord } from "../src/cli/commands/show.js";
import { PortHelper } from "../src/cli/daemon/portHelper.js";
import { PidFileManager } from "../src/cli/daemon/pidFile.js";
import { runDoctor } from "../src/cli/commands/doctor.js";

test("toolConfigs - provides handlers for all core coding tools", () => {
  assert.ok(SUPPORTED_TOOL_IDS.includes("claude"));
  assert.ok(SUPPORTED_TOOL_IDS.includes("codex"));
  assert.ok(SUPPORTED_TOOL_IDS.includes("opencode"));
  assert.ok(SUPPORTED_TOOL_IDS.includes("droid"));
  assert.ok(SUPPORTED_TOOL_IDS.includes("cline"));
  assert.ok(SUPPORTED_TOOL_IDS.includes("openclaw"));
  assert.equal(ALL_TOOL_HANDLERS.length, 6);
});

test("toolConfigs - resolveToolHandlers resolves exact and alias names", () => {
  const all = resolveToolHandlers(["all"]);
  assert.equal(all.length, ALL_TOOL_HANDLERS.length);

  const claudeOnly = resolveToolHandlers(["claude"]);
  assert.equal(claudeOnly.length, 1);
  assert.equal(claudeOnly[0].id, "claude");

  const multi = resolveToolHandlers(["claude", "codex"]);
  assert.equal(multi.length, 2);

  const empty = resolveToolHandlers([]);
  assert.equal(empty.length, ALL_TOOL_HANDLERS.length);
});

test("toolConfigs - resolveToolHandlersWithValidation detects unrecognized tools", () => {
  const result = resolveToolHandlersWithValidation(["claude", "unknown_tool", "claudecode", "foo_bar"]);
  assert.equal(result.handlers.length, 1); // claude + claudecode alias map to claude (deduped)
  assert.equal(result.handlers[0].id, "claude");
  assert.deepEqual(result.unrecognized, ["unknown_tool", "foo_bar"]);
});

test("toolConfigs - pruneTomlSection surgically removes targeted TOML section", () => {
  const sampleToml = [
    `# Global user config`,
    `theme = "dark"`,
    `model_provider = "mapigate"`,
    ``,
    `[editor]`,
    `fontSize = 14`,
    ``,
    `[model_providers.mapigate]`,
    `name = "Mapigate"`,
    `base_url = "http://127.0.0.1:20128/v1"`,
    ``,
    `[model_providers.openai]`,
    `name = "OpenAI"`,
  ].join("\n");

  const pruned = pruneTomlSection(sampleToml, "model_providers.mapigate");
  assert.ok(!pruned.includes("[model_providers.mapigate]"));
  assert.ok(!pruned.includes("base_url = \"http://127.0.0.1:20128/v1\""));
  // Other sections and settings must remain intact
  assert.ok(pruned.includes(`theme = "dark"`));
  assert.ok(pruned.includes(`[editor]`));
  assert.ok(pruned.includes(`fontSize = 14`));
  assert.ok(pruned.includes(`[model_providers.openai]`));
});

test("show - inspectTool inspects tool handlers safely", async () => {
  const claudeHandler = ALL_TOOL_HANDLERS.find((h) => h.id === "claude")!;
  const rec = await inspectTool(claudeHandler);
  assert.equal(rec.id, "claude");
  assert.equal(rec.name, "Claude Code");
  assert.ok(Array.isArray(rec.files));
  assert.equal(typeof rec.configured, "boolean");
});

test("show - printToolRecord formats without crashing", () => {
  const captured: string[] = [];
  const originalLog = console.log;
  console.log = (msg?: any) => captured.push(String(msg));

  try {
    printToolRecord({
      id: "test",
      name: "Test Tool",
      files: ["config.json"],
      configured: true,
      baseUrl: "http://127.0.0.1:20128/v1",
      apiKey: "sk-ant…1234",
      models: { main: "claude-sonnet-4-6" },
      active: true,
    });
    assert.ok(captured.some((l) => l.includes("Test Tool")));
    assert.ok(captured.some((l) => l.includes("http://127.0.0.1:20128/v1")));
  } finally {
    console.log = originalLog;
  }
});

test("portHelper - parseNetstatOutput parses listening PIDs accurately", () => {
  const sampleNetstat = `
  TCP    0.0.0.0:20128          0.0.0.0:0              LISTENING       12345
  TCP    127.0.0.1:20128        0.0.0.0:0              LISTENING       12345
  TCP    0.0.0.0:80             0.0.0.0:0              LISTENING       444
  TCP    127.0.0.1:54321        127.0.0.1:20128        ESTABLISHED     9999
  `;

  const pids = PortHelper.parseNetstatOutput(sampleNetstat, 20128);
  assert.deepEqual(pids, [12345]);

  const nonExistent = PortHelper.parseNetstatOutput(sampleNetstat, 9999);
  assert.deepEqual(nonExistent, []);
});

test("pidFile - write, read, and remove PID file", () => {
  PidFileManager.writePid(999999);
  const read = PidFileManager.readPid();
  assert.equal(read, 999999);

  PidFileManager.removePid();
  const afterRemove = PidFileManager.readPid();
  assert.equal(afterRemove, null);
});

test("doctor - runs health checks cleanly", async () => {
  const captured: string[] = [];
  const originalLog = console.log;
  console.log = (msg?: any) => captured.push(String(msg));

  try {
    await runDoctor();
    assert.ok(captured.some((l) => l.includes("Doctor")));
  } finally {
    console.log = originalLog;
  }
});
