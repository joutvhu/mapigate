import test from "node:test";
import assert from "node:assert/strict";
import {
  rescueInlineToolCalls,
  startsWithDialectMarker,
  couldBecomeDialectMarker,
  containsDialectMarker,
  createStreamToolCallRescuer,
} from "../src/core/adapters/helpers/toolCallRescue.js";

const TOOLS = new Set(["Read", "Write", "Bash", "Grep", "list_dir"]);
const EMPTY = new Set<string>();

test("toolCallRescue - Kimi/DeepSeek token dialect", () => {
  const text =
    '<|tool_calls_section_begin|><|tool_call_begin|>functions.Read:0<|tool_call_argument_begin|>{"file_path":"/tmp/x.txt"}<|tool_call_end|><|tool_calls_section_end|>';
  const r = rescueInlineToolCalls(text, TOOLS);
  assert.equal(r.detected, true);
  assert.deepEqual(r.calls, [{ name: "Read", arguments: '{"file_path":"/tmp/x.txt"}' }]);
});

test("toolCallRescue - multiple calls with cleanText preserved", () => {
  const text =
    'Let me check.\n<|tool_call_begin|>functions.Read:0<|tool_call_argument_begin|>{"file_path":"/a"}<|tool_call_end|>\n<|tool_call_begin|>functions.Grep:1<|tool_call_argument_begin|>{"pattern":"TODO"}<|tool_call_end|>';
  const r = rescueInlineToolCalls(text, TOOLS);
  assert.equal(r.detected, true);
  assert.equal(r.calls?.length, 2);
  assert.equal(r.calls?.[0].name, "Read");
  assert.equal(r.calls?.[1].name, "Grep");
  assert.equal(r.cleanText, "Let me check.");
});

test("toolCallRescue - token dialect with opaque ID is detected but unparseable", () => {
  const text =
    "<|tool_calls_section_begin|> <|tool_call_begin|> chatcmpl-tool-bde5fae954a11b1b <|tool_call_argument_begin|> {\"file_path\": \"/tmp\"} <|tool_call_end|>";
  const r = rescueInlineToolCalls(text, TOOLS);
  assert.equal(r.detected, true);
  assert.equal(r.calls, null);
});

test("toolCallRescue - token dialect with undeclared tool name", () => {
  const text =
    '<|tool_call_begin|>functions.DropTables:0<|tool_call_argument_begin|>{}<|tool_call_end|>';
  const r = rescueInlineToolCalls(text, TOOLS);
  assert.equal(r.detected, true);
  assert.equal(r.calls, null);
});

test("toolCallRescue - Groq/Llama function tag format", () => {
  const text = '<function=Bash{"command": "npm run build"}</function>';
  const r = rescueInlineToolCalls(text, TOOLS);
  assert.equal(r.detected, true);
  assert.deepEqual(r.calls, [{ name: "Bash", arguments: '{"command": "npm run build"}' }]);
});

test("toolCallRescue - Groq/Llama function tag with > variant", () => {
  const text = '<function=Read>{"file_path": "/tmp/a"}</function>';
  const r = rescueInlineToolCalls(text, TOOLS);
  assert.equal(r.detected, true);
  assert.deepEqual(r.calls, [{ name: "Read", arguments: '{"file_path": "/tmp/a"}' }]);
});

test("toolCallRescue - Groq function tag with array arguments is unparseable", () => {
  const text = '<function=Bash [{"a": "npm run build"}, {"b": "/tmp"}]</function>';
  const r = rescueInlineToolCalls(text, TOOLS);
  assert.equal(r.detected, true);
  assert.equal(r.calls, null);
});

test("toolCallRescue - XML-style tool_call", () => {
  const text =
    '<tool_call>\n{"name": "Write", "arguments": {"file_path": "/tmp/n.txt", "content": "hi"}}\n</tool_call>';
  const r = rescueInlineToolCalls(text, TOOLS);
  assert.equal(r.detected, true);
  assert.equal(r.calls?.length, 1);
  assert.equal(r.calls?.[0].name, "Write");
});

test("toolCallRescue - XML-style with parameters key and multiple blocks", () => {
  const text =
    '<tool_call>{"name": "Read", "parameters": {"file_path": "/a"}}</tool_call><tool_call>{"name": "Grep", "arguments": {"pattern": "x"}}</tool_call>';
  const r = rescueInlineToolCalls(text, TOOLS);
  assert.equal(r.detected, true);
  assert.equal(r.calls?.length, 2);
});

test("toolCallRescue - MiMo function and parameter dialect", () => {
  const text =
    '<tool_call><function=execute_pwsh><parameter=command>Get-ChildItem -Path "src"<parameter=description>Đếm file</tool_call>';
  const r = rescueInlineToolCalls(text, new Set(["execute_pwsh"]));
  assert.equal(r.detected, true);
  assert.equal(r.calls?.length, 1);
  assert.equal(r.calls?.[0].name, "execute_pwsh");
  assert.deepEqual(JSON.parse(r.calls?.[0].arguments || "{}"), {
    command: 'Get-ChildItem -Path "src"',
    description: "Đếm file",
  });
  assert.equal(r.cleanText, "");
});

test("toolCallRescue - function tag with parameter closing tag", () => {
  const text = '<function=run_workflow><parameter=workflowPath>bundled://investigate</parameter></function>';
  const r = rescueInlineToolCalls(text, new Set(["run_workflow"]));
  assert.equal(r.detected, true);
  assert.equal(r.calls?.length, 1);
  assert.equal(r.calls?.[0].name, "run_workflow");
  assert.deepEqual(JSON.parse(r.calls?.[0].arguments || "{}"), {
    workflowPath: "bundled://investigate",
  });
  assert.equal(r.cleanText, "");
});

test("toolCallRescue - truncated unclosed XML block", () => {
  const text = '<tool_call>{"name": "Read", "argum';
  const r = rescueInlineToolCalls(text, TOOLS);
  assert.equal(r.detected, true);
  assert.equal(r.calls, null);
});

test("toolCallRescue - bare JSON naming a known tool", () => {
  const text = '{"name": "list_dir", "arguments": {"path": "/tmp"}}';
  const r = rescueInlineToolCalls(text, TOOLS);
  assert.equal(r.detected, true);
  assert.deepEqual(r.calls, [{ name: "list_dir", arguments: '{"path":"/tmp"}' }]);
  assert.equal(r.cleanText, "");
});

test("toolCallRescue - fenced json block naming a known tool", () => {
  const text = '```json\n{"name": "Bash", "arguments": {"command": "ls"}}\n```';
  const r = rescueInlineToolCalls(text, TOOLS);
  assert.equal(r.detected, true);
  assert.equal(r.calls?.length, 1);
  assert.equal(r.calls?.[0].name, "Bash");
});

test("toolCallRescue - does not rescue JSON answer not naming a requested tool", () => {
  const text = '{"name": "Alice", "age": 30}';
  const r = rescueInlineToolCalls(text, TOOLS);
  assert.equal(r.detected, false);
  assert.equal(r.cleanText, text);
});

test("toolCallRescue - does not touch plain prose", () => {
  const text = "The port is 49152, configured in config.json.";
  const r = rescueInlineToolCalls(text, TOOLS);
  assert.equal(r.detected, false);
  assert.equal(r.cleanText, text);
});

test("toolCallRescue - empty tool set does not synthesize calls", () => {
  const out = rescueInlineToolCalls(
    '<function=Bash{"command":"rm -rf /"}</function>',
    EMPTY
  );
  assert.equal(out.detected, true);
  assert.equal(out.calls, null);
});

test("toolCallRescue - marker detection helpers", () => {
  assert.equal(startsWithDialectMarker("  <|tool_call_begin|>"), true);
  assert.equal(startsWithDialectMarker("<function=abc>"), true);
  assert.equal(startsWithDialectMarker("<tool_call>"), true);
  assert.equal(startsWithDialectMarker("Hello world"), false);

  assert.equal(couldBecomeDialectMarker("<|too"), true);
  assert.equal(couldBecomeDialectMarker("<func"), true);
  assert.equal(couldBecomeDialectMarker(""), true);
  assert.equal(couldBecomeDialectMarker("Hello"), false);

  assert.equal(containsDialectMarker("Text with <tool_call> inside"), true);
  assert.equal(containsDialectMarker("Normal text"), false);
});

test("StreamToolCallRescuer - parses consecutive multiple tool calls in stream", () => {
  const rescuer = createStreamToolCallRescuer();
  const chunk =
    '<tool_call><function=memory><parameter=command>get<parameter=title>prioritize-code-over-docs</tool_call> <tool_call><function=memory><parameter=command>get<parameter=title>prefer-vietnamese-language</tool_call>';

  const res = rescuer.feed(chunk);
  assert.equal(res.calls.length, 2);
  assert.equal(res.calls[0].name, "memory");
  assert.deepEqual(JSON.parse(res.calls[0].arguments), {
    command: "get",
    title: "prioritize-code-over-docs",
  });
  assert.equal(res.calls[1].name, "memory");
  assert.deepEqual(JSON.parse(res.calls[1].arguments), {
    command: "get",
    title: "prefer-vietnamese-language",
  });
  assert.equal(res.cleanText, " ");
});

test("StreamToolCallRescuer - buffers partial tags across chunks", () => {
  const rescuer = createStreamToolCallRescuer();

  // Chunk 1: text + start of tag
  const r1 = rescuer.feed("Check memory:\n<tool_call><function=memory><parameter=command>");
  assert.equal(r1.calls.length, 0);
  assert.equal(r1.cleanText, "Check memory:\n");

  // Chunk 2: parameter content
  const r2 = rescuer.feed("get<parameter=title>my-note");
  assert.equal(r2.calls.length, 0);
  assert.equal(r2.cleanText, null);

  // Chunk 3: close tag + final text
  const r3 = rescuer.feed("</tool_call>\nAll done.");
  assert.equal(r3.calls.length, 1);
  assert.equal(r3.calls[0].name, "memory");
  assert.deepEqual(JSON.parse(r3.calls[0].arguments), { command: "get", title: "my-note" });
  assert.equal(r3.cleanText, "\nAll done.");
});

test("StreamToolCallRescuer - parses Anthropic invoke format", () => {
  const rescuer = createStreamToolCallRescuer();
  const text = '<invoke name="readFile"><parameter name="path">src/main.ts</parameter></invoke>';
  const r = rescuer.feed(text);
  assert.equal(r.calls.length, 1);
  assert.equal(r.calls[0].name, "readFile");
  assert.deepEqual(JSON.parse(r.calls[0].arguments), { path: "src/main.ts" });
});
