import test from "node:test";
import assert from "node:assert/strict";
import { XiaomiTokenplanProvider } from "../src/providers/catalog/xiaomi-tokenplan/provider.js";
import { MimoProvider } from "../src/providers/runtime/mimo/provider.js";
import type { ProviderRequestContext } from "../src/providers/core/types.js";

test("XiaomiTokenplanProvider - transformResponseChunk rescues MiMo tool_call", () => {
  const provider = new XiaomiTokenplanProvider();
  const context = {
    targetModel: "mimo-v2.6-pro",
    clientFormat: "openai",
    targetFormat: "openai",
    body: {},
  } as ProviderRequestContext;

  const chunk1 = {
    choices: [
      {
        delta: {
          content: '<tool_call><function=execute_pwsh><parameter=command>Get-ChildItem -Path "src"<parameter=description>Count files</tool_call>',
        },
      },
    ],
  };

  const res = provider.transformResponseChunk(chunk1, context);
  assert.ok(res.choices[0].delta.tool_calls);
  assert.equal(res.choices[0].delta.tool_calls.length, 1);
  assert.equal(res.choices[0].delta.tool_calls[0].function.name, "execute_pwsh");
  assert.deepEqual(JSON.parse(res.choices[0].delta.tool_calls[0].function.arguments), {
    command: 'Get-ChildItem -Path "src"',
    description: "Count files",
  });
  assert.equal(res.choices[0].delta.content, null);
});

test("MimoProvider - transformResponseChunk handles streaming splits", () => {
  const provider = new MimoProvider();
  const context = {
    targetModel: "mimo-v2.6-flash",
    clientFormat: "openai",
    targetFormat: "openai",
    body: {},
  } as ProviderRequestContext;

  // Split chunk 1: prefix text + start of tag
  const c1 = {
    choices: [
      {
        delta: {
          content: 'Let me run that:\n<tool_call><function=execute_pwsh><parameter=command>',
        },
      },
    ],
  };
  const r1 = provider.transformResponseChunk(c1, context);
  assert.equal(r1.choices[0].delta.content, "Let me run that:\n");
  assert.equal(r1.choices[0].delta.tool_calls, undefined);

  // Split chunk 2: body
  const c2 = {
    choices: [
      {
        delta: {
          content: 'npm test<parameter=description>Run test suite',
        },
      },
    ],
  };
  const r2 = provider.transformResponseChunk(c2, context);
  assert.equal(r2.choices[0].delta.content, null);
  assert.equal(r2.choices[0].delta.tool_calls, undefined);

  // Split chunk 3: close tag
  const c3 = {
    choices: [
      {
        delta: {
          content: '</tool_call>\nFinished.',
        },
      },
    ],
  };
  const r3 = provider.transformResponseChunk(c3, context);
  assert.ok(r3.choices[0].delta.tool_calls);
  assert.equal(r3.choices[0].delta.tool_calls[0].function.name, "execute_pwsh");
  assert.deepEqual(JSON.parse(r3.choices[0].delta.tool_calls[0].function.arguments), {
    command: "npm test",
    description: "Run test suite",
  });
  assert.equal(r3.choices[0].delta.content, "\nFinished.");
});

test("XiaomiTokenplanProvider - rescues pure XML <function=...> without <tool_call> wrapper", () => {
  const provider = new XiaomiTokenplanProvider();
  const context = {
    targetModel: "mimo-v2.6-flash",
    clientFormat: "openai",
    targetFormat: "openai",
    body: {
      tools: [
        { type: "function", function: { name: "read_file" } },
      ],
    },
  } as ProviderRequestContext;

  const chunk = {
    choices: [
      {
        delta: {
          content: '<function=read_file><parameter=path>src/index.ts</parameter></function>',
        },
      },
    ],
  };

  const res = provider.transformResponseChunk(chunk, context);
  assert.ok(res.choices[0].delta.tool_calls);
  assert.equal(res.choices[0].delta.tool_calls[0].function.name, "read_file");
  assert.deepEqual(JSON.parse(res.choices[0].delta.tool_calls[0].function.arguments), {
    path: "src/index.ts",
  });
});

test("XiaomiTokenplanProvider - transformResponseBody rescues non-streaming XML tool call", () => {
  const provider = new XiaomiTokenplanProvider();
  const context = {
    targetModel: "mimo-v2.6-flash",
    clientFormat: "openai",
    targetFormat: "openai",
    body: {
      tools: [{ type: "function", function: { name: "read_file" } }],
    },
  } as ProviderRequestContext;

  const body = {
    choices: [
      {
        message: {
          role: "assistant",
          content: "Đang đọc file:\n<function=read_file><parameter=path>app.py</parameter></function>",
        },
        finish_reason: "stop",
      },
    ],
  };

  const res = provider.transformResponseBody(body, context);
  assert.equal(res.choices[0].finish_reason, "tool_calls");
  assert.ok(res.choices[0].message.tool_calls);
  assert.equal(res.choices[0].message.tool_calls[0].function.name, "read_file");
  assert.deepEqual(JSON.parse(res.choices[0].message.tool_calls[0].function.arguments), {
    path: "app.py",
  });
  assert.equal(res.choices[0].message.content, "Đang đọc file:");
});
