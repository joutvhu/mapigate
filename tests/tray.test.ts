import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { resolveIconPath, resolveScriptPath } from "../src/cli/tray/trayWin.js";
import { isTraySupported as isGeneralTraySupported, buildTrayItems as buildGeneralItems, killTray } from "../src/cli/tray/tray.js";

test("Tray - buildTrayItems returns structured items with headers and actions", () => {
  const items = buildGeneralItems(20127, false);
  assert.equal(items.length, 6);
  assert.ok(items[0].title.includes("20127"));
  assert.equal(items[0].enabled, false);
  assert.equal(items[1].title, "Open Web Dashboard");
  assert.equal(items[1].enabled, true);
  assert.equal(items[2].title, "Status");
  assert.equal(items[2].enabled, true);
  assert.equal(items[3].title, "Enable Auto-start on Boot");
  assert.equal(items[3].enabled, true);
  assert.equal(items[4].title, "Restart Gateway");
  assert.equal(items[4].enabled, true);
  assert.equal(items[5].title, "Quit / Shutdown");
  assert.equal(items[5].enabled, true);

  const activeItems = buildGeneralItems(20127, true);
  assert.equal(activeItems[3].title, "✓ Auto-start on Boot");
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
