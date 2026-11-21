process.env.NODE_ENV = "test";

import test from "node:test";
import assert from "node:assert/strict";
import { sanitizeSchemaForGemini } from "../src/core/adapters/helpers/toolSchemaNormalize.js";

test("Gemini Schema Compat - turns oneOf into anyOf", () => {
  const input = {
    type: "object",
    properties: {
      target: {
        description: "path or id",
        oneOf: [{ type: "string" }, { type: "integer" }],
      },
    },
  };

  const output: any = sanitizeSchemaForGemini(input);
  assert.equal(output.properties.target.oneOf, undefined);
  assert.deepEqual(output.properties.target.anyOf, [{ type: "string" }, { type: "integer" }]);
});

test("Gemini Schema Compat - merges allOf branches", () => {
  const input = {
    description: "composite options",
    allOf: [
      { type: "object", properties: { a: { type: "string" } }, required: ["a"] },
      { properties: { b: { type: "integer" } }, required: ["b", "a"] },
    ],
  };

  const output: any = sanitizeSchemaForGemini(input);
  assert.equal(output.allOf, undefined);
  assert.equal(output.type, "object");
  assert.deepEqual(output.properties, {
    a: { type: "string" },
    b: { type: "integer" },
  });
  assert.deepEqual(output.required, ["a", "b"]);
});

test("Gemini Schema Compat - items cleanup on non-arrays", () => {
  // 1. Schema with items and type: string -> remove items
  const nonArrayWithItems: any = sanitizeSchemaForGemini({
    type: "string",
    items: { type: "string" },
  });
  assert.equal(nonArrayWithItems.type, "string");
  assert.equal(nonArrayWithItems.items, undefined);

  // 2. Schema with items and type: array -> preserve items
  const validArray: any = sanitizeSchemaForGemini({
    type: "array",
    items: { type: "string" },
  });
  assert.equal(validArray.type, "array");
  assert.deepEqual(validArray.items, { type: "string" });
});

test("Gemini Schema Compat - collapses type unions", () => {
  const input = {
    properties: {
      name: { type: ["string", "null"] },
      tags: { type: ["array", "null"], items: { type: "string" } },
    },
  };

  const output: any = sanitizeSchemaForGemini(input);
  assert.equal(output.properties.name.type, "string");
  assert.equal(output.properties.name.nullable, true);
  assert.equal(output.properties.tags.type, "array");
  assert.equal(output.properties.tags.nullable, true);
  assert.deepEqual(output.properties.tags.items, { type: "string" });
});
