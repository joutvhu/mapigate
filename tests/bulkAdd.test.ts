import test from "node:test";
import assert from "node:assert/strict";
import { planBulkAdd } from "../src/web/src/utils/bulkAdd.js";

test("planBulkAdd: basic auto-naming and custom naming", () => {
  const basic = planBulkAdd(["sk-a", "sk-b"], []);
  assert.deepEqual(basic.map((e) => e.name), ["Key 1", "Key 2"]);
  assert.deepEqual(basic.map((e) => e.apiKey), ["sk-a", "sk-b"]);

  const custom = planBulkAdd(["Prod|sk-1", "Prod|sk-2"], []);
  assert.deepEqual(custom.map((e) => e.name), ["Prod 1", "Prod 2"]);
  assert.deepEqual(custom.map((e) => e.apiKey), ["sk-1", "sk-2"]);
});

test("planBulkAdd: opaque LLM|id|secret tokens preserved", () => {
  const line = "LLM|1412752987604207|PYVRCdb9ZAnsZZk63RBlNQzApKk";
  const out = planBulkAdd([line], []);
  assert.equal(out.length, 1);
  assert.equal(out[0].name, "LLM 1");
  assert.equal(out[0].apiKey, line);

  const lower = "llm|1412752987604207|PYVRCdb9ZAnsZZk63RBlNQzApKk";
  const outLower = planBulkAdd([lower], []);
  assert.equal(outLower.length, 1);
  assert.equal(outLower[0].name, "LLM 1");
  assert.equal(outLower[0].apiKey, lower);
});

test("planBulkAdd: cloudflare mode parses 3 parts", () => {
  const out = planBulkAdd(["main|sk-key1|acc123"], [], { isCloudflareAi: true });
  assert.equal(out.length, 1);
  assert.equal(out[0].name, "main 1");
  assert.equal(out[0].apiKey, "sk-key1");
  assert.deepEqual(out[0].providerSpecificData, { accountId: "acc123" });
});
