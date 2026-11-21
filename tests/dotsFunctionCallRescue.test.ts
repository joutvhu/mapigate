process.env.NODE_ENV = "test";

import test from "node:test";
import assert from "node:assert/strict";
import {
  rescueInlineToolCalls,
  startsWithDialectMarker,
  containsDialectMarker,
} from "../src/core/adapters/helpers/toolCallRescue.js";

const TOOLS = new Set(["Bash", "Read", "Edit", "TodoWrite"]);

test("Dots Dialect - startsWithDialectMarker & containsDialectMarker", () => {
  assert.equal(startsWithDialectMarker("<dots_function_call>"), true);
  assert.equal(startsWithDialectMarker("  <dots_function_call>\n"), true);
  assert.equal(containsDialectMarker("Let me run <dots_function_call>"), true);
  assert.equal(startsWithDialectMarker("Hello world"), false);
});

test("Dots Dialect - parses well-formed single invoke with command", () => {
  const text = `<dots_function_call>
  <invoke name="Bash">
    <parameter name="command">git status</parameter>
  </invoke>
</dots_function_call>`;

  const result = rescueInlineToolCalls(text, TOOLS);
  assert.equal(result.detected, true);
  assert.ok(result.calls);
  assert.equal(result.calls.length, 1);
  assert.equal(result.calls[0].name, "Bash");
  assert.deepEqual(JSON.parse(result.calls[0].arguments), { command: "git status" });
  assert.equal(result.cleanText, "");
});

test("Dots Dialect - parses multiple invokes and coerces parameter types", () => {
  const text = `Let me check the files first.
<dots_function_call>
  <invoke name="Read">
    <parameter name="file_path">/tmp/app.ts</parameter>
    <parameter name="offset">10</parameter>
    <parameter name="limit">50</parameter>
  </invoke>
  <invoke name="Edit">
    <parameter name="file_path">/tmp/app.ts</parameter>
    <parameter name="replace_all">true</parameter>
  </invoke>
</dots_function_call>`;

  const result = rescueInlineToolCalls(text, TOOLS);
  assert.equal(result.detected, true);
  assert.ok(result.calls);
  assert.equal(result.calls.length, 2);

  // Invoke 1: number parsing
  assert.equal(result.calls[0].name, "Read");
  const readArgs = JSON.parse(result.calls[0].arguments);
  assert.equal(readArgs.file_path, "/tmp/app.ts");
  assert.equal(readArgs.offset, 10);
  assert.equal(readArgs.limit, 50);

  // Invoke 2: boolean parsing
  assert.equal(result.calls[1].name, "Edit");
  const editArgs = JSON.parse(result.calls[1].arguments);
  assert.equal(editArgs.replace_all, true);

  assert.equal(result.cleanText, "Let me check the files first.");
});

test("Dots Dialect - preserves interior indentation in parameters", () => {
  const text = `<dots_function_call>
  <invoke name="Edit">
    <parameter name="old_string">
    const x = 1;
    return x;
</parameter>
  </invoke>
</dots_function_call>`;

  const result = rescueInlineToolCalls(text, TOOLS);
  assert.ok(result.calls);
  const args = JSON.parse(result.calls[0].arguments);
  assert.equal(args.old_string, "    const x = 1;\n    return x;");
});

test("Dots Dialect - rejects undeclared tool names", () => {
  const text = `<dots_function_call>
  <invoke name="DropDatabase">
    <parameter name="db">production</parameter>
  </invoke>
</dots_function_call>`;

  const result = rescueInlineToolCalls(text, TOOLS);
  assert.equal(result.detected, true);
  assert.equal(result.calls, null);
});
