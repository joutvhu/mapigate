import { test } from "node:test";
import assert from "node:assert/strict";
import { compareVersions } from "../src/shared/utils/versionChecker.js";

test("compareVersions handles semver correctly", () => {
  assert.equal(compareVersions("1.0.0", "1.0.0"), 0);
  assert.equal(compareVersions("1.0.1", "1.0.0"), 1);
  assert.equal(compareVersions("1.0.0", "1.0.1"), -1);
  assert.equal(compareVersions("1.2.0", "1.1.9"), 1);
  assert.equal(compareVersions("2.0.0", "1.9.9"), 1);
  assert.equal(compareVersions("0.5.93", "0.5.94"), -1);
  assert.equal(compareVersions("0.6.0", "0.5.99"), 1);
  // handles v prefix and whitespace
  assert.equal(compareVersions("v1.2.3", "1.2.3"), 0);
  assert.equal(compareVersions(" 1.2.4 ", "v1.2.3"), 1);
});
