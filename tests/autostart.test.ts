import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import express from "express";
import {
  getStartupEntryPath,
  resolveServerScriptPath,
  isAutoStartEnabled,
  getAutoStartInfo,
  enableAutoStart,
  disableAutoStart,
} from "../src/cli/daemon/autostart.js";
import { settingsRouter } from "../src/server/routes/apiSettings.js";

test("Autostart - getStartupEntryPath returns a valid path for platform", () => {
  const targetPath = getStartupEntryPath();
  assert.ok(targetPath, "Expected targetPath to be non-empty");
  if (process.platform === "win32") {
    assert.ok(targetPath.endsWith(".vbs"), "Expected .vbs extension on Windows");
  } else if (process.platform === "darwin") {
    assert.ok(targetPath.endsWith(".plist"), "Expected .plist extension on macOS");
  } else if (process.platform === "linux") {
    assert.ok(targetPath.endsWith(".desktop"), "Expected .desktop extension on Linux");
  }
});

test("Autostart - resolveServerScriptPath locates a valid file", () => {
  const scriptPath = resolveServerScriptPath();
  assert.ok(scriptPath, "Expected scriptPath to resolve");
  assert.ok(fs.existsSync(scriptPath), `Script path ${scriptPath} does not exist`);
});

test("Autostart - getAutoStartInfo returns structured object", () => {
  const info = getAutoStartInfo();
  assert.equal(typeof info.enabled, "boolean");
  assert.equal(info.platform, process.platform);
  assert.ok(info.targetPath);
});

test("Autostart - enable and disable cycle", () => {
  const initial = isAutoStartEnabled();
  const targetPath = getStartupEntryPath();

  try {
    const enabledRes = enableAutoStart();
    assert.equal(enabledRes, true);
    assert.equal(isAutoStartEnabled(), true);
    if (targetPath && process.platform === "win32") {
      assert.ok(fs.existsSync(targetPath));
      const content = fs.readFileSync(targetPath, "utf8");
      assert.ok(content.includes("WScript.Shell"));
      assert.ok(content.includes("--tray"));
    }

    const disabledRes = disableAutoStart();
    assert.equal(disabledRes, true);
    assert.equal(isAutoStartEnabled(), false);
  } finally {
    // Restore initial state
    if (initial) {
      enableAutoStart();
    } else {
      disableAutoStart();
    }
  }
});

test("Autostart - REST endpoints GET and POST /api/settings/autostart", async () => {
  const app = express();
  app.use(express.json());
  app.use("/api/settings", settingsRouter);

  const server = app.listen(0);
  const address = server.address() as any;
  const port = address.port;

  const initial = isAutoStartEnabled();

  try {
    // GET
    const getRes = await fetch(`http://127.0.0.1:${port}/api/settings/autostart`);
    assert.equal(getRes.status, 200);
    const getBody = (await getRes.json()) as any;
    assert.equal(typeof getBody.enabled, "boolean");
    assert.equal(getBody.platform, process.platform);

    // POST disable
    const postRes = await fetch(`http://127.0.0.1:${port}/api/settings/autostart`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ enabled: false }),
    });
    assert.equal(postRes.status, 200);
    const postBody = (await postRes.json()) as any;
    assert.equal(postBody.success, true);
    assert.equal(postBody.enabled, false);
  } finally {
    if (initial) {
      enableAutoStart();
    } else {
      disableAutoStart();
    }
    server.close();
  }
});
