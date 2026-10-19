import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mitmManager } from "../src/mitm/manager.js";
import { mitmServerInstance } from "../src/mitm/server.js";

describe("Safe Teardown Ordering & Startup Rollback", () => {
  it("stopServer triggers DNS cleanup before server close", async () => {
    const order: string[] = [];

    const origRemoveAll = mitmManager.removeAllDns.bind(mitmManager);
    const origStop = mitmServerInstance.stop.bind(mitmServerInstance);

    mitmManager.removeAllDns = async () => {
      order.push("dns-cleanup");
    };

    mitmServerInstance.stop = async () => {
      order.push("server-stop");
    };

    try {
      await mitmManager.stopServer();
      assert.deepEqual(order, ["dns-cleanup", "server-stop"]);
    } finally {
      mitmManager.removeAllDns = origRemoveAll;
      mitmServerInstance.stop = origStop;
    }
  });

  it("startServer does not trigger DNS cleanup or elevation if binding fails", async () => {
    let dnsCleanedUp = false;

    const origRemoveAll = mitmManager.removeAllDns.bind(mitmManager);
    const origStart = mitmServerInstance.start.bind(mitmServerInstance);

    mitmManager.removeAllDns = async () => {
      dnsCleanedUp = true;
    };

    mitmServerInstance.start = async () => {
      throw new Error("EADDRINUSE: address already in use 0.0.0.0:39182");
    };

    try {
      await assert.rejects(
        async () => {
          await mitmManager.startServer({ port: 39182 });
        },
        (err: any) => {
          assert.equal(err.name, "PortConflictError");
          assert.ok(err.message.includes("EADDRINUSE"));
          return true;
        }
      );
      assert.equal(dnsCleanedUp, false, "DNS cleanup should not be triggered when startup fails to avoid spurious elevation");
    } finally {
      mitmManager.removeAllDns = origRemoveAll;
      mitmServerInstance.start = origStart;
    }
  });
});
