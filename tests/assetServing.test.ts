import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import app from "../src/server/index.js";

function makeRequest(
  server: http.Server,
  path: string
): Promise<{ status: number; headers: http.IncomingHttpHeaders; body: Buffer }> {
  return new Promise((resolve, reject) => {
    const addr = server.address();
    if (!addr || typeof addr === "string") {
      return reject(new Error("Server address not available"));
    }

    const req = http.request(
      {
        host: "127.0.0.1",
        port: addr.port,
        path,
        method: "GET",
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (chunk) => chunks.push(chunk));
        res.on("end", () => {
          resolve({
            status: res.statusCode || 0,
            headers: res.headers,
            body: Buffer.concat(chunks),
          });
        });
      }
    );

    req.on("error", reject);
    req.end();
  });
}

test("Asset Serving Endpoint Tests", async (t) => {
  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", () => resolve()));

  t.after(() => {
    server.close();
  });

  await t.test("Serves /assets/providers/cursor/icon.png successfully with 200 OK", async () => {
    const res = await makeRequest(server, "/assets/providers/cursor/icon.png");
    assert.equal(res.status, 200, `Expected 200 but got ${res.status}`);
    assert.match(String(res.headers["content-type"]), /image\/png/);
    assert.ok(res.body.length > 0, "Image body must not be empty");
    assert.equal(res.headers["cache-control"], "public, max-age=86400");
  });

  await t.test("Serves /assets/tools/cursor/icon.png and /assets/cli-tools/cursor/icon.png aliases", async () => {
    const resTools = await makeRequest(server, "/assets/tools/cursor/icon.png");
    assert.equal(resTools.status, 200);
    assert.match(String(resTools.headers["content-type"]), /image\/png/);

    const resCliTools = await makeRequest(server, "/assets/cli-tools/cursor/icon.png");
    assert.equal(resCliTools.status, 200);
    assert.match(String(resCliTools.headers["content-type"]), /image\/png/);
  });

  await t.test("Gracefully resolves SVG fallback when icon.png requested for SVG-only provider", async () => {
    const res = await makeRequest(server, "/assets/providers/360ai/icon.png");
    assert.equal(res.status, 200, "Should fall back to icon.svg / 360ai.svg instead of 404");
    assert.match(String(res.headers["content-type"]), /image\/svg\+xml/);
    assert.ok(res.body.length > 0);
  });

  await t.test("Rejects path traversal attempts with 400 Bad Request", async () => {
    const res1 = await makeRequest(server, "/assets/providers/cursor/..%2f..%2fpackage.json");
    assert.equal(res1.status, 400);

    const res2 = await makeRequest(server, "/assets/providers/../icon.png");
    assert.equal(res2.status, 400);
  });

  await t.test("Returns 404 for completely unknown provider", async () => {
    const res = await makeRequest(server, "/assets/providers/completely-unknown-provider-xyz/icon.png");
    assert.equal(res.status, 404);
  });

  await t.test("Resolves provider alias like devin-cli to devin runtime asset", async () => {
    const res = await makeRequest(server, "/assets/providers/devin-cli/icon.png");
    assert.equal(res.status, 200, "devin-cli should resolve to devin asset");
    assert.match(String(res.headers["content-type"]), /image\/png/);
    assert.ok(res.body.length > 0);
  });

  await t.test("Serves clean themed SVG avatar for catalog provider without on-disk icon", async () => {
    const res = await makeRequest(server, "/assets/providers/pollinations/icon.png");
    assert.equal(res.status, 200);
    assert.match(String(res.headers["content-type"]), /image\/svg\+xml/);
    assert.ok(res.body.toString("utf8").includes("<svg"));
  });
});
