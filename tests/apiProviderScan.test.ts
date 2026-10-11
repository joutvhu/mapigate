import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import express from "express";
import { providerRouter } from "../src/server/routes/apiProviders.js";
import { ProviderRepository } from "../src/storage/repositories/providerRepo.js";

describe("API Provider Scan Endpoints", () => {
  let mockUpstream: http.Server;
  let mockPort: number;

  let apiServer: http.Server;
  let apiPort: number;

  before(async () => {
    // 1. Mock upstream server returning models
    mockUpstream = http.createServer((req, res) => {
      const url = req.url || "";
      const auth = req.headers["authorization"];

      if (url === "/v1/models" || url === "/models") {
        if (auth === "Bearer valid-token") {
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(
            JSON.stringify({
              object: "list",
              data: [
                { id: "upstream-claude-3-7", object: "model" },
                { id: "upstream-deepseek-r1", object: "model" },
              ],
            })
          );
          return;
        }

        if (auth === "Bearer invalid-token") {
          res.writeHead(401, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: { message: "Invalid API key" } }));
          return;
        }

        // Public/no auth response
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(
          JSON.stringify({
            data: [{ id: "public-model-1" }],
          })
        );
        return;
      }

      res.writeHead(404, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Not found" }));
    });

    await new Promise<void>((resolve) => {
      mockUpstream.listen(0, "127.0.0.1", () => {
        const addr = mockUpstream.address();
        if (addr && typeof addr === "object") {
          mockPort = addr.port;
        }
        resolve();
      });
    });

    // 2. Express server hosting providerRouter
    const app = express();
    app.use(express.json());
    app.use("/api/providers", providerRouter);

    apiServer = http.createServer(app);
    await new Promise<void>((resolve) => {
      apiServer.listen(0, "127.0.0.1", () => {
        const addr = apiServer.address();
        if (addr && typeof addr === "object") {
          apiPort = addr.port;
        }
        resolve();
      });
    });
  });

  after(async () => {
    await new Promise<void>((resolve) => {
      mockUpstream.close(() => resolve());
    });
    await new Promise<void>((resolve) => {
      apiServer.close(() => resolve());
    });
  });

  test("POST /api/providers/scan-models succeeds with valid baseUrl and apiKey", async () => {
    const res = await fetch(`http://127.0.0.1:${apiPort}/api/providers/scan-models`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        baseUrl: `http://127.0.0.1:${mockPort}/v1`,
        apiKey: "valid-token",
      }),
    });

    assert.equal(res.status, 200);
    const body = (await res.json()) as any;
    assert.equal(body.success, true);
    assert.equal(body.count, 2);
    assert.equal(body.models[0].id, "upstream-claude-3-7");
    assert.equal(body.models[1].id, "upstream-deepseek-r1");
  });

  test("POST /api/providers/scan-models returns 400 when missing baseUrl and providerId", async () => {
    const res = await fetch(`http://127.0.0.1:${apiPort}/api/providers/scan-models`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });

    assert.equal(res.status, 400);
    const body = (await res.json()) as any;
    assert.equal(body.success, false);
    assert.ok(body.error?.includes("Either providerId or baseUrl is required"));
  });

  test("POST /api/providers/scan-models returns 401 on authentication failure", async () => {
    const res = await fetch(`http://127.0.0.1:${apiPort}/api/providers/scan-models`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        baseUrl: `http://127.0.0.1:${mockPort}/v1`,
        apiKey: "invalid-token",
      }),
    });

    assert.equal(res.status, 401);
    const body = (await res.json()) as any;
    assert.equal(body.success, false);
    assert.ok(body.error?.includes("Authentication failed"));
  });

  test("POST /api/providers/:id/scan-models scans configured provider with stored account", async () => {
    const providerId = `test-prov-${Date.now()}`;
    ProviderRepository.saveProvider({
      id: providerId,
      name: "Test Upstream Provider",
      baseUrl: `http://127.0.0.1:${mockPort}/v1`,
      format: "openai",
      isActive: true,
      priority: 1,
      models: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    ProviderRepository.addAccount({
      id: `acc-${Date.now()}`,
      providerId,
      name: "Main Key",
      rawApiKey: "valid-token",
    });

    const res = await fetch(`http://127.0.0.1:${apiPort}/api/providers/${providerId}/scan-models`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });

    assert.equal(res.status, 200);
    const body = (await res.json()) as any;
    assert.equal(body.success, true);
    assert.equal(body.count, 2);
    assert.equal(body.models[0].id, "upstream-claude-3-7");
  });

  test("POST /api/providers/:id/scan-models returns 404 for unknown provider without baseUrl", async () => {
    const res = await fetch(
      `http://127.0.0.1:${apiPort}/api/providers/unknown-random-provider-xyz/scan-models`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      }
    );

    assert.equal(res.status, 404);
    const body = (await res.json()) as any;
    assert.equal(body.success, false);
    assert.ok(body.error?.includes("not found"));
  });

  test("preserving provider configuration when updating models", async () => {
    const providerId = `preserve-prov-${Date.now()}`;
    ProviderRepository.saveProvider({
      id: providerId,
      name: "Preserved Provider",
      baseUrl: "https://api.custom.com/v1",
      format: "openai",
      isActive: true,
      priority: 42,
      customHeaders: { "X-Custom-Routing": "route-1" },
      proxyUrl: "http://127.0.0.1:8080",
      models: ["old-model"],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    // Simulate saveProviderModels pattern
    const getRes = await fetch(`http://127.0.0.1:${apiPort}/api/providers/${providerId}`);
    assert.equal(getRes.status, 200);
    const current = (await getRes.json()) as any;
    assert.equal(current.priority, 42);
    assert.equal(current.customHeaders["X-Custom-Routing"], "route-1");
    assert.equal(current.proxyUrl, "http://127.0.0.1:8080");

    const updateRes = await fetch(`http://127.0.0.1:${apiPort}/api/providers`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...current,
        id: providerId,
        models: ["scanned-model-1", "scanned-model-2"],
      }),
    });
    assert.equal(updateRes.status, 200);

    const saved = ProviderRepository.getProviderById(providerId);
    assert.ok(saved);
    assert.equal(saved.priority, 42);
    assert.equal(saved.customHeaders?.["X-Custom-Routing"], "route-1");
    assert.equal(saved.proxyUrl, "http://127.0.0.1:8080");
    assert.deepEqual(saved.models, ["scanned-model-1", "scanned-model-2"]);
  });
});
