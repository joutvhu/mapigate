import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import {
  PROVIDER_REGISTRY,
  getRegistryProvider,
  getAllRegistryProviders,
} from "../src/shared/constants/providerRegistry.js";
import {
  CODING_PROVIDERS_LIST,
  API_KEY_PROVIDERS_LIST,
} from "../src/web/src/constants/providersData.js";
import { getPricingForModel } from "../src/core/usage/pricing.js";
import { getCapabilitiesForModel } from "../src/core/capabilities/index.js";

test("xKiro Provider - Registry Configuration", () => {
  const xkiro = PROVIDER_REGISTRY["xkiro"];
  assert.ok(xkiro, "xkiro must be present in PROVIDER_REGISTRY");
  assert.equal(xkiro.id, "xkiro");
  assert.equal(xkiro.name, "xKiro");
  assert.equal(xkiro.alias, "xk");
  assert.deepEqual(xkiro.aliases, ["xk", "xkiro"]);
  assert.equal(xkiro.uiAlias, "xk");
  assert.equal(xkiro.color, "#16a34a");
  assert.equal(xkiro.image, "/assets/providers/xkiro/icon.svg");
  assert.equal(xkiro.website, "https://xkiro.com");
  assert.equal(xkiro.notice?.apiKeyUrl, "https://xkiro.com");
  assert.equal(xkiro.category, "apikey");
  assert.equal(xkiro.authType, "apikey");
  assert.equal(xkiro.baseUrl, "https://api.xkiro.com/v1");
  assert.deepEqual(xkiro.baseUrls, ["https://api.xkiro.com/v1"]);
  assert.equal(xkiro.validateUrl, "https://api.xkiro.com/v1/models");
  assert.equal(xkiro.format, "openai");
  assert.deepEqual(xkiro.defaultHeaders, { "Content-Type": "application/json" });
  assert.equal(xkiro.passthroughModels, true);
});

test("xKiro Provider - Lookup by ID and Aliases", () => {
  const byId = getRegistryProvider("xkiro");
  assert.ok(byId, "getRegistryProvider('xkiro') must return provider");
  assert.equal(byId.id, "xkiro");

  const byUpperId = getRegistryProvider("XKIRO");
  assert.ok(byUpperId, "getRegistryProvider('XKIRO') case-insensitive lookup");
  assert.equal(byUpperId.id, "xkiro");

  const byAlias = getRegistryProvider("xk");
  assert.ok(byAlias, "getRegistryProvider('xk') must resolve xkiro by alias");
  assert.equal(byAlias.id, "xkiro");

  const byUpperAlias = getRegistryProvider("XK");
  assert.ok(byUpperAlias, "getRegistryProvider('XK') must resolve xkiro by uppercase alias");
  assert.equal(byUpperAlias.id, "xkiro");

  const allProviders = getAllRegistryProviders();
  assert.ok(allProviders.some((p) => p.id === "xkiro"), "getAllRegistryProviders contains xkiro");
});

test("xKiro Provider - Popular Models and Context Lengths", () => {
  const xkiro = PROVIDER_REGISTRY["xkiro"];
  const modelIds = xkiro.models.map((m) => m.id);

  const expectedModels = [
    { id: "deepseek/deepseek-r1", contextLength: 131072 },
    { id: "deepseek/deepseek-v3", contextLength: 131072 },
    { id: "anthropic/claude-3-7-sonnet", contextLength: 200000 },
    { id: "anthropic/claude-3-5-sonnet", contextLength: 200000 },
    { id: "openai/gpt-4o", contextLength: 128000 },
    { id: "openai/o3-mini", contextLength: 200000 },
    { id: "google/gemini-2.5-pro", contextLength: 1000000 },
    { id: "google/gemini-2.5-flash", contextLength: 1000000 },
  ];

  for (const expected of expectedModels) {
    assert.ok(modelIds.includes(expected.id), `Model ${expected.id} must be in xkiro models`);
    const found = xkiro.models.find((m) => m.id === expected.id);
    assert.equal(found?.contextLength, expected.contextLength, `Context length for ${expected.id}`);
  }
});

test("xKiro Provider - Web Providers Data Lists", () => {
  const codingProvider = CODING_PROVIDERS_LIST.find((p) => p.id === "xkiro");
  assert.ok(codingProvider, "xkiro must be present in CODING_PROVIDERS_LIST");
  assert.equal(codingProvider.image, "/assets/providers/xkiro/icon.svg");

  const apiKeyProvider = API_KEY_PROVIDERS_LIST.find((p) => p.id === "xkiro");
  assert.ok(apiKeyProvider, "xkiro must be present in API_KEY_PROVIDERS_LIST");
  assert.equal(apiKeyProvider.category, "apikey");
  assert.equal(apiKeyProvider.format, "openai");
});

test("xKiro Provider - Vector Icon Exists on Disk", () => {
  const publicIconPath = path.resolve(process.cwd(), "src/web/public/providers/xkiro.svg");
  assert.ok(fs.existsSync(publicIconPath), "src/web/public/providers/xkiro.svg must exist");
  const publicContent = fs.readFileSync(publicIconPath, "utf-8");
  assert.ok(publicContent.includes("<svg"), "Icon must be a valid SVG file");
  assert.ok(publicContent.includes("#16a34a"), "Icon should use brand color #16a34a");

  const moduleIconPath = path.resolve(process.cwd(), "src/providers/xkiro/assets/icon.svg");
  assert.ok(fs.existsSync(moduleIconPath), "src/providers/xkiro/assets/icon.svg must exist");
  const moduleContent = fs.readFileSync(moduleIconPath, "utf-8");
  assert.ok(moduleContent.includes("<svg"), "Module icon must be a valid SVG file");
  assert.ok(moduleContent.includes("#16a34a"), "Module icon should use brand color #16a34a");
});

test("xKiro Provider - Pricing and Capabilities Resolution", () => {
  // 1. Pricing resolution
  const r1Pricing = getPricingForModel("xkiro", "deepseek/deepseek-r1");
  assert.ok(r1Pricing, "Pricing for deepseek/deepseek-r1");
  assert.equal(r1Pricing.input, 0.55);
  assert.equal(r1Pricing.output, 2.19);

  const sonnetPricing = getPricingForModel("xkiro", "anthropic/claude-3-7-sonnet");
  assert.ok(sonnetPricing, "Pricing for anthropic/claude-3-7-sonnet");
  assert.equal(sonnetPricing.input, 3.00);
  assert.equal(sonnetPricing.output, 15.00);

  const gpt4oPricing = getPricingForModel("xkiro", "openai/gpt-4o");
  assert.ok(gpt4oPricing, "Pricing for openai/gpt-4o");
  assert.equal(gpt4oPricing.input, 2.50);
  assert.equal(gpt4oPricing.output, 10.00);

  // 2. Capabilities resolution
  const sonnetCaps = getCapabilitiesForModel("xkiro", "anthropic/claude-3-7-sonnet");
  assert.ok(sonnetCaps, "Capabilities for claude-3-7-sonnet");
  assert.equal(sonnetCaps.vision, true);
  assert.equal(sonnetCaps.reasoning, true);

  const r1Caps = getCapabilitiesForModel("xkiro", "deepseek/deepseek-r1");
  assert.ok(r1Caps, "Capabilities for deepseek-r1");
  assert.equal(r1Caps.reasoning, true);
});
