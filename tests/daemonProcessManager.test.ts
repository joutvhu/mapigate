import test from "node:test";
import assert from "node:assert/strict";
import net from "node:net";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

import { PortHelper } from "../src/cli/daemon/portHelper.js";
import { ProcessManager } from "../src/cli/daemon/processManager.js";
import { PidFileManager } from "../src/cli/daemon/pidFile.js";
import { APP_NAME, DEFAULT_PORT } from "../src/shared/constants/index.js";

test("PortHelper - parseNetstatOutput correctly extracts listening PIDs", () => {
  const sampleNetstat = `
Active Connections

  Proto  Local Address          Foreign Address        State           PID
  TCP    0.0.0.0:135            0.0.0.0:0              LISTENING       900
  TCP    0.0.0.0:2012           0.0.0.0:0              LISTENING       1111
  TCP    0.0.0.0:20127          0.0.0.0:0              LISTENING       4567
  TCP    127.0.0.1:20127        0.0.0.0:0              LISTENING       4567
  TCP    [::]:20127             [::]:0                 LISTENING       4567
  TCP    [::1]:20127            [::]:0                 LISTENING       4568
  TCP    127.0.0.1:20127        127.0.0.1:54321        ESTABLISHED     9999
  TCP    0.0.0.0:8080           0.0.0.0:0              TIME_WAIT       0
`;

  // Matches only 20127, ignores 2012, 135, 8080, and non-LISTENING
  const pids20127 = PortHelper.parseNetstatOutput(sampleNetstat, 20127);
  assert.deepEqual(pids20127.sort(), [4567, 4568]);

  // Matches 2012
  const pids2012 = PortHelper.parseNetstatOutput(sampleNetstat, 2012);
  assert.deepEqual(pids2012, [1111]);

  // Non-existent port
  const pids9999 = PortHelper.parseNetstatOutput(sampleNetstat, 9999);
  assert.deepEqual(pids9999, []);
});

test("PortHelper - parseLsofOutput extracts valid PIDs from multi-line output", () => {
  const sampleLsof = `
1234
5678
invalid_line

9999
`;
  const pids = PortHelper.parseLsofOutput(sampleLsof);
  assert.deepEqual(pids, [1234, 5678, 9999]);

  assert.deepEqual(PortHelper.parseLsofOutput(""), []);
});

test("PortHelper - isPortListening and waitForPortRelease with live temporary socket", async () => {
  const server = net.createServer();
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", () => resolve()));
  const address = server.address() as net.AddressInfo;
  const tempPort = address.port;

  try {
    // Port should be listening
    const isListening = await PortHelper.isPortListening(tempPort);
    assert.equal(isListening, true);

    // Close server
    await new Promise<void>((resolve) => server.close(() => resolve()));

    // Port should be released
    const isReleased = await PortHelper.waitForPortRelease(tempPort, 1500);
    assert.equal(isReleased, true);

    const isListeningAfterClose = await PortHelper.isPortListening(tempPort);
    assert.equal(isListeningAfterClose, false);
  } finally {
    try {
      server.close();
    } catch {
      // ignored
    }
  }
});

test("ProcessManager - resolveSpawnCommand provides non-empty executable and arguments", () => {
  const res = ProcessManager.resolveSpawnCommand();
  assert.ok(res.cmd && typeof res.cmd === "string");
  assert.ok(Array.isArray(res.args) && res.args.length > 0);
  assert.equal(typeof res.shell, "boolean");

  // If dist/server/index.js exists or dev mode with tsx, ensure args point to server entry
  const hasServerArg = res.args.some((arg) => arg.includes("server") && (arg.endsWith(".js") || arg.endsWith(".ts")));
  assert.ok(hasServerArg, "Expected spawn arguments to contain server entry file");
});

test("ProcessManager - stopDaemon when no PID file exists and port is clean", async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "mpg-daemon-test-"));
  const origEnv = process.env.MAPIGATE_DATA_DIR;
  process.env.MAPIGATE_DATA_DIR = tmpDir;

  try {
    // Ensure no PID file
    PidFileManager.removePid();

    // Pick an unused high port
    const testPort = 59871;
    const res = await ProcessManager.stopDaemon(testPort);
    assert.equal(res.success, false);
    assert.ok(res.message.includes("No active PID file found"));
  } finally {
    if (origEnv !== undefined) process.env.MAPIGATE_DATA_DIR = origEnv;
    else delete process.env.MAPIGATE_DATA_DIR;
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {}
  }
});

test("ProcessManager - stopDaemon cleans up stale PID file", async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "mpg-daemon-test-"));
  const origEnv = process.env.MAPIGATE_DATA_DIR;
  process.env.MAPIGATE_DATA_DIR = tmpDir;

  try {
    // Write a definitely non-existent PID (e.g. 9999999)
    PidFileManager.writePid(9999999);
    assert.equal(PidFileManager.readPid(), 9999999);

    const testPort = 59872;
    const res = await ProcessManager.stopDaemon(testPort);
    assert.equal(res.success, true);
    assert.ok(res.message.includes("Cleaned up stale PID 9999999"));
    assert.equal(PidFileManager.readPid(), null);
  } finally {
    if (origEnv !== undefined) process.env.MAPIGATE_DATA_DIR = origEnv;
    else delete process.env.MAPIGATE_DATA_DIR;
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {}
  }
});

test("ProcessManager - stopDaemon cleans orphan process listening on port when PID is missing", async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "mpg-daemon-test-"));
  const origEnv = process.env.MAPIGATE_DATA_DIR;
  process.env.MAPIGATE_DATA_DIR = tmpDir;

  // Mock PortHelper.getAllPidsOnPort and PortHelper.killProcess
  const origGetAllPids = PortHelper.getAllPidsOnPort;
  const origKillProcess = PortHelper.killProcess;
  const killedPids: number[] = [];

  try {
    PidFileManager.removePid();

    PortHelper.getAllPidsOnPort = (port: number) => {
      if (port === 20127) return [4444];
      return [];
    };
    PortHelper.killProcess = (pid: number) => {
      killedPids.push(pid);
      return true;
    };

    const res = await ProcessManager.stopDaemon(20127);
    assert.equal(res.success, true);
    assert.ok(res.message.includes("Stopped orphan process (PID: 4444)"));
    assert.deepEqual(killedPids, [4444]);
  } finally {
    PortHelper.getAllPidsOnPort = origGetAllPids;
    PortHelper.killProcess = origKillProcess;
    if (origEnv !== undefined) process.env.MAPIGATE_DATA_DIR = origEnv;
    else delete process.env.MAPIGATE_DATA_DIR;
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {}
  }
});

test("ProcessManager - stopDaemon cleans stale PID and orphan process on port", async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "mpg-daemon-test-"));
  const origEnv = process.env.MAPIGATE_DATA_DIR;
  process.env.MAPIGATE_DATA_DIR = tmpDir;

  const origGetAllPids = PortHelper.getAllPidsOnPort;
  const origKillProcess = PortHelper.killProcess;
  const killedPids: number[] = [];

  try {
    PidFileManager.writePid(9999999);

    PortHelper.getAllPidsOnPort = (port: number) => {
      if (port === 20127) return [5555];
      return [];
    };
    PortHelper.killProcess = (pid: number) => {
      killedPids.push(pid);
      return true;
    };

    const res = await ProcessManager.stopDaemon(20127);
    assert.equal(res.success, true);
    assert.ok(res.message.includes("Cleaned up stale PID 9999999 and stopped orphan process (PID: 5555)"));
    assert.deepEqual(killedPids, [5555]);
    assert.equal(PidFileManager.readPid(), null);
  } finally {
    PortHelper.getAllPidsOnPort = origGetAllPids;
    PortHelper.killProcess = origKillProcess;
    if (origEnv !== undefined) process.env.MAPIGATE_DATA_DIR = origEnv;
    else delete process.env.MAPIGATE_DATA_DIR;
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {}
  }
});
