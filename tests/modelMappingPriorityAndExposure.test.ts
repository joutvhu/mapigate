import test from "node:test";
import assert from "node:assert/strict";
import { ToolMappingRepository } from "../src/storage/repositories/toolMappingRepo.js";
import { SettingsRepository } from "../src/storage/repositories/settingsRepo.js";
import { ComboRepository } from "../src/storage/repositories/comboRepo.js";
import { handleOpenAiModelsList } from "../src/server/routes/apiModels.js";

test("Model Mapping Priority - Resolves wrapper prefix and respects Global priority", () => {
  // 1. Set up global mapping: claude-3-7-sonnet -> combo/my-sonnet-combo
  ToolMappingRepository.saveGlobalMapping("claude-3-7-sonnet", "combo/my-sonnet-combo");

  // Exact match
  const exact = ToolMappingRepository.resolveModelMapping("opencode", "claude-3-7-sonnet");
  assert.equal(exact, "combo/my-sonnet-combo");

  // Wrapper prefix stripped: client sends mapigate/claude-3-7-sonnet
  const withMapigatePrefix = ToolMappingRepository.resolveModelMapping("opencode", "mapigate/claude-3-7-sonnet");
  assert.equal(withMapigatePrefix, "combo/my-sonnet-combo");

  // Clean up
  ToolMappingRepository.deleteGlobalMapping("claude-3-7-sonnet");
});

test("Model Mapping Explicit Tag - Preserves explicit tagged provider intent without stripping to combo", () => {
  // Global mapping has: gemini-4-argon -> combo/gemini-4-argon
  ToolMappingRepository.saveGlobalMapping("gemini-4-argon", "combo/gemini-4-argon");

  // When client explicitly calls antigravity[pro]/gemini-4-argon, it must NOT strip to combo
  const resolved = ToolMappingRepository.resolveModelMapping("generic", "antigravity[pro]/gemini-4-argon");
  assert.equal(resolved, null, "Explicit tagged account input must not be hijacked by un-tagged combo mapping");

  // Conversely: a tagged rule must not match untagged input
  ToolMappingRepository.saveGlobalMapping("antigravity[pro]/gemini-4-neon", "combo/my-neon-combo");
  const untaggedResolved = ToolMappingRepository.resolveModelMapping("generic", "gemini-4-neon");
  assert.equal(untaggedResolved, null, "Untagged input must not match a tagged provider mapping rule");

  // Clean up
  ToolMappingRepository.deleteGlobalMapping("gemini-4-argon");
  ToolMappingRepository.deleteGlobalMapping("antigravity[pro]/gemini-4-neon");
});

test("Model Mapping Wildcard - Matches model variations with asterisk and wrapper prefixes", () => {
  ToolMappingRepository.saveGlobalMapping("claude-3-7-sonnet*", "combo/sonnet-wildcard-combo");

  const dated = ToolMappingRepository.resolveModelMapping("global", "claude-3-7-sonnet-20250219");
  assert.equal(dated, "combo/sonnet-wildcard-combo");

  const latest = ToolMappingRepository.resolveModelMapping("global", "claude-3-7-sonnet-latest");
  assert.equal(latest, "combo/sonnet-wildcard-combo");

  const withWrapper = ToolMappingRepository.resolveModelMapping("opencode", "mapigate/claude-3-7-sonnet-20250219");
  assert.equal(withWrapper, "combo/sonnet-wildcard-combo", "Wildcard must match when prefixed with mapigate/ wrapper");

  ToolMappingRepository.deleteGlobalMapping("claude-3-7-sonnet*");
});

test("Model Mapping - Explicit unmapped in global prevents arbitrary tool fallback", () => {
  // 1. Tool 'claude' has a mapping
  ToolMappingRepository.saveMapping("claude", "isolated-model-xyz", "claude/isolated-model-target");
  // 2. Global has the same model explicitly unmapped (empty target)
  ToolMappingRepository.saveGlobalMapping("isolated-model-xyz", "");

  // Calling with unknown tool must respect that global has it unmapped, and NOT fall back to claude's target!
  const resolvedUnknown = ToolMappingRepository.resolveModelMapping("unknown", "isolated-model-xyz");
  assert.equal(resolvedUnknown, null, "Explicitly unmapped global model must not fall back to other tools");

  ToolMappingRepository.deleteMapping("claude", "isolated-model-xyz");
  ToolMappingRepository.deleteGlobalMapping("isolated-model-xyz");
});

test("Model Mapping - importCombosToGlobal imports active combos into Global mappings", () => {
  // Save an active test combo
  const testCombo = ComboRepository.saveCombo({
    name: "test-sync-combo-xyz",
    models: ["openai/gpt-4o"],
    isActive: true,
  });

  const mappings = ToolMappingRepository.importCombosToGlobal();
  const found = mappings.find((m) => m.sourceModel === "test-sync-combo-xyz");
  assert.ok(found, "Combo should be imported into Global mappings");
  assert.equal(found.targetModel, "combo/test-sync-combo-xyz");

  // Clean up
  ToolMappingRepository.deleteGlobalMapping("test-sync-combo-xyz");
  ComboRepository.deleteCombo(testCombo.id);
});

test("SettingsRepository - ModelExposureMode getters and setters", () => {
  const originalMode = SettingsRepository.getModelExposureMode();

  SettingsRepository.setModelExposureMode("mapped_only");
  assert.equal(SettingsRepository.getModelExposureMode(), "mapped_only");

  SettingsRepository.setModelExposureMode("connected");
  assert.equal(SettingsRepository.getModelExposureMode(), "connected");

  SettingsRepository.setModelExposureMode("all");
  assert.equal(SettingsRepository.getModelExposureMode(), "all");

  // Restore
  SettingsRepository.setModelExposureMode(originalMode);
});

test("handleOpenAiModelsList - Respects mapped_only exposure mode", () => {
  const originalMode = SettingsRepository.getModelExposureMode();
  try {
    SettingsRepository.setModelExposureMode("mapped_only");

    ToolMappingRepository.saveGlobalMapping("my-custom-mapped-model", "combo/some-target");

    let responseData: any = null;
    const mockRes: any = {
      json: (data: any) => {
        responseData = data;
        return mockRes;
      },
    };

    handleOpenAiModelsList({}, mockRes);

    assert.ok(responseData && Array.isArray(responseData.data));
    const hasMapped = responseData.data.some((m: any) => m.id === "my-custom-mapped-model");
    assert.ok(hasMapped, "my-custom-mapped-model must be exposed in mapped_only mode");

    // Wildcard mapping should NOT be exposed as literal * string
    ToolMappingRepository.saveGlobalMapping("wildcard-model-*", "combo/some-target");
    let responseWithWildcard: any = null;
    const mockRes2: any = {
      json: (data: any) => {
        responseWithWildcard = data;
        return mockRes2;
      },
    };
    handleOpenAiModelsList({}, mockRes2);
    const hasLiteralWildcard = responseWithWildcard.data.some((m: any) => m.id === "wildcard-model-*");
    assert.equal(hasLiteralWildcard, false, "Literal wildcard pattern must not be exposed in /v1/models");
    ToolMappingRepository.deleteGlobalMapping("wildcard-model-*");

    // In mapped_only mode, static unconfigured models like bedrock/anthropic... should NOT be present
    const hasRandomStatic = responseData.data.some((m: any) => m.id === "bedrock/anthropic.claude-v2");
    assert.equal(hasRandomStatic, false, "Random unmapped static models must be hidden in mapped_only mode");
  } finally {
    ToolMappingRepository.deleteGlobalMapping("my-custom-mapped-model");
    SettingsRepository.setModelExposureMode(originalMode);
  }
});

test("HTTP API - Exposure mode, import-combos, and route simulator", async () => {
  const http = await import("node:http");
  const appModule = await import("../src/server/index.js");
  const app = appModule.default || appModule;

  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const port = (server.address() as any).port;
  const baseUrl = `http://127.0.0.1:${port}`;

  try {
    // 1. GET & POST /api/model-mappings/exposure-mode
    const getModeRes = await fetch(`${baseUrl}/api/model-mappings/exposure-mode`);
    assert.equal(getModeRes.status, 200);
    const modeData = await getModeRes.json();
    assert.ok(modeData.mode);

    const postModeRes = await fetch(`${baseUrl}/api/model-mappings/exposure-mode`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mode: "connected" }),
    });
    assert.equal(postModeRes.status, 200);
    const postModeData = await postModeRes.json();
    assert.equal(postModeData.mode, "connected");

    // Reset back
    await fetch(`${baseUrl}/api/model-mappings/exposure-mode`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mode: "all" }),
    });

    // 2. POST /api/model-mappings/global-mappings/import-combos
    const importCombosRes = await fetch(`${baseUrl}/api/model-mappings/global-mappings/import-combos`, {
      method: "POST",
    });
    assert.equal(importCombosRes.status, 200);
    const importCombosData = await importCombosRes.json();
    assert.equal(importCombosData.success, true);
    assert.ok(Array.isArray(importCombosData.mappings));

    // 3. POST /api/model-mappings/simulate
    ToolMappingRepository.saveGlobalMapping("test-sim-model", "combo/test-sim-target");
    const simRes = await fetch(`${baseUrl}/api/model-mappings/simulate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model: "test-sim-model", toolId: "opencode" }),
    });
    assert.equal(simRes.status, 200);
    const simData = await simRes.json();
    assert.equal(simData.incomingModel, "test-sim-model");
    assert.equal(simData.effectiveModel, "combo/test-sim-target");
    assert.equal(simData.matchedRule, "global");
    ToolMappingRepository.deleteGlobalMapping("test-sim-model");
  } finally {
    server.close();
  }
});

