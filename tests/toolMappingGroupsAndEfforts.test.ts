process.env.NODE_ENV = "test";

import test, { before, beforeEach, after } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import express from "express";
import { getDatabase } from "../src/storage/database.js";
import { ToolMappingRepository } from "../src/storage/repositories/toolMappingRepo.js";
import { ComboRepository } from "../src/storage/repositories/comboRepo.js";
import { ProviderRepository } from "../src/storage/repositories/providerRepo.js";
import { SettingsRepository } from "../src/storage/repositories/settingsRepo.js";
import { handleOpenAiModelsList } from "../src/server/routes/apiModels.js";
import { cliToolsRouter } from "../src/server/routes/apiCliTools.js";
import { simulateModelRoute } from "../src/server/proxy/routeSimulator.js";
import { runProxyPipeline } from "../src/server/proxy/pipeline.js";
import { handleCountTokens } from "../src/server/proxy/countTokens.js";
import { ProviderRegistry } from "../src/providers/core/registry.js";
import { CodexProvider } from "../src/providers/runtime/codex/provider.js";

function createTestServer() {
  const app = express();
  app.use(express.json());
  app.use("/api/model-mappings", cliToolsRouter);
  app.get("/v1/models", handleOpenAiModelsList);
  return app;
}

async function requestJson(app: express.Express, method: string, path: string, body?: any) {
  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", () => resolve()));
  const { port } = server.address() as any;
  try {
    const res = await fetch(`http://127.0.0.1:${port}${path}`, {
      method,
      headers: { "Content-Type": "application/json" },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });
    return { status: res.status, data: await res.json() };
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
}

let originalExposureMode: ReturnType<typeof SettingsRepository.getModelExposureMode> = "all";

before(() => {
  originalExposureMode = SettingsRepository.getModelExposureMode();
});

beforeEach(() => {
  const db = getDatabase();
  db.run("DELETE FROM tool_mappings");
  db.run("DELETE FROM combos");
  db.run("DELETE FROM providers WHERE id = 'codex'");
  ProviderRepository.ensureProviderExists("codex");
  SettingsRepository.setModelExposureMode("mapped_only");
});

after(() => {
  const db = getDatabase();
  db.run("DELETE FROM tool_mappings");
  db.run("DELETE FROM combos");
  SettingsRepository.setModelExposureMode(originalExposureMode);
});

test("Migration v23 adds group_name, is_enabled, and effort_targets to tool_mappings", () => {
  const db = getDatabase();
  const cols = db.all<{ name: string }>("PRAGMA table_info(tool_mappings)").map((c) => c.name);
  assert.ok(cols.includes("group_name"));
  assert.ok(cols.includes("is_enabled"));
  assert.ok(cols.includes("effort_targets"));
});

test("ToolMappingRepository preserves group/effort metadata on inline target updates and resolves effort overrides", () => {
  ToolMappingRepository.saveGlobalMapping("gpt-6.2-sol", "codex/gpt-6.2-sol", {
    groupName: "GPT / Codex",
    isEnabled: true,
    effortTargets: {
      low: "codex/gpt-6.2-astra(low)",
      ultra: "codex/gpt-6.2-sol(ultra)",
    },
  });

  // Inline update of only targetModel preserves groupName, isEnabled, and effortTargets
  ToolMappingRepository.saveGlobalMapping("gpt-6.2-sol", "codex/gpt-6.2-sol(medium)");
  const saved = ToolMappingRepository.getGlobalMappings().find((m) => m.sourceModel === "gpt-6.2-sol");
  assert.ok(saved);
  assert.equal(saved.groupName, "GPT / Codex");
  assert.equal(saved.isEnabled, true);
  assert.deepEqual(saved.effortTargets, {
    low: "codex/gpt-6.2-astra(low)",
    ultra: "codex/gpt-6.2-sol(ultra)",
  });

  // Effort routing matches effortTargets when client sends matching effort
  const lowRes = ToolMappingRepository.resolveModelMappingDetailed("codex", "gpt-6.2-sol", "low");
  assert.equal(lowRes.targetModel, "codex/gpt-6.2-astra(low)");
  assert.equal(lowRes.matchedEffort, "low");

  const ultraRes = ToolMappingRepository.resolveModelMappingDetailed("codex", "gpt-6.2-sol", "ultra");
  assert.equal(ultraRes.targetModel, "codex/gpt-6.2-sol(ultra)");
  assert.equal(ultraRes.matchedEffort, "ultra");

  // Unconfigured effort falls back to default targetModel
  const highRes = ToolMappingRepository.resolveModelMappingDetailed("codex", "gpt-6.2-sol", "high");
  assert.equal(highRes.targetModel, "codex/gpt-6.2-sol(medium)");
  assert.equal(highRes.matchedEffort, undefined);

  // Non-effort client falls back to default targetModel
  const noEffortRes = ToolMappingRepository.resolveModelMappingDetailed("cursor", "gpt-6.2-sol");
  assert.equal(noEffortRes.targetModel, "codex/gpt-6.2-sol(medium)");
});

test("GET /v1/models exposes exactly 1 model per enabled mapping and hides disabled mappings/groups", async () => {
  ToolMappingRepository.saveGlobalMapping("gpt-6.2-sol", "codex/gpt-6.2-sol", {
    groupName: "GPT / Codex",
    effortTargets: {
      low: "codex/gpt-6.2-astra(low)",
      high: "codex/gpt-6.2-sol(high)",
      ultra: "codex/gpt-6.2-sol(ultra)",
    },
  });
  ToolMappingRepository.saveGlobalMapping("free-glm-5", "nvidia/glm-5", {
    groupName: "Free",
  });
  ToolMappingRepository.saveGlobalMapping("free-kimi", "nvidia/kimi-k3", {
    groupName: "Free",
  });

  const app = createTestServer();
  const res1 = await requestJson(app, "GET", "/v1/models");
  const ids1 = res1.data.data.map((m: any) => m.id);

  // Only 1 entry for gpt-6.2-sol — NO virtual -low/-high/-ultra models emitted
  assert.deepEqual(ids1.filter((id: string) => id.startsWith("gpt-6.2-sol")), ["gpt-6.2-sol"]);
  assert.ok(ids1.includes("free-glm-5"));
  assert.ok(ids1.includes("free-kimi"));

  // Toggle entire Free group off
  const toggleGroupRes = await requestJson(app, "PATCH", "/api/model-mappings/global-mappings/toggle-group", {
    groupName: "Free",
    isEnabled: false,
  });
  assert.equal(toggleGroupRes.status, 200);

  const res2 = await requestJson(app, "GET", "/v1/models");
  const ids2 = res2.data.data.map((m: any) => m.id);
  assert.ok(ids2.includes("gpt-6.2-sol"));
  assert.ok(!ids2.includes("free-glm-5"));
  assert.ok(!ids2.includes("free-kimi"));

  // Disabled mapping is also skipped during routing
  assert.equal(ToolMappingRepository.resolveModelMapping("cursor", "free-glm-5"), null);

  // Re-enabling Free group restores both models without data loss
  await requestJson(app, "PATCH", "/api/model-mappings/global-mappings/toggle-group", {
    groupName: "Free",
    isEnabled: true,
  });
  const res3 = await requestJson(app, "GET", "/v1/models");
  const ids3 = res3.data.data.map((m: any) => m.id);
  assert.ok(ids3.includes("free-glm-5"));
  assert.ok(ids3.includes("free-kimi"));
});

test("simulateModelRoute resolves effort-specific targets and reports resolved effort", () => {
  ComboRepository.saveCombo({
    id: "combo_ultra",
    name: "flagship-ultra",
    models: ["codex/gpt-6.2-sol(ultra)", "claude/claude-opus-4-8"],
    strategy: "fallback",
    isActive: true,
    createdAt: Date.now(),
  });

  ToolMappingRepository.saveGlobalMapping("gpt-6.2-sol", "codex/gpt-6.2-sol", {
    groupName: "GPT / Codex",
    effortTargets: {
      low: "codex/gpt-6.2-astra(low)",
      ultra: "combo/flagship-ultra",
    },
  });

  const simDefault = simulateModelRoute("gpt-6.2-sol");
  assert.equal(simDefault.effectiveModel, "codex/gpt-6.2-sol");
  assert.equal(simDefault.matchedEffort, undefined);

  const simLow = simulateModelRoute("gpt-6.2-sol", undefined, "low");
  assert.equal(simLow.matchedEffort, "low");
  assert.equal(simLow.effectiveModel, "codex/gpt-6.2-astra(low)");
  assert.equal(simLow.targetModel, "gpt-6.2-astra");
  assert.equal(simLow.resolvedEffort, "low");

  const simUltra = simulateModelRoute("gpt-6.2-sol", undefined, "ultra");
  assert.equal(simUltra.matchedEffort, "ultra");
  assert.equal(simUltra.isCombo, true);
  assert.equal(simUltra.comboName, "flagship-ultra");
  assert.equal(simUltra.comboCandidatesStatus?.[0]?.resolvedEffort, "ultra");
  assert.equal(simUltra.comboCandidatesStatus?.[1]?.resolvedEffort, "max");
});

test("POST /global-mappings/auto-group assigns groups to ungrouped mappings without overwriting existing ones", async () => {
  ToolMappingRepository.saveGlobalMapping("auto", "combo/auto");
  ToolMappingRepository.saveGlobalMapping("free-glm-5", "nvidia/glm-5");
  ToolMappingRepository.saveGlobalMapping("claude-opus-5.5", "claude/claude-opus-5-5", {
    groupName: "Pinned Group",
  });

  const app = createTestServer();
  const res = await requestJson(app, "POST", "/api/model-mappings/global-mappings/auto-group");
  assert.equal(res.status, 200);
  const byName = new Map<string, any>(res.data.mappings.map((m: any) => [m.sourceModel, m]));
  assert.equal(byName.get("auto")?.groupName, "Agent");
  assert.equal(byName.get("free-glm-5")?.groupName, "Free");
  assert.equal(byName.get("claude-opus-5.5")?.groupName, "Pinned Group");
});

test("Disabled global mapping blocks fallback to other tool rules, and API validates payload types cleanly", async () => {
  ToolMappingRepository.saveMapping("claude", "shared-alias", "claude/claude-sonnet-4-6");
  ToolMappingRepository.saveGlobalMapping("shared-alias", "codex/gpt-6.2-sol", {
    isEnabled: false,
    effortTargets: { low: "codex/gpt-6.2-astra(low)" },
  });

  // Unknown tool must NOT fall through to claude's mapping when global rule is disabled
  assert.equal(ToolMappingRepository.resolveModelMapping("unknown", "shared-alias"), null);

  // Inline effort suffix in simulator resolves matching effort target
  ToolMappingRepository.toggleMappingEnabled("global", "shared-alias", true);
  const simSuffix = simulateModelRoute("shared-alias(low)");
  assert.equal(simSuffix.matchedEffort, "low");
  assert.equal(simSuffix.effectiveModel, "codex/gpt-6.2-astra(low)");

  const app = createTestServer();
  // Clearing targetModel via inline edit stays valid when DB already holds effortTargets
  const clearDefaultRes = await requestJson(app, "POST", "/api/model-mappings/global-mappings", {
    sourceModel: "shared-alias",
    targetModel: "",
  });
  assert.equal(clearDefaultRes.status, 200);

  // Invalid groupName / effortTargets types return 400 instead of 500
  const invalidGroupRes = await requestJson(app, "POST", "/api/model-mappings/global-mappings", {
    sourceModel: "shared-alias",
    targetModel: "codex/gpt-6.2-sol",
    groupName: 123,
  });
  assert.equal(invalidGroupRes.status, 400);

  const invalidEffortRes = await requestJson(app, "POST", "/api/model-mappings/global-mappings", {
    sourceModel: "shared-alias",
    targetModel: "codex/gpt-6.2-sol",
    effortTargets: { low: 123 },
  });
  assert.equal(invalidEffortRes.status, 400);
});

test("PATCH /global-mappings/group selectively groups and ungroups chosen models", async () => {
  ToolMappingRepository.saveGlobalMapping("sol", "codex/gpt-6.2-sol");
  ToolMappingRepository.saveGlobalMapping("astra", "codex/gpt-6.2-astra");
  ToolMappingRepository.saveGlobalMapping("sonnet", "claude/claude-sonnet-4-6");

  const app = createTestServer();
  // Group only sol and astra; sonnet stays ungrouped/normal
  const groupRes = await requestJson(app, "PATCH", "/api/model-mappings/global-mappings/group", {
    sourceModels: ["sol", "astra"],
    groupName: "Codex Pair",
  });
  assert.equal(groupRes.status, 200);
  const byName = new Map<string, any>(groupRes.data.mappings.map((m: any) => [m.sourceModel, m]));
  assert.equal(byName.get("sol")?.groupName, "Codex Pair");
  assert.equal(byName.get("astra")?.groupName, "Codex Pair");
  assert.equal(byName.get("sonnet")?.groupName, undefined);

  // Ungroup Codex Pair back to normal
  const ungroupRes = await requestJson(app, "PATCH", "/api/model-mappings/global-mappings/group", {
    sourceModels: ["sol", "astra"],
    groupName: null,
  });
  assert.equal(ungroupRes.status, 200);
  const byName2 = new Map<string, any>(ungroupRes.data.mappings.map((m: any) => [m.sourceModel, m]));
  assert.equal(byName2.get("sol")?.groupName, undefined);
  assert.equal(byName2.get("astra")?.groupName, undefined);
});

test("runProxyPipeline forwards model-suffix effort and [1m](effort) modifiers matching simulateModelRoute", async () => {
  const db = getDatabase();
  db.run("DELETE FROM provider_accounts WHERE provider_id = 'codex'");
  ProviderRepository.addAccount({
    id: "test-codex-effort-acc",
    providerId: "codex",
    name: "Test Codex",
    rawApiKey: "test-codex-key",
  });

  ToolMappingRepository.saveGlobalMapping("alias-eff", "codex/gpt-6.2-sol", {
    effortTargets: { low: "codex/gpt-6.2-astra" },
  });

  const dispatches: Array<{ model: string; reasoningEffort: string | null; is1mContext: boolean }> = [];
  const codex = new CodexProvider();
  ProviderRegistry.initializeBuiltins();
  ProviderRegistry.register({
    id: "codex",
    name: "Codex Mock",
    async execute(context) {
      const payload = codex.transformRequestBody(context);
      dispatches.push({
        model: payload.model,
        reasoningEffort: payload.reasoning?.effort ?? null,
        is1mContext: Boolean(context.is1mContext),
      });
      return { ok: true, logged: true, status: 200 };
    },
  });

  try {
    const mkRes = () => ({ headersSent: false, status: () => mkRes(), json: () => mkRes() }) as any;

    // 1. alias-eff(low) -> codex/gpt-6.2-astra (no explicit suffix on target) must preserve effort "low"
    await runProxyPipeline(
      { path: "/v1/responses", headers: { "x-client-tool": "codex" }, body: { model: "alias-eff(low)", input: "hi" } } as any,
      mkRes(),
      "responses"
    );

    // 2. alias-eff[1m](low) must detect 1m context and match alias-eff with effort "low"
    await runProxyPipeline(
      { path: "/v1/responses", headers: { "x-client-tool": "codex" }, body: { model: "alias-eff[1m](low)", input: "hi" } } as any,
      mkRes(),
      "responses"
    );

    assert.deepEqual(dispatches, [
      { model: "gpt-6.2-astra", reasoningEffort: "low", is1mContext: false },
      { model: "gpt-6.2-astra", reasoningEffort: "low", is1mContext: true },
    ]);

    const sim = simulateModelRoute("alias-eff[1m](low)", "codex");
    assert.equal(sim.is1mContext, true);
    assert.equal(sim.matchedRule, "global");
    assert.equal(sim.matchedEffort, "low");
    assert.equal(sim.targetModel, "gpt-6.2-astra");
    assert.equal(sim.resolvedEffort, "low");
  } finally {
    ProviderRegistry.clear();
    ProviderRegistry.initializeBuiltins();
    db.run("DELETE FROM provider_accounts WHERE provider_id = 'codex'");
  }
});

test("handleCountTokens resolves global mappings and effort suffixes for non-Claude clients and forwards targetModel", async () => {
  const db = getDatabase();
  db.run("DELETE FROM provider_accounts WHERE provider_id = 'claude'");
  ProviderRepository.ensureProviderExists("claude");
  ProviderRepository.addAccount({
    id: "test-claude-ct-acc",
    providerId: "claude",
    name: "Test Claude",
    rawApiKey: "sk-ant-test-key",
  });

  ToolMappingRepository.saveGlobalMapping("my-universal-alias", "codex/gpt-6.2-sol", {
    effortTargets: { low: "claude/claude-sonnet-4-6" },
  });

  const originalFetch = globalThis.fetch;
  let forwardedModel: string | undefined;
  globalThis.fetch = (async (_url: any, init: any) => {
    const body = JSON.parse(init.body);
    forwardedModel = body.model;
    return new Response(JSON.stringify({ input_tokens: 42 }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }) as typeof fetch;

  try {
    let statusCode = 200;
    let jsonPayload: any;
    const res = {
      headersSent: false,
      status(code: number) {
        statusCode = code;
        return this;
      },
      json(data: any) {
        jsonPayload = data;
        this.headersSent = true;
        return this;
      },
    } as any;

    await handleCountTokens(
      {
        path: "/v1/messages/count_tokens",
        headers: { "x-client-tool": "opencode" },
        body: {
          model: "my-universal-alias(low)",
          messages: [{ role: "user", content: "hello" }],
        },
      } as any,
      res
    );

    assert.equal(statusCode, 200);
    assert.equal(forwardedModel, "claude-sonnet-4-6");
    assert.deepEqual(jsonPayload, { input_tokens: 42 });
  } finally {
    globalThis.fetch = originalFetch;
    db.run("DELETE FROM provider_accounts WHERE provider_id = 'claude'");
  }
});

test("POST /api/model-mappings/:tool/mappings supports effortTargets, groupName, and isEnabled", async () => {
  const app = createTestServer();
  const res = await requestJson(app, "POST", "/api/model-mappings/claude/mappings", {
    sourceModel: "sonnet",
    targetModel: "",
    groupName: "Claude",
    isEnabled: true,
    effortTargets: { low: "claude/claude-haiku-4-5" },
  });
  assert.equal(res.status, 200);

  const claudeMappings = ToolMappingRepository.getMappings("claude");
  const sonnet = claudeMappings.find((m) => m.sourceModel === "sonnet");
  assert.ok(sonnet);
  assert.equal(sonnet.groupName, "Claude");
  assert.equal(sonnet.isEnabled, true);
  assert.deepEqual(sonnet.effortTargets, { low: "claude/claude-haiku-4-5" });
});

test("Direct combo with (effort) suffix resolves combo and effort in simulateModelRoute and runProxyPipeline", async () => {
  const db = getDatabase();
  db.run("DELETE FROM provider_accounts WHERE provider_id = 'codex'");
  ProviderRepository.addAccount({
    id: "test-codex-combo-eff",
    providerId: "codex",
    name: "Test Codex",
    rawApiKey: "test-codex-key",
  });

  ComboRepository.saveCombo({
    id: "combo_direct_eff",
    name: "direct-combo",
    models: ["codex/gpt-6.2-sol"],
    strategy: "fallback",
    isActive: true,
    createdAt: Date.now(),
  });

  const simDirect = simulateModelRoute("direct-combo(low)");
  assert.equal(simDirect.isCombo, true);
  assert.equal(simDirect.comboName, "direct-combo");
  assert.equal(simDirect.resolvedEffort, "low");

  const dispatches: Array<{ model: string; reasoningEffort: string | null }> = [];
  const codex = new CodexProvider();
  ProviderRegistry.initializeBuiltins();
  ProviderRegistry.register({
    id: "codex",
    name: "Codex Mock",
    async execute(context) {
      const payload = codex.transformRequestBody(context);
      dispatches.push({
        model: payload.model,
        reasoningEffort: payload.reasoning?.effort ?? null,
      });
      return { ok: true, logged: true, status: 200 };
    },
  });

  try {
    const mkRes = () => ({ headersSent: false, status: () => mkRes(), json: () => mkRes() }) as any;
    await runProxyPipeline(
      { path: "/v1/responses", headers: {}, body: { model: "direct-combo(low)", input: "hi" } } as any,
      mkRes(),
      "responses"
    );
    assert.deepEqual(dispatches, [{ model: "gpt-6.2-sol", reasoningEffort: "low" }]);
  } finally {
    ProviderRegistry.clear();
    ProviderRegistry.initializeBuiltins();
    db.run("DELETE FROM provider_accounts WHERE provider_id = 'codex'");
  }
});