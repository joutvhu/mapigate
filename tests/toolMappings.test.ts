process.env.NODE_ENV = "test";

import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import app from "../src/server/index.js";
import { ToolMappingRepository } from "../src/storage/repositories/toolMappingRepo.js";
import { MitmRepository } from "../src/storage/repositories/mitmRepo.js";
import { getDatabase } from "../src/storage/database.js";

test("Unit - ToolMappingRepository defaults, CRUD, and resolveModelMapping", () => {
  // Clean test database for fresh run
  const db = getDatabase();
  db.run("DELETE FROM tool_mappings");
  db.run("DELETE FROM mitm_mappings");

  // 1. Check default mappings for claude
  const claudeDefaults = ToolMappingRepository.getDefaultMappings("claude");
  assert.ok(claudeDefaults.length > 0);
  const claudeSources = claudeDefaults.map((m) => m.sourceModel);
  assert.ok(claudeSources.includes("sonnet"));
  assert.ok(claudeSources.includes("opus"));
  assert.ok(claudeSources.includes("default"));
  // Target is empty by default so user can configure their preferred provider
  assert.equal(claudeDefaults.find((m) => m.sourceModel === "sonnet")?.targetModel, "");

  // 2. Check default mappings for cursor
  const cursorDefaults = ToolMappingRepository.getDefaultMappings("cursor");
  assert.ok(cursorDefaults.length > 0);
  const cursorSources = cursorDefaults.map((m) => m.sourceModel);
  assert.ok(cursorSources.includes("claude-3-7-sonnet"));
  assert.ok(cursorSources.includes("gpt-4o"));
  assert.equal(cursorDefaults.find((m) => m.sourceModel === "claude-3-7-sonnet")?.targetModel, "");

  // 3. Resolve model mapping fallback (unconfigured returns null because targetModel is empty by default)
  const unmappedSonnet = ToolMappingRepository.resolveModelMapping("claude", "sonnet");
  assert.equal(unmappedSonnet, null);

  // When configured, resolveModelMapping returns the mapped targetModel
  ToolMappingRepository.saveMapping("claude", "sonnet", "claude/claude-sonnet-4-6");
  const resolvedSonnet = ToolMappingRepository.resolveModelMapping("claude", "sonnet");
  assert.equal(resolvedSonnet, "claude/claude-sonnet-4-6");
  ToolMappingRepository.deleteMapping("claude", "sonnet");

  // 4. Save custom mapping
  ToolMappingRepository.saveMapping("cursor", "custom-model-x", "combo/smart-code");
  const cursorMappings = ToolMappingRepository.getMappings("cursor");
  const custom = cursorMappings.find((m) => m.sourceModel === "custom-model-x");
  assert.ok(custom);
  assert.equal(custom.targetModel, "combo/smart-code");

  // 5. Resolve custom mapping
  const resolvedCustom = ToolMappingRepository.resolveModelMapping("cursor", "custom-model-x");
  assert.equal(resolvedCustom, "combo/smart-code");

  // Case-insensitive lookup
  const resolvedCase = ToolMappingRepository.resolveModelMapping("cursor", "CUSTOM-MODEL-X");
  assert.equal(resolvedCase, "combo/smart-code");

  // 6. Delete mapping
  ToolMappingRepository.deleteMapping("cursor", "custom-model-x");
  const resolvedAfterDelete = ToolMappingRepository.resolveModelMapping("cursor", "custom-model-x");
  assert.equal(resolvedAfterDelete, null);

  // 7. Reset mappings
  const resetCursor = ToolMappingRepository.resetMappings("cursor");
  assert.ok(resetCursor.length > 0);
  assert.ok(resetCursor.some((m) => m.sourceModel === "claude-3-7-sonnet"));
});

test("Unit - ToolMappingRepository integration with MITM tools", () => {
  // Check copilot default mappings
  const copilotDefaults = ToolMappingRepository.getDefaultMappings("copilot");
  assert.ok(copilotDefaults.length > 0);

  // MitmRepository should delegate to ToolMappingRepository
  ToolMappingRepository.saveMapping("copilot", "gpt-test-model", "openai/gpt-4o");
  const mitmMappings = MitmRepository.getMappings("copilot");
  const foundInMitm = mitmMappings.find((m) => m.sourceModel === "gpt-test-model");
  assert.ok(foundInMitm);
  assert.equal(foundInMitm.targetModel, "openai/gpt-4o");

  // Cleanup
  ToolMappingRepository.deleteMapping("copilot", "gpt-test-model");
});

test("API - /api/tools/:id/mappings endpoints", async () => {
  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const port = (server.address() as any).port;
  const baseUrl = `http://127.0.0.1:${port}`;

  try {
    // 1. GET /api/tools/claude/mappings
    const getRes = await fetch(`${baseUrl}/api/tools/claude/mappings`);
    assert.equal(getRes.status, 200);
    const mappings = (await getRes.json()) as any[];
    assert.ok(Array.isArray(mappings));
    assert.ok(mappings.some((m) => m.sourceModel === "sonnet"));

    // 2. POST /api/tools/claude/mappings
    const postRes = await fetch(`${baseUrl}/api/tools/claude/mappings`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sourceModel: "test-alias",
        targetModel: "combo/claude-fallback",
      }),
    });
    assert.equal(postRes.status, 200);

    // Verify it was saved
    const verifyRes = await fetch(`${baseUrl}/api/tools/claude/mappings`);
    const verifyList = (await verifyRes.json()) as any[];
    const saved = verifyList.find((m) => m.sourceModel === "test-alias");
    assert.ok(saved);
    assert.equal(saved.targetModel, "combo/claude-fallback");

    // 3. DELETE /api/tools/claude/mappings
    const deleteRes = await fetch(`${baseUrl}/api/tools/claude/mappings?sourceModel=test-alias`, {
      method: "DELETE",
    });
    assert.equal(deleteRes.status, 200);

    // Verify deletion
    const verifyDeleteRes = await fetch(`${baseUrl}/api/tools/claude/mappings`);
    const listAfterDelete = (await verifyDeleteRes.json()) as any[];
    assert.equal(listAfterDelete.some((m) => m.sourceModel === "test-alias"), false);

    // 4. POST /api/tools/claude/mappings/reset
    const resetRes = await fetch(`${baseUrl}/api/tools/claude/mappings/reset`, {
      method: "POST",
    });
    assert.equal(resetRes.status, 200);
    const resetData = (await resetRes.json()) as any;
    assert.ok(Array.isArray(resetData.mappings));
    assert.ok(resetData.mappings.some((m: any) => m.sourceModel === "sonnet"));
  } finally {
    server.close();
  }
});

test("Unit & API - Universal Global Model Mappings and 1-Click Import", async () => {
  // Clean start
  ToolMappingRepository.resetGlobalMappings();

  // 1. Import aliases for claude (creates aliases with empty target for user to choose)
  const afterClaudeImport = ToolMappingRepository.importToolDefaultsToGlobal("claude");
  assert.ok(afterClaudeImport.length > 0);
  const sonnetItem = afterClaudeImport.find((m) => m.sourceModel === "sonnet");
  assert.ok(sonnetItem);
  assert.equal(sonnetItem.targetModel, "");

  // Unmapped model with empty target returns null (user hasn't selected a provider yet)
  const unmappedResolve = ToolMappingRepository.resolveModelMapping("unknown", "sonnet");
  assert.equal(unmappedResolve, null);

  // 2. User maps sonnet to a custom target
  ToolMappingRepository.saveGlobalMapping("sonnet", "deepseek/deepseek-chat");
  const resolvedForUnknown = ToolMappingRepository.resolveModelMapping("unknown", "sonnet");
  assert.equal(resolvedForUnknown, "deepseek/deepseek-chat");

  // 3. Save custom global mapping
  ToolMappingRepository.saveGlobalMapping("universal-custom", "combo/global-coding");
  const resolvedCustom = ToolMappingRepository.resolveModelMapping("some-random-new-client", "universal-custom");
  assert.equal(resolvedCustom, "combo/global-coding");

  // 4. REST endpoints for global mappings
  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const port = (server.address() as any).port;
  const baseUrl = `http://127.0.0.1:${port}`;

  try {
    // GET /api/model-mappings/global-mappings
    const getRes = await fetch(`${baseUrl}/api/model-mappings/global-mappings`);
    assert.equal(getRes.status, 200);
    const list = (await getRes.json()) as any[];
    assert.ok(list.some((m) => m.sourceModel === "universal-custom"));

    // POST 1-click import for cursor (adds cursor aliases with empty target)
    const importRes = await fetch(`${baseUrl}/api/model-mappings/global-mappings/import/cursor`, {
      method: "POST",
    });
    assert.equal(importRes.status, 200);
    const importedData = (await importRes.json()) as any;
    assert.ok(Array.isArray(importedData.mappings));
    const cursorModel = importedData.mappings.find((m: any) => m.sourceModel === "claude-3-7-sonnet");
    assert.ok(cursorModel);
    assert.equal(cursorModel.targetModel, "");

    // DELETE custom global mapping
    const delRes = await fetch(`${baseUrl}/api/model-mappings/global-mappings?sourceModel=universal-custom`, {
      method: "DELETE",
    });
    assert.equal(delRes.status, 200);
    const afterDel = ToolMappingRepository.resolveModelMapping("unknown", "universal-custom");
    assert.equal(afterDel, null);
  } finally {
    ToolMappingRepository.resetGlobalMappings();
    server.close();
  }
});
