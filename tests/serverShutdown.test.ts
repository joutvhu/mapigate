import test from "node:test";
import assert from "node:assert/strict";
import express from "express";
import { serverRouter, handleShutdownRequest, handleRestartRequest } from "../src/server/routes/apiServer.js";
import { serverLifecycle } from "../src/server/lifecycle.js";

test("serverRouter - POST /api/server/shutdown responds with 200 and success message", async () => {
  serverLifecycle.reset();
  const app = express();
  app.use(express.json());
  app.use("/api/server", serverRouter);

  const server = app.listen(0);
  serverLifecycle.setServer(server);
  const address = server.address() as any;
  const port = address.port;

  try {
    const res = await fetch(`http://127.0.0.1:${port}/api/server/shutdown`, {
      method: "POST",
    });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.success, true);
    assert.ok(body.message.includes("shutting down"));
  } finally {
    await new Promise((r) => setTimeout(r, 180));
    try {
      server.close();
    } catch {
      // ignore
    }
  }
});

test("serverRouter - POST /api/shutdown alias endpoint functions identically", async () => {
  serverLifecycle.reset();
  const app = express();
  app.use(express.json());
  app.post("/api/shutdown", handleShutdownRequest);

  const server = app.listen(0);
  serverLifecycle.setServer(server);
  const address = server.address() as any;
  const port = address.port;

  try {
    const res = await fetch(`http://127.0.0.1:${port}/api/shutdown`, {
      method: "POST",
    });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.success, true);
    assert.ok(body.message.includes("shutting down"));
  } finally {
    await new Promise((r) => setTimeout(r, 180));
    try {
      server.close();
    } catch {
      // ignore
    }
  }
});

test("serverLifecycle - shutdownServer cleans up resources without throwing", async () => {
  serverLifecycle.reset();
  let closed = false;
  const mockServer = {
    close(cb?: () => void) {
      closed = true;
      if (cb) cb();
    },
  } as any;

  serverLifecycle.setServer(mockServer);
  assert.equal(serverLifecycle.getServer(), mockServer);

  // Invoke shutdown without process.exit
  await serverLifecycle.shutdownServer({ delayMs: 10, exitProcess: false });
  assert.equal(serverLifecycle.isShuttingDown(), true);
  assert.equal(closed, true);
  assert.equal(serverLifecycle.getServer(), null);
});

test("serverRouter - POST /api/server/restart responds with 200 and success message", async () => {
  serverLifecycle.reset();
  const app = express();
  app.use(express.json());
  app.use("/api/server", serverRouter);

  const server = app.listen(0);
  serverLifecycle.setServer(server);
  const address = server.address() as any;
  const port = address.port;

  try {
    const res = await fetch(`http://127.0.0.1:${port}/api/server/restart`, {
      method: "POST",
    });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.success, true);
    assert.ok(body.message.includes("restarting"));
  } finally {
    await new Promise((r) => setTimeout(r, 180));
    try {
      server.close();
    } catch {
      // ignore
    }
  }
});

test("serverRouter - POST /api/restart alias endpoint functions identically", async () => {
  serverLifecycle.reset();
  const app = express();
  app.use(express.json());
  app.post("/api/restart", handleRestartRequest);

  const server = app.listen(0);
  serverLifecycle.setServer(server);
  const address = server.address() as any;
  const port = address.port;

  try {
    const res = await fetch(`http://127.0.0.1:${port}/api/restart`, {
      method: "POST",
    });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.success, true);
    assert.ok(body.message.includes("restarting"));
  } finally {
    await new Promise((r) => setTimeout(r, 180));
    try {
      server.close();
    } catch {
      // ignore
    }
  }
});

test("serverLifecycle - restartServer cleans up resources and handles restart without throwing", async () => {
  serverLifecycle.reset();
  let closed = false;
  const mockServer = {
    close(cb?: () => void) {
      closed = true;
      if (cb) cb();
    },
    closeAllConnections() {},
  } as any;

  serverLifecycle.setServer(mockServer);
  assert.equal(serverLifecycle.getServer(), mockServer);

  // Invoke restart without process.exit
  await serverLifecycle.restartServer({ delayMs: 10, exitProcess: false });
  assert.equal(serverLifecycle.isShuttingDown(), true);
  assert.equal(closed, true);
  assert.equal(serverLifecycle.getServer(), null);
});

