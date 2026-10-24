import "./setup.js";
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import express from "express";
import { mitmRouter } from "../src/server/routes/apiMitm.js";
import { mitmManager } from "../src/mitm/manager.js";
import { mitmServerInstance } from "../src/mitm/server.js";
import { MitmRepository } from "../src/storage/repositories/mitmRepo.js";
import { ProcessManager } from "../src/cli/daemon/processManager.js";

describe("MITM DNS Startup Restoration, Shutdown Cleanup, and Read-Only Invariants", () => {
  it("restoreDnsOnStartup does nothing if MITM server is not running", async () => {
    let addMultipleCalled = false;
    const origGetStatus = mitmServerInstance.getStatus.bind(mitmServerInstance);
    const origAddMultiple = mitmManager.addMultipleDns.bind(mitmManager);

    mitmServerInstance.getStatus = () => ({ running: false, port: 443 });
    mitmManager.addMultipleDns = async () => {
      addMultipleCalled = true;
    };

    try {
      const result = await mitmManager.restoreDnsOnStartup();
      assert.deepEqual(result, { restored: [], skipped: [] });
      assert.equal(addMultipleCalled, false, "Should not attempt to write hosts if server is stopped");
    } finally {
      mitmServerInstance.getStatus = origGetStatus;
      mitmManager.addMultipleDns = origAddMultiple;
    }
  });

  it("restoreDnsOnStartup does nothing if no tools were previously enabled in settings", async () => {
    let addMultipleCalled = false;
    const origGetStatus = mitmServerInstance.getStatus.bind(mitmServerInstance);
    const origAddMultiple = mitmManager.addMultipleDns.bind(mitmManager);

    mitmServerInstance.getStatus = () => ({ running: true, port: 443 });
    MitmRepository.setToolDnsStatus("kiro", false);
    MitmRepository.setToolDnsStatus("antigravity", false);
    MitmRepository.setToolDnsStatus("copilot", false);
    MitmRepository.setToolDnsStatus("cursor", false);

    mitmManager.addMultipleDns = async () => {
      addMultipleCalled = true;
    };

    try {
      const result = await mitmManager.restoreDnsOnStartup();
      assert.deepEqual(result, { restored: [], skipped: [] });
      assert.equal(addMultipleCalled, false, "Should not write hosts if all tools disabled in settings");
    } finally {
      mitmServerInstance.getStatus = origGetStatus;
      mitmManager.addMultipleDns = origAddMultiple;
    }
  });

  it("restoreDnsOnStartup skips tools that are already active in hosts", async () => {
    let addedTools: string[] = [];
    const origGetStatus = mitmServerInstance.getStatus.bind(mitmServerInstance);
    const origAddMultiple = mitmManager.addMultipleDns.bind(mitmManager);
    const origCheckLive = mitmManager.checkLiveDns.bind(mitmManager);

    mitmServerInstance.getStatus = () => ({ running: true, port: 443 });
    MitmRepository.setToolDnsStatus("kiro", true);
    MitmRepository.setToolDnsStatus("antigravity", false);

    // Live hosts already has kiro
    mitmManager.checkLiveDns = () => ({
      antigravity: false,
      kiro: true,
      copilot: false,
      cursor: false,
    });

    mitmManager.addMultipleDns = async (tools: string[]) => {
      addedTools = tools;
    };

    try {
      const result = await mitmManager.restoreDnsOnStartup();
      assert.deepEqual(result, { restored: [], skipped: ["kiro"] });
      assert.equal(addedTools.length, 0, "Should not rewrite hosts if already active");
    } finally {
      mitmServerInstance.getStatus = origGetStatus;
      mitmManager.addMultipleDns = origAddMultiple;
      mitmManager.checkLiveDns = origCheckLive;
    }
  });

  it("restoreDnsOnStartup restores missing entries in a single batch when previously enabled tools are inactive", async () => {
    let batchedCalls = 0;
    let addedTools: string[] = [];
    const origGetStatus = mitmServerInstance.getStatus.bind(mitmServerInstance);
    const origAddMultiple = mitmManager.addMultipleDns.bind(mitmManager);
    const origCheckLive = mitmManager.checkLiveDns.bind(mitmManager);

    mitmServerInstance.getStatus = () => ({ running: true, port: 443 });
    MitmRepository.setToolDnsStatus("kiro", true);
    MitmRepository.setToolDnsStatus("antigravity", true);
    MitmRepository.setToolDnsStatus("copilot", false);

    // Live hosts has neither kiro nor antigravity
    mitmManager.checkLiveDns = () => ({
      antigravity: false,
      kiro: false,
      copilot: false,
      cursor: false,
    });

    mitmManager.addMultipleDns = async (tools: string[]) => {
      batchedCalls++;
      addedTools = tools;
    };

    try {
      const result = await mitmManager.restoreDnsOnStartup();
      assert.equal(batchedCalls, 1, "Must restore multiple tools in exactly 1 batched operation");
      assert.deepEqual(addedTools.sort(), ["antigravity", "kiro"]);
      assert.deepEqual(result.restored.sort(), ["antigravity", "kiro"]);
      assert.deepEqual(result.skipped, []);
    } finally {
      mitmServerInstance.getStatus = origGetStatus;
      mitmManager.addMultipleDns = origAddMultiple;
      mitmManager.checkLiveDns = origCheckLive;
    }
  });

  it("stopServer removes DNS entries from hosts while preserving SQLite settings for next boot", async () => {
    let dnsCleanedUp = false;
    const origRemoveAll = mitmManager.removeAllDns.bind(mitmManager);
    const origStop = mitmServerInstance.stop.bind(mitmServerInstance);

    mitmManager.removeAllDns = async () => {
      dnsCleanedUp = true;
    };
    mitmServerInstance.stop = async () => {};

    // Enable kiro in settings
    MitmRepository.setToolDnsStatus("kiro", true);
    MitmRepository.setMitmServerRunning(true);

    try {
      await mitmManager.stopServer({ keepDns: false });

      // Hosts cleanup was triggered
      assert.equal(dnsCleanedUp, true, "Hosts cleanup should be called on shutdown");
      // But SQLite preferences must remain intact for next boot
      assert.equal(MitmRepository.getToolDnsStatus("kiro"), true, "User preference must be preserved in SQLite");
      assert.equal(MitmRepository.getMitmServerRunning(), false, "Server running state marked false");
    } finally {
      mitmManager.removeAllDns = origRemoveAll;
      mitmServerInstance.stop = origStop;
    }
  });

  it("getStatus performs strictly read-only checks without triggering hosts writes", async () => {
    let writeTriggered = false;
    const origAddMultiple = mitmManager.addMultipleDns.bind(mitmManager);
    const origRemoveAll = mitmManager.removeAllDns.bind(mitmManager);

    mitmManager.addMultipleDns = async () => {
      writeTriggered = true;
    };
    mitmManager.removeAllDns = async () => {
      writeTriggered = true;
    };

    try {
      const status = await mitmManager.getStatus();
      assert.equal(typeof status.running, "boolean");
      assert.equal(typeof status.dnsStatus, "object");
      assert.equal(writeTriggered, false, "getStatus must never trigger write operations");
    } finally {
      mitmManager.addMultipleDns = origAddMultiple;
      mitmManager.removeAllDns = origRemoveAll;
    }
  });

  it("startServer automatically triggers DNS reconciliation and restores missing entries in a single batch", async () => {
    let addedTools: string[] = [];
    const origStart = mitmServerInstance.start.bind(mitmServerInstance);
    const origStop = mitmServerInstance.stop.bind(mitmServerInstance);
    const origGetStatus = mitmServerInstance.getStatus.bind(mitmServerInstance);
    const origAddMultiple = mitmManager.addMultipleDns.bind(mitmManager);
    const origCheckLive = mitmManager.checkLiveDns.bind(mitmManager);

    let running = false;
    mitmServerInstance.start = async (port: number) => {
      running = true;
      return port;
    };
    mitmServerInstance.stop = async () => {
      running = false;
    };
    mitmServerInstance.getStatus = () => ({ running, port: 49191 });

    MitmRepository.setToolDnsStatus("kiro", true);
    MitmRepository.setToolDnsStatus("antigravity", true);
    MitmRepository.setToolDnsStatus("copilot", false);

    mitmManager.checkLiveDns = () => ({
      antigravity: false,
      kiro: false,
      copilot: false,
      cursor: false,
    });

    mitmManager.addMultipleDns = async (tools: string[]) => {
      addedTools = tools;
    };

    try {
      const port = await mitmManager.startServer({ port: 49191 });
      assert.equal(port, 49191);
      assert.deepEqual(addedTools.sort(), ["antigravity", "kiro"]);
    } finally {
      await mitmManager.stopServer({ keepDns: true });
      mitmServerInstance.start = origStart;
      mitmServerInstance.stop = origStop;
      mitmServerInstance.getStatus = origGetStatus;
      mitmManager.addMultipleDns = origAddMultiple;
      mitmManager.checkLiveDns = origCheckLive;
    }
  });

  it("startServer skips hosts write if enabled tools are already present in hosts file", async () => {
    let addMultipleCalled = false;
    const origStart = mitmServerInstance.start.bind(mitmServerInstance);
    const origStop = mitmServerInstance.stop.bind(mitmServerInstance);
    const origGetStatus = mitmServerInstance.getStatus.bind(mitmServerInstance);
    const origAddMultiple = mitmManager.addMultipleDns.bind(mitmManager);
    const origCheckLive = mitmManager.checkLiveDns.bind(mitmManager);

    let running = false;
    mitmServerInstance.start = async (port: number) => {
      running = true;
      return port;
    };
    mitmServerInstance.stop = async () => {
      running = false;
    };
    mitmServerInstance.getStatus = () => ({ running, port: 49192 });

    MitmRepository.setToolDnsStatus("kiro", true);
    MitmRepository.setToolDnsStatus("antigravity", false);

    mitmManager.checkLiveDns = () => ({
      antigravity: false,
      kiro: true,
      copilot: false,
      cursor: false,
    });

    mitmManager.addMultipleDns = async () => {
      addMultipleCalled = true;
    };

    try {
      await mitmManager.startServer({ port: 49192 });
      assert.equal(addMultipleCalled, false, "Should not rewrite hosts if already active");
    } finally {
      await mitmManager.stopServer({ keepDns: true });
      mitmServerInstance.start = origStart;
      mitmServerInstance.stop = origStop;
      mitmServerInstance.getStatus = origGetStatus;
      mitmManager.addMultipleDns = origAddMultiple;
      mitmManager.checkLiveDns = origCheckLive;
    }
  });

  it("startServer does not modify hosts if no tools were enabled in settings", async () => {
    let addMultipleCalled = false;
    const origStart = mitmServerInstance.start.bind(mitmServerInstance);
    const origStop = mitmServerInstance.stop.bind(mitmServerInstance);
    const origGetStatus = mitmServerInstance.getStatus.bind(mitmServerInstance);
    const origAddMultiple = mitmManager.addMultipleDns.bind(mitmManager);
    const origCheckLive = mitmManager.checkLiveDns.bind(mitmManager);

    let running = false;
    mitmServerInstance.start = async (port: number) => {
      running = true;
      return port;
    };
    mitmServerInstance.stop = async () => {
      running = false;
    };
    mitmServerInstance.getStatus = () => ({ running, port: 49193 });

    MitmRepository.setToolDnsStatus("kiro", false);
    MitmRepository.setToolDnsStatus("antigravity", false);
    MitmRepository.setToolDnsStatus("copilot", false);
    MitmRepository.setToolDnsStatus("cursor", false);

    mitmManager.checkLiveDns = () => ({
      antigravity: false,
      kiro: false,
      copilot: false,
      cursor: false,
    });

    mitmManager.addMultipleDns = async () => {
      addMultipleCalled = true;
    };

    try {
      await mitmManager.startServer({ port: 49193 });
      assert.equal(addMultipleCalled, false, "Should not write hosts if no tools are enabled in settings");
    } finally {
      await mitmManager.stopServer({ keepDns: true });
      mitmServerInstance.start = origStart;
      mitmServerInstance.stop = origStop;
      mitmServerInstance.getStatus = origGetStatus;
      mitmManager.addMultipleDns = origAddMultiple;
      mitmManager.checkLiveDns = origCheckLive;
    }
  });

  it("stopServer({ keepDns: true }) preserves hosts file entries for server restarts", async () => {
    let removeAllCalled = false;
    const origRemoveAll = mitmManager.removeAllDns.bind(mitmManager);
    const origStop = mitmServerInstance.stop.bind(mitmServerInstance);

    mitmManager.removeAllDns = async () => {
      removeAllCalled = true;
    };
    mitmServerInstance.stop = async () => {};

    try {
      await mitmManager.stopServer({ keepDns: true });
      assert.equal(removeAllCalled, false, "Should not remove hosts DNS entries when keepDns is true");
    } finally {
      mitmManager.removeAllDns = origRemoveAll;
      mitmServerInstance.stop = origStop;
    }
  });

  it("startServer sets lastDnsWarning and liveDns accurately reflects false when DNS sync fails", async () => {
    const origStart = mitmServerInstance.start.bind(mitmServerInstance);
    const origStop = mitmServerInstance.stop.bind(mitmServerInstance);
    const origGetStatus = mitmServerInstance.getStatus.bind(mitmServerInstance);
    const origAddMultiple = mitmManager.addMultipleDns.bind(mitmManager);
    const origCheckLive = mitmManager.checkLiveDns.bind(mitmManager);

    let running = false;
    mitmServerInstance.start = async (port: number) => {
      running = true;
      return port;
    };
    mitmServerInstance.stop = async () => {
      running = false;
    };
    mitmServerInstance.getStatus = () => ({ running, port: 49194 });

    MitmRepository.setToolDnsStatus("kiro", true);

    // Live hosts does not have kiro
    mitmManager.checkLiveDns = () => ({
      antigravity: false,
      kiro: false,
      copilot: false,
      cursor: false,
    });

    // Simulating elevation cancellation or failure
    mitmManager.addMultipleDns = async () => {
      throw new Error("User canceled UAC prompt");
    };

    try {
      const port = await mitmManager.startServer({ port: 49194 });
      assert.equal(port, 49194);
      assert.equal(mitmManager.getLastDnsWarning(), "User canceled UAC prompt");

      const status = await mitmManager.getStatus();
      assert.equal(status.running, true);
      // Real physical DNS status must be false, NOT stale repo status (true)
      assert.equal(status.dnsStatus.kiro, false, "Live physical status must report false when DNS sync fails");
    } finally {
      await mitmManager.stopServer({ keepDns: true });
      mitmServerInstance.start = origStart;
      mitmServerInstance.stop = origStop;
      mitmServerInstance.getStatus = origGetStatus;
      mitmManager.addMultipleDns = origAddMultiple;
      mitmManager.checkLiveDns = origCheckLive;
    }
  });

  it("startServer skips hosts write when only 127.0.0.1 entry exists without ::1", async () => {
    let addMultipleCalled = false;
    const origStart = mitmServerInstance.start.bind(mitmServerInstance);
    const origStop = mitmServerInstance.stop.bind(mitmServerInstance);
    const origGetStatus = mitmServerInstance.getStatus.bind(mitmServerInstance);
    const origAddMultiple = mitmManager.addMultipleDns.bind(mitmManager);
    const origCheckLive = mitmManager.checkLiveDns.bind(mitmManager);

    let running = false;
    mitmServerInstance.start = async (port: number) => {
      running = true;
      return port;
    };
    mitmServerInstance.stop = async () => {
      running = false;
    };
    mitmServerInstance.getStatus = () => ({ running, port: 49195 });

    MitmRepository.setToolDnsStatus("kiro", true);

    // Live hosts has 127.0.0.1 for kiro (checkLiveDns returns true without requiring ::1)
    mitmManager.checkLiveDns = () => ({
      antigravity: false,
      kiro: true,
      copilot: false,
      cursor: false,
    });

    mitmManager.addMultipleDns = async () => {
      addMultipleCalled = true;
    };

    try {
      await mitmManager.startServer({ port: 49195 });
      assert.equal(addMultipleCalled, false, "Should not rewrite hosts or prompt when IPv4 entry exists");
    } finally {
      await mitmManager.stopServer({ keepDns: true });
      mitmServerInstance.start = origStart;
      mitmServerInstance.stop = origStop;
      mitmServerInstance.getStatus = origGetStatus;
      mitmManager.addMultipleDns = origAddMultiple;
      mitmManager.checkLiveDns = origCheckLive;
    }
  });

  it("stopServer removes DNS entries and live status reports false for all tools", async () => {
    const origRemoveAll = mitmManager.removeAllDns.bind(mitmManager);
    const origStop = mitmServerInstance.stop.bind(mitmServerInstance);
    const origCheckLive = mitmManager.checkLiveDns.bind(mitmManager);

    let liveState = {
      antigravity: true,
      kiro: true,
      copilot: false,
      cursor: false,
    };

    mitmManager.removeAllDns = async () => {
      liveState = {
        antigravity: false,
        kiro: false,
        copilot: false,
        cursor: false,
      };
    };
    mitmServerInstance.stop = async () => {};
    mitmManager.checkLiveDns = () => liveState;

    try {
      await mitmManager.stopServer({ keepDns: false });
      const status = await mitmManager.getStatus();
      assert.deepEqual(status.dnsStatus, {
        antigravity: false,
        kiro: false,
        copilot: false,
        cursor: false,
      });
    } finally {
      mitmManager.removeAllDns = origRemoveAll;
      mitmServerInstance.stop = origStop;
      mitmManager.checkLiveDns = origCheckLive;
    }
  });

  it("API toggle-server and toggle-dns return live physical dnsStatus in response", async () => {
    const app = express();
    app.use(express.json());
    app.use("/api/mitm", mitmRouter);

    const server = http.createServer(app);
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = server.address() as any;
    const testBaseUrl = `http://127.0.0.1:${address.port}`;

    const origStart = mitmServerInstance.start.bind(mitmServerInstance);
    const origStop = mitmServerInstance.stop.bind(mitmServerInstance);
    const origGetStatus = mitmServerInstance.getStatus.bind(mitmServerInstance);
    const origCheckLive = mitmManager.checkLiveDns.bind(mitmManager);
    const origAddMultiple = mitmManager.addMultipleDns.bind(mitmManager);
    const origRemoveAll = mitmManager.removeAllDns.bind(mitmManager);

    let running = false;
    mitmServerInstance.start = async (port: number) => {
      running = true;
      return port;
    };
    mitmServerInstance.stop = async () => {
      running = false;
    };
    mitmServerInstance.getStatus = () => ({ running, port: 49196 });
    mitmManager.addMultipleDns = async () => {};
    mitmManager.removeAllDns = async () => {};

    // 1. When live DNS is false, toggle-server start returns live dnsStatus
    mitmManager.checkLiveDns = () => ({
      antigravity: false,
      kiro: false,
      copilot: false,
      cursor: false,
    });

    try {
      const startRes = await fetch(`${testBaseUrl}/api/mitm/toggle-server`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ running: true, port: 49196 }),
      });
      assert.equal(startRes.status, 200);
      const startData = (await startRes.json()) as any;
      assert.equal(startData.running, true);
      assert.equal(startData.port, 49196);
      assert.deepEqual(startData.dnsStatus, {
        antigravity: false,
        kiro: false,
        copilot: false,
        cursor: false,
      });

      // 2. When stopping server, toggle-server returns live dnsStatus with running false
      const stopRes = await fetch(`${testBaseUrl}/api/mitm/toggle-server`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ running: false }),
      });
      assert.equal(stopRes.status, 200);
      const stopData = (await stopRes.json()) as any;
      assert.equal(stopData.running, false);
      assert.equal(stopData.port, 0);
      assert.deepEqual(stopData.dnsStatus, {
        antigravity: false,
        kiro: false,
        copilot: false,
        cursor: false,
      });
    } finally {
      server.close();
      mitmServerInstance.start = origStart;
      mitmServerInstance.stop = origStop;
      mitmServerInstance.getStatus = origGetStatus;
      mitmManager.checkLiveDns = origCheckLive;
      mitmManager.addMultipleDns = origAddMultiple;
      mitmManager.removeAllDns = origRemoveAll;
    }
  });

  it("ProcessManager.stopDaemon safely executes cleanup without errors", async () => {
    const res = await ProcessManager.stopDaemon(59999);
    assert.equal(typeof res.success, "boolean");
    assert.equal(typeof res.message, "string");
  });
});
