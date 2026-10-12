import test from "node:test";
import assert from "node:assert/strict";
import {
  CLI_TOOLS,
  CLI_TOOLS_ARRAY,
  MAPIGATE_BASE_URL,
  MAPIGATE_V1_URL,
} from "../src/shared/constants/cliTools.js";
import {
  ALL_TOOL_HANDLERS,
  SUPPORTED_TOOL_IDS,
  CliToolRegistry,
  resolveToolHandlers,
} from "../src/cli/tools/index.js";

test("CLI Tools Modular Registry - All 26 tools are registered in CLI_TOOLS", () => {
  const toolIds = Object.keys(CLI_TOOLS);
  assert.equal(toolIds.length, 26, `Expected 26 tools, got ${toolIds.length}`);
  assert.equal(CLI_TOOLS_ARRAY.length, 26, `Expected CLI_TOOLS_ARRAY length 26, got ${CLI_TOOLS_ARRAY.length}`);

  const expectedIds = [
    "claude",
    "openclaw",
    "codex",
    "copilot",
    "opencode",
    "cowork",
    "hermes",
    "droid",
    "cursor",
    "cline",
    "kilo",
    "roo",
    "continue",
    "amp",
    "qwen",
    "deepseek-tui",
    "jcode",
    "grok-build",
    "devin",
    "opendesign",
    "pi",
    "omp",
    "crush",
    "forge",
    "smelt",
    "codewhale",
  ];

  for (const id of expectedIds) {
    assert.ok(CLI_TOOLS[id], `Tool "${id}" must exist in CLI_TOOLS`);
    const tool = CLI_TOOLS[id];
    assert.equal(tool.id, id);
    assert.ok(tool.name && tool.name.length > 0, `Tool "${id}" must have a name`);
    assert.ok(tool.color && tool.color.length > 0, `Tool "${id}" must have a color`);
    assert.ok(tool.description && tool.description.length > 0, `Tool "${id}" must have a description`);
    assert.ok(
      ["env", "file", "guide", "custom"].includes(tool.configType),
      `Tool "${id}" has invalid configType: ${tool.configType}`
    );
  }
});

test("CLI Tools Modular Registry - Backward compatibility constants", () => {
  assert.equal(MAPIGATE_BASE_URL, "http://127.0.0.1:20127");
  assert.equal(MAPIGATE_V1_URL, "http://127.0.0.1:20127/v1");
});

test("CLI Tools Modular Registry - All 6 tool configurator handlers are registered", () => {
  assert.equal(ALL_TOOL_HANDLERS.length, 6);
  const handlerIds = ALL_TOOL_HANDLERS.map((h) => h.id).sort();
  assert.deepEqual(handlerIds, ["claude", "cline", "codex", "droid", "openclaw", "opencode"].sort());

  for (const handler of ALL_TOOL_HANDLERS) {
    assert.ok(typeof handler.paths === "function");
    assert.ok(typeof handler.show === "function");
    assert.ok(typeof handler.apply === "function");
    assert.ok(typeof handler.reset === "function");
  }
});

test("CLI Tools Modular Registry - CliToolRegistry lookups and alias resolution", () => {
  const claude = CliToolRegistry.get("claude");
  assert.ok(claude);
  assert.equal(claude?.id, "claude");

  const claudeCodeAlias = CliToolRegistry.get("claude-code");
  assert.ok(claudeCodeAlias);
  assert.equal(claudeCodeAlias?.id, "claude");

  const droidAlias = CliToolRegistry.get("factory-droid");
  assert.ok(droidAlias);
  assert.equal(droidAlias?.id, "droid");

  const resolved = resolveToolHandlers(["claude", "codex"]);
  assert.equal(resolved.length, 2);
  assert.deepEqual(
    resolved.map((h) => h.id).sort(),
    ["claude", "codex"].sort()
  );
});
