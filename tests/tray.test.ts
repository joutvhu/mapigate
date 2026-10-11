import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { resolveIconPath, resolveScriptPath } from "../src/cli/tray/trayWin.js";
import { isTraySupported as isGeneralTraySupported, buildTrayItems as buildGeneralItems, killTray } from "../src/cli/tray/tray.js";

test("Tray - buildTrayItems returns structured items with headers and actions", () => {
  const items = buildGeneralItems(20127);
  assert.equal(items.length, 4);
  assert.ok(items[0].title.includes("20127"));
  assert.equal(items[0].enabled, false);
  assert.equal(items[1].title, "Open Web Dashboard");
  assert.equal(items[1].enabled, true);
  assert.equal(items[2].title, "Status");
  assert.equal(items[2].enabled, true);
  assert.equal(items[3].title, "Quit / Shutdown");
  assert.equal(items[3].enabled, true);
});

test("Tray - resolveScriptPath and resolveIconPath locate asset files", () => {
  const scriptPath = resolveScriptPath();
  assert.ok(fs.existsSync(scriptPath), `Expected script to exist: ${scriptPath}`);

  const iconPath = resolveIconPath();
  assert.ok(fs.existsSync(iconPath), `Expected icon to exist: ${iconPath}`);
});

test("Tray - killTray is safe to call when no tray is running", async () => {
  await killTray();
  assert.ok(true);
});

test("Tray - isTraySupported returns boolean", () => {
  const supported = isGeneralTraySupported();
  assert.equal(typeof supported, "boolean");
});
