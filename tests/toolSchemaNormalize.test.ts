import test from "node:test";
import assert from "node:assert/strict";
import {
  normalizeToolParameters,
  normalizeToolsToOpenAi,
} from "../src/core/adapters/helpers/toolSchemaNormalize.js";
import { AnthropicAdapter } from "../src/core/adapters/anthropicAdapter.js";

test("normalizeToolParameters - handles null/empty/invalid input safely", () => {
  assert.deepEqual(normalizeToolParameters(null), { type: "object", properties: {} });
  assert.deepEqual(normalizeToolParameters(undefined), { type: "object", properties: {} });
  assert.deepEqual(normalizeToolParameters("string"), { type: "object", properties: {} });
  assert.deepEqual(normalizeToolParameters({}), {});
});

test("normalizeToolParameters - ensures type: object always has properties", () => {
  const schemaNoProps = { type: "object" };
  const normalized = normalizeToolParameters(schemaNoProps);
  assert.deepEqual(normalized, { type: "object", properties: {} });

  const schemaNullProps = { type: "object", properties: null };
  const normalizedNull = normalizeToolParameters(schemaNullProps);
  assert.deepEqual(normalizedNull, { type: "object", properties: {} });

  const schemaExistingProps = {
    type: "object",
    properties: {
      path: { type: "string" },
    },
    required: ["path"],
  };
  const normalizedExisting = normalizeToolParameters(schemaExistingProps);
  assert.deepEqual(normalizedExisting, {
    type: "object",
    properties: {
      path: { type: "string" },
    },
    required: ["path"],
  });
});

test("normalizeToolParameters - recursively normalizes nested object properties and strips $schema", () => {
  const schemaNested = {
    $schema: "http://json-schema.org/draft-07/schema#",
    type: "object",
    properties: {
      config: {
        type: "object", // missing properties
      },
      name: {
        type: "string",
      },
    },
  };

  const normalized = normalizeToolParameters(schemaNested);
  assert.equal("$schema" in normalized, false, "$schema must be stripped");
  assert.deepEqual(normalized.properties.config, { type: "object", properties: {} });
  assert.deepEqual(normalized.properties.name, { type: "string" });
});

test("normalizeToolsToOpenAi - standardizes flat and nested tool definitions", () => {
  // Empty or invalid array returns undefined
  assert.equal(normalizeToolsToOpenAi([]), undefined);
  assert.equal(normalizeToolsToOpenAi(undefined), undefined);

  // Flat Responses API tool: { type: "function", name: "...", parameters: {...} }
  const flatTools = [
    {
      type: "function",
      name: "read_file",
      description: "Read file contents",
      parameters: {
        type: "object",
      },
    },
  ];

  const normalizedFlat = normalizeToolsToOpenAi(flatTools);
  assert.ok(Array.isArray(normalizedFlat));
  assert.equal(normalizedFlat.length, 1);
  assert.equal(normalizedFlat[0].type, "function");
  assert.deepEqual(normalizedFlat[0].function, {
    name: "read_file",
    description: "Read file contents",
    parameters: {
      type: "object",
      properties: {},
    },
  });

  // Already standard format with missing properties inside function.parameters
  const standardToolsWithFlaws = [
    {
      type: "function",
      function: {
        name: "execute_command",
        parameters: {
          type: "object",
        },
      },
    },
  ];

  const normalizedStandard = normalizeToolsToOpenAi(standardToolsWithFlaws);
  assert.ok(Array.isArray(normalizedStandard));
  assert.deepEqual(normalizedStandard[0].function.parameters, {
    type: "object",
    properties: {},
  });
});

test("AnthropicAdapter.openAiToAnthropic - converts tools with normalized input_schema", () => {
  const openAiBody = {
    model: "claude-3-5-sonnet-20241022",
    messages: [{ role: "user", content: "Run tool" }],
    tools: [
      {
        type: "function",
        function: {
          name: "fetch_data",
          description: "Fetches remote data",
          parameters: {
            type: "object", // lacks properties
          },
        },
      },
    ],
  };

  const anthropicPayload = AnthropicAdapter.openAiToAnthropic(openAiBody);
  assert.ok(Array.isArray(anthropicPayload.tools));
  assert.equal(anthropicPayload.tools.length, 1);
  assert.deepEqual(anthropicPayload.tools[0], {
    name: "fetch_data",
    description: "Fetches remote data",
    input_schema: {
      type: "object",
      properties: {},
    },
  });
});
