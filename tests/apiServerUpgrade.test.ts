process.env.NODE_ENV = "test";

import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import app from "../src/server/index.js";

test("Integration - POST /api/server/upgrade endpoint handling", async () => {
  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", () => resolve()));
  const address = server.address() as { port: number };
  const baseUrl = `http://127.0.0.1:${address.port}`;

  try {
    // 1. Test mock upgrade via /api/server/upgrade
    const res1 = await fetch(`${baseUrl}/api/server/upgrade`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mockTest: true, mockVersion: "1.0.0" }),
    });
    assert.equal(res1.status, 200);
    const data1 = (await res1.json()) as any;
    assert.equal(data1.success, true);
    assert.equal(data1.toVersion, "1.0.0");

    // 2. Test alias route /api/upgrade
    const res2 = await fetch(`${baseUrl}/api/upgrade`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mockTest: true, mockVersion: "1.0.1" }),
    });
    assert.equal(res2.status, 200);
    const data2 = (await res2.json()) as any;
    assert.equal(data2.success, true);
    assert.equal(data2.toVersion, "1.0.1");
  } finally {
    server.close();
  }
});
