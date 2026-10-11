import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import {
  resolveCandidateUrls,
  extractModelsFromPayload,
  scanProviderModels,
} from "../src/core/scanner/modelScanner.js";
import { ProviderRepository } from "../src/storage/repositories/providerRepo.js";

describe("Model Scanner - Candidate URL Resolution", () => {
  test("preserves explicit /models endpoint without alteration", () => {
    const urls = resolveCandidateUrls("https://api.xiaomimimo.com/v1/models");
    assert.deepEqual(urls, ["https://api.xiaomimimo.com/v1/models"]);
  });

  test("preserves explicit /api/tags endpoint for Ollama", () => {
    const urls = resolveCandidateUrls("http://localhost:11434/api/tags");
    assert.deepEqual(urls, ["http://localhost:11434/api/tags"]);
  });

  test("resolves baseUrls ending with /v1 to /models and parent /models", () => {
    const urls = resolveCandidateUrls("https://api.xkiro.com/v1");
    assert.deepEqual(urls, [
      "https://api.xkiro.com/v1/models",
      "https://api.xkiro.com/models",
    ]);
  });

  test("resolves domain baseUrls to /v1/models then /models", () => {
    const urls = resolveCandidateUrls("https://api.xkiro.com");
    assert.deepEqual(urls, [
      "https://api.xkiro.com/v1/models",
      "https://api.xkiro.com/models",
    ]);
  });

  test("strips /chat/completions suffix to find /models", () => {
    const urls = resolveCandidateUrls("https://apihub.agnes-ai.com/v1/chat/completions");
    assert.ok(urls.includes("https://apihub.agnes-ai.com/v1/models"));
    assert.ok(!urls.some((u) => u.includes("/chat/completions/")));
  });

  test("strips /messages suffix to find /models", () => {
    const urls = resolveCandidateUrls("https://api.anthropic.com/v1/messages");
    assert.ok(urls.includes("https://api.anthropic.com/v1/models"));
    assert.ok(!urls.some((u) => u.includes("/messages/")));
  });

  test("includes /api/tags for Ollama format", () => {
    const urls = resolveCandidateUrls("http://127.0.0.1:11434", "ollama");
    assert.ok(urls.includes("http://127.0.0.1:11434/api/tags"));
    assert.ok(urls.includes("http://127.0.0.1:11434/v1/models"));
  });
});

describe("Model Scanner - Response Payload Extraction", () => {
  test("extracts models from OpenAI standard format { data: [...] }", () => {
    const payload = {
      object: "list",
      data: [
        { id: "gpt-4o", object: "model", created: 1715368132, owned_by: "system" },
        { id: "gpt-4o-mini", object: "model", created: 1715368133, owned_by: "system" },
      ],
    };
    const models = extractModelsFromPayload(payload);
    assert.equal(models.length, 2);
    assert.equal(models[0].id, "gpt-4o");
    assert.equal(models[1].id, "gpt-4o-mini");
  });

  test("extracts models from Ollama format { models: [...] }", () => {
    const payload = {
      models: [
        { name: "llama3.2:latest", model: "llama3.2:latest", size: 2019393189 },
        { name: "deepseek-r1:14b", model: "deepseek-r1:14b", size: 9000000000 },
      ],
    };
    const models = extractModelsFromPayload(payload);
    assert.equal(models.length, 2);
    assert.equal(models[0].id, "llama3.2:latest");
    assert.equal(models[1].id, "deepseek-r1:14b");
  });

  test("extracts models from Gemini format stripping models/ prefix", () => {
    const payload = {
      models: [
        { name: "models/gemini-1.5-pro", displayName: "Gemini 1.5 Pro" },
        { name: "models/gemini-1.5-flash", displayName: "Gemini 1.5 Flash" },
      ],
    };
    const models = extractModelsFromPayload(payload);
    assert.equal(models.length, 2);
    assert.equal(models[0].id, "gemini-1.5-pro");
    assert.equal(models[0].name, "Gemini 1.5 Pro");
    assert.equal(models[1].id, "gemini-1.5-flash");
  });

  test("extracts models from bare array of string identifiers", () => {
    const payload = ["claude-3-7-sonnet", "deepseek-reasoner", "o3-mini"];
    const models = extractModelsFromPayload(payload);
    assert.equal(models.length, 3);
    assert.equal(models[0].id, "claude-3-7-sonnet");
    assert.equal(models[1].id, "deepseek-reasoner");
    assert.equal(models[2].id, "o3-mini");
  });

  test("extracts models from { result: [...] } or { items: [...] }", () => {
    const payload = {
      result: [{ id: "model-alpha" }, { id: "model-beta" }],
    };
    const models = extractModelsFromPayload(payload);
    assert.equal(models.length, 2);
    assert.equal(models[0].id, "model-alpha");
    assert.equal(models[1].id, "model-beta");
  });

  test("handles empty or invalid payload gracefully without throwing", () => {
    assert.deepEqual(extractModelsFromPayload(null), []);
    assert.deepEqual(extractModelsFromPayload({}), []);
    assert.deepEqual(extractModelsFromPayload("not an object"), []);
  });
});

describe("Model Scanner - Network Probing & Error Handling", () => {
  let server: http.Server;
  let serverPort: number;

  before(async () => {
    server = http.createServer((req, res) => {
      const url = req.url || "";
      const auth = req.headers["authorization"];

      if (url === "/v1/auth-fail/models") {
        res.writeHead(401, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Invalid API key" }));
        return;
      }

      if (url === "/v1/success/models") {
        if (auth !== "Bearer secret-123") {
          res.writeHead(401, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: "Unauthorized" }));
          return;
        }
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(
          JSON.stringify({
            object: "list",
            data: [
              { id: "custom-deepseek-v3", name: "DeepSeek V3 Custom" },
              { id: "custom-qwen-2.5", name: "Qwen 2.5 72B" },
            ],
          })
        );
        return;
      }

      if (url === "/multi-acc/models") {
        if (auth === "Bearer acc-good-1") {
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ data: [{ id: "model-from-acc-1" }, { id: "shared-model" }] }));
          return;
        }
        if (auth === "Bearer acc-good-2") {
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ data: [{ id: "model-from-acc-2" }, { id: "shared-model" }] }));
          return;
        }
        if (auth === "Bearer acc-bad") {
          res.writeHead(401, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: "Unauthorized" }));
          return;
        }
      }

      if (url === "/probe/fallback/models") {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ data: [{ id: "fallback-model" }] }));
        return;
      }

      if (url === "/v1beta/gemini-probe/models") {
        const googKey = req.headers["x-goog-api-key"];
        if (googKey !== "gemini-secret-456") {
          res.writeHead(401, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: "Missing or invalid x-goog-api-key" }));
          return;
        }
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(
          JSON.stringify({
            models: [
              { name: "models/gemini-2.0-flash", displayName: "Gemini 2.0 Flash" },
            ],
          })
        );
        return;
      }

      res.writeHead(404, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Not Found" }));
    });

    await new Promise<void>((resolve) => {
      server.listen(0, "127.0.0.1", () => {
        const addr = server.address();
        if (addr && typeof addr === "object") {
          serverPort = addr.port;
        }
        resolve();
      });
    });
  });

  after(async () => {
    await new Promise<void>((resolve) => {
      server.close(() => resolve());
    });
  });

  test("successfully scans models from mock endpoint with credentials", async () => {
    const result = await scanProviderModels({
      baseUrl: `http://127.0.0.1:${serverPort}/v1/success`,
      apiKey: "secret-123",
    });

    assert.equal(result.success, true);
    assert.equal(result.count, 2);
    assert.equal(result.models[0].id, "custom-deepseek-v3");
    assert.equal(result.models[1].id, "custom-qwen-2.5");
    assert.ok(result.endpointUrl?.includes("/models"));
  });

  test("returns descriptive auth error when API key is rejected", async () => {
    const result = await scanProviderModels({
      baseUrl: `http://127.0.0.1:${serverPort}/v1/auth-fail`,
      apiKey: "bad-key",
    });

    assert.equal(result.success, false);
    assert.equal(result.count, 0);
    assert.ok(result.error?.includes("Authentication failed"));
  });

  test("falls back to secondary candidate URL when primary returns 404", async () => {
    const result = await scanProviderModels({
      baseUrl: `http://127.0.0.1:${serverPort}/probe/fallback`,
    });

    assert.equal(result.success, true);
    assert.equal(result.count, 1);
    assert.equal(result.models[0].id, "fallback-model");
  });

  test("sends x-goog-api-key when scanning Gemini endpoints", async () => {
    const result = await scanProviderModels({
      baseUrl: `http://127.0.0.1:${serverPort}/v1beta/gemini-probe`,
      format: "gemini",
      apiKey: "gemini-secret-456",
    });

    assert.equal(result.success, true);
    assert.equal(result.count, 1);
    assert.equal(result.models[0].id, "gemini-2.0-flash");
  });

  test("returns clean error on unreachable host", async () => {
    const result = await scanProviderModels({
      baseUrl: "http://127.0.0.1:59999",
      timeoutMs: 1000,
    });

    assert.equal(result.success, false);
    assert.ok(result.error);
  });

  test("returns noAccountsConfigured when providerId has zero accounts", async () => {
    const providerId = `zero-acc-prov-${Date.now()}`;
    ProviderRepository.saveProvider({
      id: providerId,
      name: "Zero Accounts Provider",
      baseUrl: `http://127.0.0.1:${serverPort}/multi-acc`,
      format: "openai",
      isActive: true,
      priority: 1,
      models: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    const result = await scanProviderModels({ providerId });
    assert.equal(result.success, false);
    assert.equal(result.noAccountsConfigured, true);
    assert.ok(result.error?.includes("No configured accounts found"));
  });

  test("aggregates models across multiple accounts and tolerates partial failure", async () => {
    const providerId = `multi-acc-prov-${Date.now()}`;
    ProviderRepository.saveProvider({
      id: providerId,
      name: "Multi Account Provider",
      baseUrl: `http://127.0.0.1:${serverPort}/multi-acc`,
      format: "openai",
      isActive: true,
      priority: 1,
      models: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    // Account 1: good key, produces model-from-acc-1 and shared-model
    ProviderRepository.addAccount({
      id: `acc-1-${Date.now()}`,
      providerId,
      name: "Account 1",
      rawApiKey: "acc-good-1",
    });

    // Account 2: bad key, fails auth
    ProviderRepository.addAccount({
      id: `acc-bad-${Date.now()}`,
      providerId,
      name: "Bad Account",
      rawApiKey: "acc-bad",
    });

    // Account 3: good key, produces model-from-acc-2 and shared-model
    ProviderRepository.addAccount({
      id: `acc-2-${Date.now()}`,
      providerId,
      name: "Account 2",
      rawApiKey: "acc-good-2",
    });

    const result = await scanProviderModels({ providerId });
    assert.equal(result.success, true);
    // Should aggregate and deduplicate: model-from-acc-1, shared-model, model-from-acc-2
    assert.equal(result.count, 3);
    const modelIds = result.models.map((m) => m.id);
    assert.ok(modelIds.includes("model-from-acc-1"));
    assert.ok(modelIds.includes("model-from-acc-2"));
    assert.ok(modelIds.includes("shared-model"));
    // Scanned accounts should include Account 1 and Account 2, but not Bad Account
    assert.equal(result.scannedAccounts?.length, 2);
    const scannedNames = result.scannedAccounts?.map((a) => a.name);
    assert.ok(scannedNames?.includes("Account 1"));
    assert.ok(scannedNames?.includes("Account 2"));
  });
});
