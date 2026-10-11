import { describe, it } from "node:test";
import assert from "node:assert/strict";
import net from "node:net";
import {
  checkPortFree,
  inspectPortOwner,
  killProcessByPid,
  PortConflictError,
} from "../src/mitm/portConflict.js";
import { mitmManager } from "../src/mitm/manager.js";

// STRICT SAFETY GUARD: Under NO circumstances should tests use port 443.
const TEST_PORT_BASE = 18440;

function getAvailableTestPort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.listen(0, "127.0.0.1", () => {
      const addr = srv.address();
      if (!addr || typeof addr === "string") {
        srv.close(() => reject(new Error("Failed to get port")));
        return;
      }
      const port = addr.port;
      srv.close(() => resolve(port));
    });
    srv.on("error", reject);
  });
}

describe("MITM Port Conflict Management and Safety Invariants", () => {
  it("checkPortFree detects available and occupied ephemeral ports", async () => {
    const port = await getAvailableTestPort();
    assert.ok(port > 1024 && port !== 443, "Test port must be high unprivileged port");

    // 1. Initially port is free
    const initiallyFree = await checkPortFree(port);
    assert.equal(initiallyFree, true, `Port ${port} should be free initially`);

    // 2. Start a dummy listener
    const server = net.createServer();
    await new Promise<void>((resolve) => server.listen(port, "0.0.0.0", resolve));

    try {
      const nowFree = await checkPortFree(port);
      assert.equal(nowFree, false, `Port ${port} should be detected as in-use`);
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }

    // 3. After closing, port is free again
    const freedAfterClose = await checkPortFree(port);
    assert.equal(freedAfterClose, true, `Port ${port} should be free after server closed`);
  });

  it("inspectPortOwner correctly identifies free ephemeral port", async () => {
    const port = await getAvailableTestPort();
    const info = await inspectPortOwner(port);
    assert.equal(info.port, port);
    assert.equal(info.inUse, false);
  });

  it("inspectPortOwner correctly identifies active listening socket and PID", async () => {
    const port = await getAvailableTestPort();
    const server = net.createServer();
    await new Promise<void>((resolve) => server.listen(port, "0.0.0.0", resolve));

    try {
      const info = await inspectPortOwner(port);
      assert.equal(info.port, port);
      assert.equal(info.inUse, true);
      // On platforms where owner inspection succeeds, PID should match current process
      if (info.pid !== undefined) {
        assert.equal(info.pid, process.pid, "Detected PID should match current process PID");
      }
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  it("killProcessByPid rejects terminating system processes (PID <= 4) for safety", async () => {
    // PID 4 (Windows System)
    await assert.rejects(
      async () => {
        await killProcessByPid(4);
      },
      (err: any) => {
        assert.ok(err instanceof Error);
        assert.match(err.message, /Cannot terminate system process with PID 4/);
        return true;
      }
    );

    // PID 0 (System Idle)
    await assert.rejects(
      async () => {
        await killProcessByPid(0);
      },
      (err: any) => {
        assert.ok(err instanceof Error);
        assert.match(err.message, /Cannot terminate system process/);
        return true;
      }
    );

    // Negative PID
    await assert.rejects(
      async () => {
        await killProcessByPid(-1);
      },
      (err: any) => {
        assert.ok(err instanceof Error);
        return true;
      }
    );
  });

  it("PortConflictError encapsulates error code and portOwner details", () => {
    const owner = {
      port: 443,
      inUse: true,
      pid: 4,
      processName: "System",
      isSystemProcess: true,
      remediationHint: "iisreset /stop",
    };

    const err = new PortConflictError(
      "Port 443 occupied by System",
      "PORT_443_SYSTEM",
      owner
    );

    assert.equal(err.name, "PortConflictError");
    assert.equal(err.code, "PORT_443_SYSTEM");
    assert.deepEqual(err.portOwner, owner);
  });

  it("MitmManager.startServer throws PortConflictError on conflict when forceKill is false", async () => {
    const port = await getAvailableTestPort();
    const server = net.createServer();
    await new Promise<void>((resolve) => server.listen(port, "0.0.0.0", resolve));

    try {
      await assert.rejects(
        async () => {
          await mitmManager.startServer({ port, forceKill: false });
        },
        (err: any) => {
          assert.ok(
            err instanceof PortConflictError || err.name === "PortConflictError",
            "Must throw PortConflictError"
          );
          assert.equal(err.portOwner.port, port);
          assert.equal(err.portOwner.inUse, true);
          return true;
        }
      );
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });
});
