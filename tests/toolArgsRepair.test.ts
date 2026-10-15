import test from "node:test";
import assert from "node:assert/strict";
import {
  repairToolArguments,
  toolSchemaMap,
  extractToolNames,
  stripSchemaKeys,
} from "../src/core/adapters/helpers/toolArgsRepair.js";

const PLAN_SCHEMA = {
  type: "object",
  properties: {
    explanation: { type: "string" },
    plan: { type: "array" },
    config: { type: "object" },
  },
};

test("toolArgsRepair - decodes array parameter arrived as JSON string", () => {
  const broken = JSON.stringify({
    explanation: "next steps",
    plan: '[{"step": "Review design", "status": "in_progress"}, {"step": "QA", "status": "pending"}]',
  });
  const repaired = JSON.parse(repairToolArguments(broken, PLAN_SCHEMA));
  assert.equal(Array.isArray(repaired.plan), true);
  assert.equal(repaired.plan.length, 2);
  assert.equal(repaired.plan[0].step, "Review design");
  assert.equal(repaired.explanation, "next steps");
});

test("toolArgsRepair - decodes object parameter arrived as JSON string", () => {
  const broken = JSON.stringify({ config: '{"retries": 3}' });
  const repaired = JSON.parse(repairToolArguments(broken, PLAN_SCHEMA));
  assert.deepEqual(repaired.config, { retries: 3 });
});

test("toolArgsRepair - never touches parameter whose schema type is string", () => {
  const args = JSON.stringify({ explanation: '["this is literal text the user wants"]' });
  assert.equal(repairToolArguments(args, PLAN_SCHEMA), args);
});

test("toolArgsRepair - leaves string alone when it does not parse to schema type", () => {
  const args = JSON.stringify({ plan: '{"not": "an array"}' });
  assert.equal(repairToolArguments(args, PLAN_SCHEMA), args);
});

test("toolArgsRepair - leaves non-JSON strings alone", () => {
  const args = JSON.stringify({ plan: "just do the thing" });
  assert.equal(repairToolArguments(args, PLAN_SCHEMA), args);
});

test("toolArgsRepair - unwraps whole-arguments double encoding without schema", () => {
  const broken = JSON.stringify(JSON.stringify({ city: "Berlin" }));
  assert.deepEqual(JSON.parse(repairToolArguments(broken)), { city: "Berlin" });
});

test("toolArgsRepair - returns unparseable arguments untouched", () => {
  assert.equal(repairToolArguments("{not json", PLAN_SCHEMA), "{not json");
  assert.equal(repairToolArguments("", PLAN_SCHEMA), "");
});

test("toolArgsRepair - no-op on already-correct arguments", () => {
  const good = JSON.stringify({ plan: [{ step: "a" }], explanation: "x" });
  assert.equal(repairToolArguments(good, PLAN_SCHEMA), good);
});

test("toolArgsRepair - nested schema repair", () => {
  const NESTED_SCHEMA = {
    type: "object",
    properties: {
      label: { type: "string" },
      config: {
        type: "object",
        properties: {
          tags: { type: "array" },
          note: { type: "string" },
          nested: { type: "object", properties: { deep: { type: "array" } } },
        },
      },
      plan: {
        type: "array",
        items: { type: "object", properties: { steps: { type: "array" }, name: { type: "string" } } },
      },
    },
  };

  const broken = JSON.stringify({ config: { tags: '["a","b"]' } });
  const repaired = JSON.parse(repairToolArguments(broken, NESTED_SCHEMA));
  assert.deepEqual(repaired.config.tags, ["a", "b"]);

  const doubleBroken = JSON.stringify({ config: '{"tags": "[\\"a\\"]"}' });
  const doubleRepaired = JSON.parse(repairToolArguments(doubleBroken, NESTED_SCHEMA));
  assert.deepEqual(doubleRepaired.config.tags, ["a"]);

  const deeplyBroken = JSON.stringify({ config: { nested: { deep: "[1,2,3]" } } });
  const deeplyRepaired = JSON.parse(repairToolArguments(deeplyBroken, NESTED_SCHEMA));
  assert.deepEqual(deeplyRepaired.config.nested.deep, [1, 2, 3]);

  const arrayItemsBroken = JSON.stringify({ plan: [{ name: "a", steps: '["one","two"]' }] });
  const arrayItemsRepaired = JSON.parse(repairToolArguments(arrayItemsBroken, NESTED_SCHEMA));
  assert.deepEqual(arrayItemsRepaired.plan[0].steps, ["one", "two"]);
  assert.equal(arrayItemsRepaired.plan[0].name, "a");
});

test("toolSchemaMap & extractToolNames", () => {
  const openAiTools = [
    { type: "function", function: { name: "tool1", parameters: { type: "object" } } },
    { type: "function", function: { name: "tool2" } },
  ];
  const anthropicTools = [
    { name: "tool3", input_schema: { type: "object", properties: { foo: { type: "string" } } } },
  ];

  const map1 = toolSchemaMap(openAiTools);
  assert.equal(map1.has("tool1"), true);
  assert.equal(map1.has("tool2"), false);

  const map2 = toolSchemaMap(anthropicTools);
  assert.equal(map2.has("tool3"), true);

  const names1 = extractToolNames(openAiTools);
  assert.equal(names1.has("tool1"), true);
  assert.equal(names1.has("tool2"), true);

  const names2 = extractToolNames(anthropicTools);
  assert.equal(names2.has("tool3"), true);
});

test("stripSchemaKeys - strips specified keys recursively without mutating input", () => {
  const keys = new Set(["additionalProperties", "$schema"]);
  const input = {
    $schema: "https://json-schema.org/draft/2020-12/schema",
    type: "object",
    additionalProperties: false,
    properties: {
      city: { type: "string" },
      nested: {
        type: "object",
        additionalProperties: true,
        properties: { count: { type: "number" } },
      },
    },
  };

  const copy = JSON.parse(JSON.stringify(input));
  const stripped = stripSchemaKeys(input, keys);

  assert.deepEqual(input, copy, "Input must not be mutated");
  assert.equal((stripped as any).$schema, undefined);
  assert.equal((stripped as any).additionalProperties, undefined);
  assert.equal((stripped as any).properties.nested.additionalProperties, undefined);
  assert.equal((stripped as any).properties.city.type, "string");
});
