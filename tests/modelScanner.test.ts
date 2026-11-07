import { test, it, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import {
  resolveCandidateUrls,
  extractModelsFromPayload,
  scanProviderModels,
} from "../src/core/scanner/modelScanner.js";
import { ProviderRepository } from "../src/storage/repositories/providerRepo.js";

describe("Model Scanner - Candidate URL Resolution", () => {
  test("preserves explicit /models endpoint without alteration for standard providers", () => {
    const urls = resolveCandidateUrls("https://api.xkiro.com/v1/models");
    assert.deepEqual(urls, ["https://api.xkiro.com/v1/models"]);
  });

  test("strips /usage path and probes /models for usage-validated providers", () => {
    const urls = resolveCandidateUrls("https://api.xkiro.com/v1/usage");
    assert.ok(urls.includes("https://api.xkiro.com/v1/models"));
    assert.ok(!urls.some((u) => u.includes("/usage/models")));
  });

  test("resolves Xiaomi endpoint to regional token-plan URL defaulting to sgp", () => {
    const urls = resolveCandidateUrls("https://token-plan-sgp.xiaomimimo.com/v1/models", undefined, "xiaomi-tokenplan");
    assert.equal(urls[0], "https://token-plan-sgp.xiaomimimo.com/v1/models");
    assert.ok(urls.includes("https://token-plan-cn.xiaomimimo.com/v1/models"));
    assert.ok(urls.includes("https://token-plan-ams.xiaomimimo.com/v1/models"));
  });

  test("retains custom reverse-proxy host for xiaomi-tokenplan without bypassing to xiaomimimo.com", () => {
    const urls = resolveCandidateUrls(
      "http://ai-proxy.corp/v1",
      undefined,
      "xiaomi-tokenplan"
    );
    assert.deepEqual(urls, [
      "http://ai-proxy.corp/v1/models",
      "http://ai-proxy.corp/models",
    ]);
    assert.ok(!urls.some((u) => u.includes("xiaomimimo.com")));

    const urlsSuffix = resolveCandidateUrls(
      "http://ai-proxy.corp/v1/chat/completions",
      undefined,
      "xiaomi-tokenplan"
    );
    assert.deepEqual(urlsSuffix, [
      "http://ai-proxy.corp/v1/models",
      "http://ai-proxy.corp/models",
    ]);
    assert.ok(!urlsSuffix.some((u) => u.includes("xiaomimimo.com")));
  });

  test("resolves Xiaomi candidate URLs prioritizing region parameter", () => {
    const urlsCn = resolveCandidateUrls(
      "https://token-plan-sgp.xiaomimimo.com/v1/chat/completions",
      undefined,
      "xiaomi-tokenplan",
      undefined,
      "cn"
    );
    assert.equal(urlsCn[0], "https://token-plan-cn.xiaomimimo.com/v1/models");
    assert.ok(urlsCn.includes("https://token-plan-sgp.xiaomimimo.com/v1/models"));
    assert.ok(urlsCn.includes("https://token-plan-ams.xiaomimimo.com/v1/models"));

    const urlsAms = resolveCandidateUrls(
      "https://token-plan-sgp.xiaomimimo.com/v1/chat/completions",
      undefined,
      "xiaomi-tokenplan",
      undefined,
      "ams"
    );
    assert.equal(urlsAms[0], "https://token-plan-ams.xiaomimimo.com/v1/models");
    assert.ok(urlsAms.includes("https://token-plan-sgp.xiaomimimo.com/v1/models"));
    assert.ok(urlsAms.includes("https://token-plan-cn.xiaomimimo.com/v1/models"));

    const urlsMimo = resolveCandidateUrls(
      "https://api.xiaomimimo.com/v1/chat/completions",
      undefined,
      "xiaomi-mimo"
    );
    assert.equal(urlsMimo[0], "https://api.xiaomimimo.com/v1/models");
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

  test("extracts models from nested { code: 0, data: [...] } and { data: { list: [...] } }", () => {
    const payloadCode0 = {
      code: 0,
      data: [{ id: "mimo-v2.6-pro" }, { id: "mimo-v2.6-flash" }],
    };
    const models1 = extractModelsFromPayload(payloadCode0);
    assert.equal(models1.length, 2);
    assert.equal(models1[0].id, "mimo-v2.6-pro");
    assert.equal(models1[1].id, "mimo-v2.6-flash");

    const payloadNestedList = {
      code: 0,
      data: {
        list: [{ id: "nested-mimo-pro" }],
      },
    };
    const models2 = extractModelsFromPayload(payloadNestedList);
    assert.equal(models2.length, 1);
    assert.equal(models2[0].id, "nested-mimo-pro");
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

  it("successfully scans models from mock endpoint with credentials", async () => {
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

  it("returns descriptive auth error when API key is rejected", async () => {
    const result = await scanProviderModels({
      baseUrl: `http://127.0.0.1:${serverPort}/v1/auth-fail`,
      apiKey: "bad-key",
    });

    assert.equal(result.success, false);
    assert.equal(result.count, 0);
    assert.ok(result.error?.includes("Authentication failed"));
  });

  it("falls back to secondary candidate URL when primary returns 404", async () => {
    const result = await scanProviderModels({
      baseUrl: `http://127.0.0.1:${serverPort}/probe/fallback`,
    });

    assert.equal(result.success, true);
    assert.equal(result.count, 1);
    assert.equal(result.models[0].id, "fallback-model");
  });

  it("sends x-goog-api-key when scanning Gemini endpoints", async () => {
    const result = await scanProviderModels({
      baseUrl: `http://127.0.0.1:${serverPort}/v1beta/gemini-probe`,
      format: "gemini",
      apiKey: "gemini-secret-456",
    });

    assert.equal(result.success, true);
    assert.equal(result.count, 1);
    assert.equal(result.models[0].id, "gemini-2.0-flash");
  });

  it("returns clean error on unreachable host", async () => {
    const result = await scanProviderModels({
      baseUrl: "http://127.0.0.1:59999",
      timeoutMs: 1000,
    });

    assert.equal(result.success, false);
    assert.ok(result.error);
  });

  it("returns noAccountsConfigured when providerId has zero accounts", async () => {
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

  it("aggregates models across multiple accounts and tolerates partial failure", async () => {
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
    // Failed accounts should surface Bad Account
    assert.equal(result.failedAccounts?.length, 1);
    assert.equal(result.failedAccounts?.[0].name, "Bad Account");
  });

  it("uses account-specific region from providerSpecificData when scanning", async () => {
    const providerId = `xmtp-test-${Date.now()}`;
    ProviderRepository.saveProvider({
      id: providerId,
      name: "Xiaomi Token Plan Regional",
      baseUrl: "https://token-plan-sgp.xiaomimimo.com/v1/chat/completions",
      format: "openai",
      isActive: true,
      priority: 1,
      models: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    ProviderRepository.addAccount({
      id: `acc-ams-${Date.now()}`,
      providerId,
      name: "AMS Account",
      rawApiKey: "tp-ams-token",
      providerSpecificData: { region: "ams" },
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
      const result = await scanProviderModels({ providerId });
      assert.equal(result.success, true);
      assert.equal(result.endpointUrl, "https://token-plan-ams.xiaomimimo.com/v1/models");
      assert.equal(result.models.length, 1);
      assert.equal(result.models[0].id, "mimo-v2.6-pro");
      assert.ok(probedUrl?.includes("token-plan-ams.xiaomimimo.com"));
    } finally {
      globalThis.fetch = origFetch;
    }
  });

  it("sends Authorization Bearer and omits x-api-key for xiaomi-tokenplan", async () => {
    const providerId = `xmtp-headers-${Date.now()}`;
    ProviderRepository.saveProvider({
      id: providerId,
      name: "Xiaomi Token Plan Auth Test",
      baseUrl: "https://token-plan-sgp.xiaomimimo.com/v1/chat/completions",
      format: "openai",
      isActive: true,
      priority: 1,
      models: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    ProviderRepository.addAccount({
      id: `acc-sgp-${Date.now()}`,
      providerId,
      name: "SGP Account",
      rawApiKey: "tp-sgp-secret-key",
    });

    const origFetch = globalThis.fetch;
    let capturedHeaders: Record<string, string> = {};
    globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
      const h = init?.headers as Record<string, string> | undefined;
      if (h) {
        capturedHeaders = { ...h };
      }
      return new Response(JSON.stringify({ data: [{ id: "mimo-v2.6-flash" }] }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    };

    try {
      const result = await scanProviderModels({ providerId });
      assert.equal(result.success, true);
      assert.equal(capturedHeaders["Authorization"], "Bearer tp-sgp-secret-key");
      assert.equal(capturedHeaders["x-api-key"], undefined);
      assert.equal(capturedHeaders["X-API-KEY"], undefined);
    } finally {
      globalThis.fetch = origFetch;
    }
  });

  it("continues probing fallback regional endpoints when primary returns 200 with 0 models or error JSON", async () => {
    const providerId = `xmtp-fallback-${Date.now()}`;
    ProviderRepository.saveProvider({
      id: providerId,
      name: "Xiaomi Token Plan Fallback Probe",
      baseUrl: "https://token-plan-sgp.xiaomimimo.com/v1/chat/completions",
      format: "openai",
      isActive: true,
      priority: 1,
      models: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    ProviderRepository.addAccount({
      id: `acc-fallback-${Date.now()}`,
      providerId,
      name: "Probe Account",
      rawApiKey: "tp-probe-key",
      // default region sgp will be tried first, but sgp returns cluster mismatch error code
    });

    const origFetch = globalThis.fetch;
    const probedUrls: string[] = [];
    globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.href : (input as Request).url;
      probedUrls.push(url);
      if (url.includes("token-plan-sgp.xiaomimimo.com")) {
        // Returns 200 with error payload / 0 models
        return new Response(JSON.stringify({ code: 10001, message: "Cluster mismatch for token" }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      if (url.includes("token-plan-cn.xiaomimimo.com")) {
        // Fallback cluster succeeds
        return new Response(JSON.stringify({ data: [{ id: "mimo-v2.6-pro" }] }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      return origFetch(input, init);
    };

    try {
      const result = await scanProviderModels({ providerId });
      assert.equal(result.success, true);
      assert.equal(result.endpointUrl, "https://token-plan-cn.xiaomimimo.com/v1/models");
      assert.equal(result.models.length, 1);
      assert.equal(result.models[0].id, "mimo-v2.6-pro");
      assert.ok(probedUrls.some((u) => u.includes("token-plan-sgp.xiaomimimo.com")));
      assert.ok(probedUrls.some((u) => u.includes("token-plan-cn.xiaomimimo.com")));
    } finally {
      globalThis.fetch = origFetch;
    }
  });

  it("unifies defaultRegion fallback when scanning xiaomi-tokenplan without explicit region", async () => {
    const origFetch = globalThis.fetch;
    let probedUrl: string | undefined;
    globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
      probedUrl = typeof input === "string" ? input : input instanceof URL ? input.href : (input as Request).url;
      return new Response(JSON.stringify({ data: [{ id: "mimo-v2.6-flash" }] }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    };

    try {
      // Calling ad-hoc with providerId: "xiaomi-tokenplan" and apiKey
      const result = await scanProviderModels({
        providerId: "xiaomi-tokenplan",
        apiKey: "tp-adhoc-key",
      });
      assert.equal(result.success, true);
      // Registry defaultRegion is "sgp", so primary candidate is sgp
      assert.equal(result.endpointUrl, "https://token-plan-sgp.xiaomimimo.com/v1/models");
      assert.ok(probedUrl?.includes("token-plan-sgp.xiaomimimo.com"));
    } finally {
      globalThis.fetch = origFetch;
    }
  });
});
