import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import express from "express";
import { providerRouter } from "../src/server/routes/apiProviders.js";
import { ProviderRepository } from "../src/storage/repositories/providerRepo.js";
import { resolveCandidateUrls } from "../src/core/scanner/modelScanner.js";

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

        if (auth === "Bearer token-account-a") {
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(
            JSON.stringify({
              object: "list",
              data: [
                { id: "model-account-a", object: "model" },
                { id: "model-shared", object: "model" },
              ],
            })
          );
          return;
        }

        if (auth === "Bearer token-account-b") {
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(
            JSON.stringify({
              object: "list",
              data: [
                { id: "model-account-b", object: "model" },
                { id: "model-shared", object: "model" },
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

  test("model scanner isolates OpenCode Go and Zen from OpenCode Free", () => {
    // 1. Paid OpenCode Go should probe /zen/go/v1/models, NOT /zen/v1/models
    const goCandidates = resolveCandidateUrls(
      "https://opencode.ai/zen/go/v1/chat/completions",
      "openai",
      "opencode-go"
    );
    assert.ok(
      goCandidates.includes("https://opencode.ai/zen/go/v1/models"),
      "opencode-go must probe its own /zen/go/v1 endpoint"
    );
    assert.ok(
      !goCandidates.includes("https://opencode.ai/zen/v1/models"),
      "opencode-go must NOT be hijacked to free endpoint https://opencode.ai/zen/v1/models"
    );

    // 2. OpenCode Free should probe /zen/v1/models
    const freeCandidates = resolveCandidateUrls(
      "https://opencode.ai",
      "openai",
      "opencode"
    );
    assert.ok(
      freeCandidates.includes("https://opencode.ai/zen/v1/models"),
      "opencode free must probe /zen/v1/models"
    );
  });

  test("POST /api/providers/:id/scan-models returns 400 when provider has zero configured accounts", async () => {
    const providerId = `no-acc-prov-${Date.now()}`;
    ProviderRepository.saveProvider({
      id: providerId,
      name: "No Account Provider",
      baseUrl: `http://127.0.0.1:${mockPort}/v1`,
      format: "openai",
      isActive: true,
      priority: 1,
      models: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    const res = await fetch(`http://127.0.0.1:${apiPort}/api/providers/${providerId}/scan-models`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });

    assert.equal(res.status, 400);
    const body = (await res.json()) as any;
    assert.equal(body.success, false);
    assert.equal(body.noAccountsConfigured, true);
    assert.ok(body.error?.includes("No configured accounts found"));
  });

  test("POST /api/providers/:id/scan-models aggregates models across multiple accounts and deduplicates", async () => {
    const providerId = `multi-acc-api-prov-${Date.now()}`;
    ProviderRepository.saveProvider({
      id: providerId,
      name: "Multi Account API Provider",
      baseUrl: `http://127.0.0.1:${mockPort}/v1`,
      format: "openai",
      isActive: true,
      priority: 1,
      models: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    ProviderRepository.addAccount({
      id: `acc-a-${Date.now()}`,
      providerId,
      name: "Account Alpha",
      rawApiKey: "token-account-a",
    });

    ProviderRepository.addAccount({
      id: `acc-b-${Date.now()}`,
      providerId,
      name: "Account Beta",
      rawApiKey: "token-account-b",
    });

    const res = await fetch(`http://127.0.0.1:${apiPort}/api/providers/${providerId}/scan-models`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });

    assert.equal(res.status, 200);
    const body = (await res.json()) as any;
    assert.equal(body.success, true);
    assert.equal(body.count, 3);
    const ids = body.models.map((m: any) => m.id);
    assert.ok(ids.includes("model-account-a"));
    assert.ok(ids.includes("model-account-b"));
    assert.ok(ids.includes("model-shared"));
    assert.equal(body.scannedAccounts?.length, 2);
  });

  test("POST /api/providers/:id/scan-models passes region to scanner and targets regional endpoint", async () => {
    const providerId = `xmtp-api-prov-${Date.now()}`;
    ProviderRepository.saveProvider({
      id: providerId,
      name: "Xiaomi Token Plan Provider",
      baseUrl: "https://token-plan-sgp.xiaomimimo.com/v1/chat/completions",
      format: "openai",
      isActive: true,
      priority: 1,
      models: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    ProviderRepository.addAccount({
      id: `acc-xmtp-${Date.now()}`,
      providerId,
      name: "SGP Account",
      rawApiKey: "tp-sgp-key",
    });

    const origFetch = globalThis.fetch;
    let probedUrl: string | undefined;
    globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
      probedUrl = typeof input === "string" ? input : input instanceof URL ? input.href : (input as Request).url;
      if (probedUrl.includes("token-plan-ams.xiaomimimo.com")) {
        return new Response(JSON.stringify({ data: [{ id: "mimo-v2.6-pro" }] }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      return origFetch(input, init);
    };

    try {
      const res = await fetch(`http://127.0.0.1:${apiPort}/api/providers/${providerId}/scan-models`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          region: "ams",
        }),
      });

      assert.equal(res.status, 200);
      const body = (await res.json()) as any;
      assert.equal(body.success, true);
      assert.equal(body.endpointUrl, "https://token-plan-ams.xiaomimimo.com/v1/models");
      assert.equal(body.models[0].id, "mimo-v2.6-pro");
      assert.ok(probedUrl?.includes("token-plan-ams.xiaomimimo.com"));
    } finally {
      globalThis.fetch = origFetch;
    }
  });

  test("POST /api/providers/scan-models unifies registry defaultRegion for xiaomi-tokenplan", async () => {
    const origFetch = globalThis.fetch;
    let probedUrl: string | undefined;
    globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
      probedUrl = typeof input === "string" ? input : input instanceof URL ? input.href : (input as Request).url;
      if (probedUrl.includes("token-plan-sgp.xiaomimimo.com")) {
        return new Response(JSON.stringify({ data: [{ id: "mimo-v2.6-flash" }] }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      return origFetch(input, init);
    };

    try {
      const res = await fetch(`http://127.0.0.1:${apiPort}/api/providers/scan-models`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          providerId: "xiaomi-tokenplan",
          apiKey: "tp-adhoc-api-key",
        }),
      });

      assert.equal(res.status, 200);
      const body = (await res.json()) as any;
      assert.equal(body.success, true);
      assert.equal(body.endpointUrl, "https://token-plan-sgp.xiaomimimo.com/v1/models");
      assert.equal(body.models[0].id, "mimo-v2.6-flash");
      assert.ok(probedUrl?.includes("token-plan-sgp.xiaomimimo.com"));
    } finally {
      globalThis.fetch = origFetch;
    }
  });

  test("GET /api/providers/:id masks sensitive fields in providerSpecificData", async () => {
    const providerId = `psd-mask-test-${Date.now()}`;
    ProviderRepository.saveProvider({
      id: providerId,
      name: "PSD Mask Test",
      baseUrl: `http://127.0.0.1:${mockPort}/v1`,
      format: "openai",
      isActive: true,
      priority: 1,
      models: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    ProviderRepository.addAccount({
      id: `acc-psd-${Date.now()}`,
      providerId,
      name: "OAuth Account",
      rawApiKey: "sk-plain-secret",
      providerSpecificData: {
        email: "user@example.com",
        refreshToken: "secret-refresh-token-xyz",
        secretAccessKey: "secret-aws-key-123",
        region: "us-east-1",
      },
    });

    const res = await fetch(`http://127.0.0.1:${apiPort}/api/providers/${providerId}`);
    assert.equal(res.status, 200);
    const body = (await res.json()) as any;
    assert.ok(body.accounts && body.accounts.length > 0);
    const account = body.accounts[0];

    // Non-sensitive fields preserved
    assert.equal(account.providerSpecificData.email, "user@example.com");
    assert.equal(account.providerSpecificData.region, "us-east-1");

    // Sensitive fields masked
    assert.equal(account.providerSpecificData.refreshToken, "••••••••");
    assert.equal(account.providerSpecificData.secretAccessKey, "••••••••");

    // rawApiKey and apiKeyEncrypted not exposed in accounts array
    assert.equal(account.rawApiKey, undefined);
    assert.equal(account.apiKeyEncrypted, undefined);
  });
});
