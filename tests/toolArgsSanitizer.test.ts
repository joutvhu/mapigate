import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  parseFirstJsonObject,
  parseAllJsonObjects,
  sanitizeToolArguments,
} from "../src/shared/utils/toolArgsSanitizer.js";

describe("toolArgsSanitizer", () => {
  it("parses single valid JSON object", () => {
    const raw = '{"path":"src/policy.rs","limit":200}';
    const parsed = parseFirstJsonObject(raw);
    assert.deepEqual(parsed, { path: "src/policy.rs", limit: 200 });
  });

  it("extracts first object from concatenated JSON", () => {
    const raw = '{"path":"src/policy.rs"}{"path":"src/tool_policy.rs"}';
    const parsed = parseFirstJsonObject(raw);
    assert.deepEqual(parsed, { path: "src/policy.rs" });
  });

  it("extracts all objects from concatenated JSON", () => {
    const raw = '{"path":"src/policy.rs"}{"path":"src/tool_policy.rs","limit":100}';
    const all = parseAllJsonObjects(raw);
    assert.equal(all.length, 2);
    assert.deepEqual(all[0], { path: "src/policy.rs" });
    assert.deepEqual(all[1], { path: "src/tool_policy.rs", limit: 100 });
  });

  it("handles string with leading junk or spaces", () => {
    const raw = '   prefix {"a": 1} trailing';
    const parsed = parseFirstJsonObject(raw);
    assert.deepEqual(parsed, { a: 1 });
  });

  it("sanitizes Google synthetic invalidArgs wrapper from Kiro logs", () => {
    const malformed = {
      invalidArgs:
        '{"limit":200,"offset":0,"path":"f:\\\\Documents\\\\Library\\\\AI\\\\mcp-sentinel\\\\src\\\\policy.rs"}{"path":"f:\\\\Documents\\\\Library\\\\AI\\\\mcp-sentinel\\\\src\\\\tool_policy.rs","limit":200,"offset":0}',
    };
    const cleaned = sanitizeToolArguments(malformed);
    assert.deepEqual(cleaned, {
      limit: 200,
      offset: 0,
      path: "f:\\Documents\\Library\\AI\\mcp-sentinel\\src\\policy.rs",
    });
  });

  it("sanitizes stringified invalidArgs in JSON string", () => {
    const jsonStr = JSON.stringify({
      invalidArgs: '{"path":"src/redactor.rs"}{"path":"src/policy.rs"}',
    });
    const cleaned = sanitizeToolArguments(jsonStr);
    assert.deepEqual(cleaned, { path: "src/redactor.rs" });
  });

  it("returns clean object untouched", () => {
    const clean = { path: "README.md", limit: 100 };
    assert.deepEqual(sanitizeToolArguments(clean), clean);
  });

  it("returns empty object on null, undefined or unparseable inputs", () => {
    assert.deepEqual(sanitizeToolArguments(null), {});
    assert.deepEqual(sanitizeToolArguments(undefined), {});
    assert.deepEqual(sanitizeToolArguments("random text"), {});
    assert.deepEqual(sanitizeToolArguments({ invalidArgs: "no json here" }), {});
  });
});
