import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import express from "express";
import { modelRouter, handleOpenAiModelsList } from "../src/server/routes/apiModels.js";
import { ProviderRepository } from "../src/storage/repositories/providerRepo.js";
import { PROVIDER_REGISTRY } from "../src/shared/constants/providerRegistry.js";

describe("Model Prioritization - Scanned & DB Models", () => {
  let server: http.Server;
  let serverPort: number;

  before(async () => {
    const app = express();
    app.use(express.json());
    app.use("/api/models", modelRouter);
    app.get("/v1/models", handleOpenAiModelsList);

    server = http.createServer(app);
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

  test("GET /api/models/available prioritizes database models over registry presets", async () => {
    // Pick an existing registry provider id, e.g. 'xkiro' or 'openai'
    const targetProviderId = "xkiro";
    const customScannedModels = [
      "claude-3-7-sonnet-20250219-custom-scanned",
      "deepseek-r1-distill-custom",
    ];

    // Configure this provider in DB with custom scanned models
    ProviderRepository.saveProvider({
      id: targetProviderId,
      name: "xKiro Scanned",
      baseUrl: "https://api.xkiro.com/v1",
      format: "openai",
      isActive: true,
      priority: 1,
      models: customScannedModels,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    // Add an account so it counts as connected
    ProviderRepository.addAccount({
      id: `acc-prioritize-${Date.now()}`,
      providerId: targetProviderId,
      name: "Account 1",
      rawApiKey: "key-123",
    });

    const res = await fetch(`http://127.0.0.1:${serverPort}/api/models/available?connectedOnly=true`);
    assert.equal(res.status, 200);
    const models = (await res.json()) as any[];

    // Verify custom models exist under this provider
    const xkiroModels = models.filter((m) => m.providerId === targetProviderId);
    assert.equal(xkiroModels.length, 2);
    assert.equal(xkiroModels[0].id, customScannedModels[0]);
    assert.equal(xkiroModels[1].id, customScannedModels[1]);

    // Verify capabilities are resolved dynamically
    assert.ok(typeof xkiroModels[0].caps === "object");
    assert.ok(typeof xkiroModels[0].caps.reasoning === "boolean");
  });

  test("GET /v1/models exposes database-prioritized models", async () => {
    const res = await fetch(`http://127.0.0.1:${serverPort}/v1/models`);
    assert.equal(res.status, 200);
    const body = (await res.json()) as { object: string; data: Array<{ id: string; owned_by: string }> };

    assert.equal(body.object, "list");
    const foundCustom = body.data.some(
      (m) => m.id === "xkiro/claude-3-7-sonnet-20250219-custom-scanned"
    );
    assert.ok(foundCustom, "Scanned model must be exposed in /v1/models");
  });
});
