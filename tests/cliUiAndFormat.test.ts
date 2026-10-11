import test from "node:test";
import assert from "node:assert/strict";
import { formatNumber, maskKey, stripAnsi, showBox, showTable, COLORS } from "../src/cli/ui/display.js";
import { ApiClient } from "../src/cli/client/apiClient.js";
import { copyToClipboard } from "../src/cli/ui/clipboard.js";

test("display - formatNumber handles various inputs", () => {
  assert.equal(formatNumber(0), "0");
  assert.equal(formatNumber(1000), (1000).toLocaleString());
  assert.equal(formatNumber(1234567), (1234567).toLocaleString());
  assert.equal(formatNumber(null), "0");
  assert.equal(formatNumber(undefined), "0");
  assert.equal(formatNumber(NaN), "0");
});

test("display - maskKey masks credentials securely", () => {
  assert.equal(maskKey(""), "****");
  assert.equal(maskKey(null), "****");
  assert.equal(maskKey(undefined), "****");
  assert.equal(maskKey("short"), "****");
  assert.equal(maskKey("1234567890"), "****");
  assert.equal(maskKey("sk-ant-api03-abcdefghijklmnop"), "sk-ant…mnop");
  assert.equal(maskKey("mapigate-local-test-token"), "mapiga…oken");
});

test("display - stripAnsi removes color codes correctly", () => {
  const colored = `${COLORS.red}ERROR${COLORS.reset}: ${COLORS.green}Success${COLORS.reset}`;
  assert.equal(stripAnsi(colored), "ERROR: Success");
});

test("display - showBox executes without crashing", () => {
  const captured: string[] = [];
  const originalLog = console.log;
  console.log = (msg?: any) => captured.push(String(msg));

  try {
    showBox("Test Title", "Line 1\nLine 2");
    assert.ok(captured.length >= 4);
    assert.ok(captured[0].includes("Test Title"));
    assert.ok(captured[1].includes("Line 1"));
    assert.ok(captured[2].includes("Line 2"));
  } finally {
    console.log = originalLog;
  }
});

test("display - showTable formats column headers and rows", () => {
  const captured: string[] = [];
  const originalLog = console.log;
  console.log = (msg?: any) => captured.push(String(msg));

  try {
    showTable(["Col A", "Col B"], [["Val 1", "Val 2"], ["Val 3", "Val 4"]]);
    assert.ok(captured.length >= 4);
    assert.ok(captured[0].includes("Col A"));
    assert.ok(captured[0].includes("Col B"));
    assert.ok(captured[2].includes("Val 1"));
  } finally {
    console.log = originalLog;
  }
});

test("clipboard - copyToClipboard handles empty strings gracefully", () => {
  assert.equal(copyToClipboard(""), false);
});

test("apiClient - configuration and URL resolution", () => {
  ApiClient.configure({ host: "127.0.0.1", port: 20127 });
  assert.equal(ApiClient.getBaseUrl(), "http://127.0.0.1:20127");
  assert.equal(ApiClient.getV1Url(), "http://127.0.0.1:20127/v1");
  assert.equal(ApiClient.getPort(), 20127);
  assert.equal(ApiClient.getHost(), "127.0.0.1");

  ApiClient.configure({ host: "0.0.0.0", port: 20128 });
  assert.equal(ApiClient.getHost(), "127.0.0.1"); // normalized to local IP
  assert.equal(ApiClient.getPort(), 20128);
  assert.equal(ApiClient.getBaseUrl(), "http://127.0.0.1:20128");

  // Restore default
  ApiClient.configure({ host: "127.0.0.1", port: 20127 });
});
