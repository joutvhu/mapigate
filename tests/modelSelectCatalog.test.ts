process.env.NODE_ENV = "test";

import test from "node:test";
import assert from "node:assert/strict";
import {
  buildModelCatalog,
  buildStableProviderSidebarItems,
  computeSelectedCountsByProvider,
  filterCatalogModels,
} from "../src/web/src/components/modelSelect/catalogUtils.js";
import { computeVirtualRange } from "../src/web/src/components/modelSelect/VirtualModelList.js";
import type { AvailableModelItem } from "../src/web/src/components/ModelAutocompleteInput.js";
import { createModelOption } from "../src/web/src/components/modelSelect/types.js";
import { getCapabilitiesForModel } from "../src/core/capabilities/index.js";

function makeAvailableModel(
  overrides: Partial<AvailableModelItem> & { id: string; value: string; providerId: string }
): AvailableModelItem {
  return {
    name: overrides.id,
    providerName: overrides.providerId,
    hasConnectedAccount: false,
    accountsCount: 0,
    caps: { vision: false, reasoning: false, audio: false },
    contextLength: 128000,
    ...overrides,
  };
}

test("ModelSelect catalogUtils - buildModelCatalog prioritizes scanned models & preserves multi-slash IDs", () => {
  const available: AvailableModelItem[] = [
    makeAvailableModel({
      id: "openai/gpt-6-luna",
      value: "iteracompute/openai/gpt-6-luna",
      name: "GPT-6 Luna (Itera)",
      providerId: "iteracompute",
      providerName: "IteraCompute",
      hasConnectedAccount: true,
      accountsCount: 1,
    }),
    makeAvailableModel({
      id: "custom-openai-scanned",
      value: "openai/custom-openai-scanned",
      name: "Custom OpenAI Scanned",
      providerId: "openai",
      providerName: "OpenAI",
      hasConnectedAccount: true,
      accountsCount: 1,
    }),
  ];

  const catalog = buildModelCatalog(available, { "my-alias": "anthropic/claude-3-7-sonnet" });

  // Configured provider (openai) suppresses static registry presets
  const openaiModels = catalog.allModels.filter((m) => m.providerId === "openai");
  assert.equal(openaiModels.length, 1);
  assert.equal(openaiModels[0].value, "openai/custom-openai-scanned");

  // Multi-slash model keeps true providerId & full value
  const multiSlash = catalog.modelOptionMap.get("iteracompute/openai/gpt-6-luna");
  assert.ok(multiSlash);
  assert.equal(multiSlash.providerId, "iteracompute");
  assert.equal(catalog.modelProviderMap.get("iteracompute/openai/gpt-6-luna"), "iteracompute");

  // Alias model is included and mapped in capsMap
  assert.ok(catalog.modelOptionMap.has("anthropic/claude-3-7-sonnet"));
  assert.ok(catalog.capsMap.has("anthropic/claude-3-7-sonnet"));
});

test("ModelSelect catalogUtils - circular reference exclusion only excludes combos by bare ID", () => {
  const baseCaps = getCapabilitiesForModel("openai", "gpt-4o");
  const allModels = [
    createModelOption("gpt-4o", "openai/gpt-4o", "GPT-4o", "openai", "OpenAI", baseCaps),
    createModelOption("gpt-4o", "gpt-4o", "gpt-4o", "combo", "Combos", baseCaps),
    createModelOption("claude-sonnet", "anthropic/claude-sonnet", "Claude Sonnet", "anthropic", "Anthropic", baseCaps),
  ];

  const excludeSet = new Set(["gpt-4o", "combo/gpt-4o"]);

  const res = filterCatalogModels({
    allModels,
    connectedProviderIds: new Set(["openai", "anthropic"]),
    hasConnectedAccounts: true,
    connectedOnly: false,
    kindFilter: null,
    activeModalityFilter: "all",
    searchTokens: [],
    excludeSet,
    selectedProvider: "all",
  });

  // Combo named gpt-4o is excluded, but upstream openai/gpt-4o remains visible
  assert.equal(
    res.visibleModels.some((m) => m.value === "openai/gpt-4o"),
    true
  );
  assert.equal(
    res.visibleModels.some((m) => m.providerId === "combo"),
    false
  );
});

test("ModelSelect catalogUtils - provider sidebar sort order stays stable when models are selected", () => {
  const providerCounts = new Map<string, number>([
    ["zai", 10],
    ["anthropic", 5],
    ["openai", 8],
  ]);
  const providerMetadata = new Map<string, { providerName: string }>([
    ["zai", { providerName: "Z.ai" }],
    ["anthropic", { providerName: "Anthropic" }],
    ["openai", { providerName: "OpenAI" }],
  ]);
  const connected = new Set(["anthropic", "openai"]);

  const initialCounts = new Map<string, number>();
  const before = buildStableProviderSidebarItems(
    providerCounts,
    providerMetadata,
    connected,
    initialCounts
  );

  // Connected first (Anthropic, OpenAI alphabetical), then unconnected (Z.ai)
  assert.deepEqual(
    before.map((p) => p.providerId),
    ["anthropic", "openai", "zai"]
  );

  // Selecting models in Z.ai must NOT move Z.ai to the top or shift list positions
  const modelProviderMap = new Map<string, string>([["zai/glm-4", "zai"]]);
  const afterSelectedCounts = computeSelectedCountsByProvider(["zai/glm-4"], modelProviderMap);
  const after = buildStableProviderSidebarItems(
    providerCounts,
    providerMetadata,
    connected,
    afterSelectedCounts
  );

  assert.deepEqual(
    after.map((p) => p.providerId),
    ["anthropic", "openai", "zai"]
  );
  assert.equal(after.find((p) => p.providerId === "zai")?.selectedCount, 1);
});

test("ModelSelect catalogUtils - computeVirtualRange covers full list with zero hidden items", () => {
  const itemHeight = 64;
  const totalCount = 500;
  const viewportHeight = 400;

  // Empty list
  const empty = computeVirtualRange(0, viewportHeight, 0, itemHeight, 5);
  assert.equal(empty.totalHeight, 0);
  assert.equal(empty.endIndex, -1);

  // Top of list
  const top = computeVirtualRange(0, viewportHeight, totalCount, itemHeight, 5);
  assert.equal(top.startIndex, 0);
  assert.equal(top.offsetTop, 0);
  assert.ok(top.endIndex >= 6 && top.endIndex <= 15);
  assert.equal(top.totalHeight, totalCount * itemHeight);

  // Bottom of list: reaches index 499 (no hidden items)
  const maxScroll = totalCount * itemHeight - viewportHeight;
  const bottom = computeVirtualRange(maxScroll, viewportHeight, totalCount, itemHeight, 5);
  assert.equal(bottom.endIndex, 499);
  assert.ok(bottom.startIndex > 480);
});
