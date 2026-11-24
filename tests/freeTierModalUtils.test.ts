process.env.NODE_ENV = "test";

import test from "node:test";
import assert from "node:assert/strict";
import {
  buildFreeTierCapsMap,
  filterFreeTierWorkspace,
} from "../src/web/src/components/freeTier/freeTierModalUtils.js";
import { groupFreeTierModels } from "../src/web/src/utils/freeTierGrouping.js";
import type { FreeTierProviderData } from "../src/web/src/utils/freeTierHelper.js";
import type { ProviderRegistryItem } from "../src/providers/core/types.js";

function makeProviderData(
  id: string,
  name: string,
  connectionStatus: "connected" | "not_connected",
  models: Array<{ id: string; name: string; limit?: string }>
): FreeTierProviderData {
  const provider = {
    id,
    name,
    alias: id,
    color: "#10B981",
    models: [],
    authType: "apikey",
    authLabel: "API Key",
    format: "openai",
    baseUrl: "https://example.com",
  } as unknown as ProviderRegistryItem;

  return {
    provider,
    freeTier: {
      scope: "models",
      limitType: "requests",
      note: `${name} free tier`,
    },
    freeModels: models.map((m) => ({
      id: m.id,
      name: m.name,
      comboModelValue: `${id}/${m.id}`,
      limit: m.limit,
      contextLength: 128000,
    })),
    accountsCount: connectionStatus === "connected" ? 1 : 0,
    connectionStatus,
    statusLabel: connectionStatus === "connected" ? "Connected" : "Not connected",
  };
}

test("FreeTierModalUtils - provider mode keeps left rail stable on selection & supports modality filter", () => {
  const list: FreeTierProviderData[] = [
    makeProviderData("anthropic-free", "Alpha Free", "connected", [
      { id: "claude-3-5-sonnet", name: "Claude 3.5 Sonnet" },
    ]),
    makeProviderData("gemini", "Gemini AI Studio", "not_connected", [
      { id: "gemini-2.5-flash", name: "Gemini 2.5 Flash" },
      { id: "deepseek-r1", name: "DeepSeek R1" },
    ]),
  ];

  const capsMap = buildFreeTierCapsMap(list);

  // 1. Initial order: connected first, then alphabetical
  const before = filterFreeTierWorkspace({
    freeProvidersList: list,
    groups: [],
    groupMode: "provider",
    searchQuery: "",
    onlyConnected: false,
    onlyMultiProvider: false,
    modalityFilter: "all",
    activeScopeId: "all",
    selectedSet: new Set(),
    capsMap,
  });

  assert.deepEqual(
    before.railItems.map((r) => r.id),
    ["anthropic-free", "gemini"]
  );
  assert.equal(before.totalMatchingCount, 3);

  // 2. Selecting model from unconnected provider does NOT re-order left rail
  const afterSelect = filterFreeTierWorkspace({
    freeProvidersList: list,
    groups: [],
    groupMode: "provider",
    searchQuery: "",
    onlyConnected: false,
    onlyMultiProvider: false,
    modalityFilter: "all",
    activeScopeId: "gemini",
    selectedSet: new Set(["gemini/gemini-2.5-flash"]),
    capsMap,
  });

  assert.deepEqual(
    afterSelect.railItems.map((r) => r.id),
    ["anthropic-free", "gemini"]
  );
  assert.equal(afterSelect.railItems.find((r) => r.id === "gemini")?.selectedCount, 1);
  assert.equal(afterSelect.visibleCandidates.length, 2);
  assert.equal(afterSelect.activeProvider?.provider.id, "gemini");

  // 3. Modality filter (reasoning) filters candidates cleanly
  const reasoningOnly = filterFreeTierWorkspace({
    freeProvidersList: list,
    groups: [],
    groupMode: "provider",
    searchQuery: "",
    onlyConnected: false,
    onlyMultiProvider: false,
    modalityFilter: "reasoning",
    activeScopeId: "all",
    selectedSet: new Set(),
    capsMap,
  });

  assert.ok(reasoningOnly.visibleCandidates.some((c) => c.modelId === "deepseek-r1"));
});

test("FreeTierModalUtils - model group mode filters 2+ providers and scopes cleanly", () => {
  const list: FreeTierProviderData[] = [
    makeProviderData("nvidia", "NVIDIA NIM", "connected", [
      { id: "deepseek-ai/deepseek-r1", name: "DeepSeek R1" },
    ]),
    makeProviderData("openrouter", "OpenRouter", "not_connected", [
      { id: "deepseek/deepseek-r1:free", name: "DeepSeek R1 (free)" },
      { id: "qwen/qwen-2.5-72b:free", name: "Qwen 2.5 72B (free)" },
    ]),
  ];

  const capsMap = buildFreeTierCapsMap(list);
  const groups = groupFreeTierModels(list, "model", "free-");

  const multiOnly = filterFreeTierWorkspace({
    freeProvidersList: list,
    groups,
    groupMode: "model",
    searchQuery: "",
    onlyConnected: false,
    onlyMultiProvider: true,
    modalityFilter: "all",
    activeScopeId: "all",
    selectedSet: new Set(["nvidia/deepseek-ai/deepseek-r1"]),
    capsMap,
  });

  assert.equal(multiOnly.railItems.length, 1);
  assert.equal(multiOnly.visibleCandidates.length, 2);
  assert.equal(multiOnly.railItems[0].selectedCount, 1);
});
