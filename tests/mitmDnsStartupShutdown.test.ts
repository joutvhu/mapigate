import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mitmManager } from "../src/mitm/manager.js";
import { mitmServerInstance } from "../src/mitm/server.js";
import { MitmRepository } from "../src/storage/repositories/mitmRepo.js";

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
});
