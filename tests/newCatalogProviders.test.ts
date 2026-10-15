import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import {
  PROVIDER_REGISTRY,
  getRegistryProvider,
} from "../src/shared/constants/providerRegistry.js";

test("New Catalog Providers - Septor Labs configuration and assets", () => {
  const septor = PROVIDER_REGISTRY["septor"];
  assert.ok(septor, "septor must exist in PROVIDER_REGISTRY");
  assert.equal(septor.id, "septor");
  assert.equal(septor.name, "Septor Labs");
  assert.equal(septor.baseUrl, "https://api.septorlabs.com/v1");
  assert.equal(septor.validateUrl, "https://api.septorlabs.com/v1/models");
  assert.equal(septor.format, "openai");
  assert.equal(septor.passthroughModels, true);

  const modelIds = septor.models.map((m) => m.id);
  assert.ok(modelIds.includes("qwen3-coder-free"));
  assert.ok(modelIds.includes("hermes-3-llama-3.1-405b-free"));
  assert.ok(modelIds.includes("qwen3-next-80b-a3b-instruct-free"));
  assert.ok(modelIds.includes("minimax-m2.5-free"));

  const byLookup = getRegistryProvider("septor");
  assert.ok(byLookup);
  assert.equal(byLookup.id, "septor");

  const byAlias = getRegistryProvider("septorlabs");
  assert.ok(byAlias);
  assert.equal(byAlias.id, "septor");

  const iconPath = path.resolve(process.cwd(), "src/providers/catalog/septor/assets/icon.svg");
  assert.ok(fs.existsSync(iconPath), "Septor icon.svg must exist");
});

test("New Catalog Providers - OrcaRouter configuration and assets", () => {
  const orca = PROVIDER_REGISTRY["orcarouter"];
  assert.ok(orca, "orcarouter must exist in PROVIDER_REGISTRY");
  assert.equal(orca.id, "orcarouter");
  assert.equal(orca.name, "OrcaRouter");
  assert.equal(orca.baseUrl, "https://api.orcarouter.ai/v1");
  assert.equal(orca.validateUrl, "https://api.orcarouter.ai/v1/models");
  assert.equal(orca.format, "openai");
  assert.equal(orca.passthroughModels, true);

  const byLookup = getRegistryProvider("orcarouter");
  assert.ok(byLookup);
  assert.equal(byLookup.id, "orcarouter");

  const byAlias = getRegistryProvider("orca");
  assert.ok(byAlias);
  assert.equal(byAlias.id, "orcarouter");

  const iconPath = path.resolve(process.cwd(), "src/providers/catalog/orcarouter/assets/icon.svg");
  assert.ok(fs.existsSync(iconPath), "OrcaRouter icon.svg must exist");
});

test("New Catalog Providers - AnyAPI configuration and assets", () => {
  const anyapi = PROVIDER_REGISTRY["anyapi"];
  assert.ok(anyapi, "anyapi must exist in PROVIDER_REGISTRY");
  assert.equal(anyapi.id, "anyapi");
  assert.equal(anyapi.name, "AnyAPI");
  assert.equal(anyapi.baseUrl, "https://api.anyapi.ai/v1");
  assert.equal(anyapi.validateUrl, "https://api.anyapi.ai/v1/models");
  assert.equal(anyapi.format, "openai");
  assert.equal(anyapi.passthroughModels, true);

  const modelIds = anyapi.models.map((m) => m.id);
  assert.ok(modelIds.includes("qwen/qwen3-coder:free"));
  assert.ok(modelIds.includes("meta-llama/llama-3.3-70b-instruct:free"));
  assert.ok(modelIds.includes("nvidia/nemotron-3-ultra-550b-a55b:free"));

  const byLookup = getRegistryProvider("anyapi");
  assert.ok(byLookup);
  assert.equal(byLookup.id, "anyapi");

  const iconPath = path.resolve(process.cwd(), "src/providers/catalog/anyapi/assets/icon.svg");
  assert.ok(fs.existsSync(iconPath), "AnyAPI icon.svg must exist");
});

test("New Catalog Providers - LLMTR configuration and assets", () => {
  const llmtr = PROVIDER_REGISTRY["llmtr"];
  assert.ok(llmtr, "llmtr must exist in PROVIDER_REGISTRY");
  assert.equal(llmtr.id, "llmtr");
  assert.equal(llmtr.name, "LLMTR");
  assert.equal(llmtr.baseUrl, "https://llmtr.com/v1");
  assert.equal(llmtr.validateUrl, "https://llmtr.com/v1/models");
  assert.equal(llmtr.format, "openai");
  assert.equal(llmtr.passthroughModels, true);

  const modelIds = llmtr.models.map((m) => m.id);
  assert.ok(modelIds.includes("nvidia/nemotron-3-ultra-550b-a55b"));
  assert.ok(modelIds.includes("qwen/qwen3.8-27b-free"));

  const byLookup = getRegistryProvider("llmtr");
  assert.ok(byLookup);
  assert.equal(byLookup.id, "llmtr");

  const iconPath = path.resolve(process.cwd(), "src/providers/catalog/llmtr/assets/icon.svg");
  assert.ok(fs.existsSync(iconPath), "LLMTR icon.svg must exist");
});
