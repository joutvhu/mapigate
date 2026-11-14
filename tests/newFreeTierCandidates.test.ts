import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { PROVIDER_REGISTRY } from "../src/providers/core/metadataRegistry.js";
import { ProviderRegistry } from "../src/providers/core/registry.js";

import { resolveCandidateUrls } from "../src/core/scanner/urlResolver.js";

test("New Free Tier Providers - IteraCompute metadata and registry verification", async () => {
  const itera = PROVIDER_REGISTRY["iteracompute"];
  assert.ok(itera, "iteracompute must exist in PROVIDER_REGISTRY");
  assert.equal(itera.name, "IteraCompute");
  assert.equal(itera.category, "freeTier");
  assert.equal(itera.image, "/assets/providers/iteracompute/icon.svg");
  assert.equal(itera.baseUrl, "https://api.iteracompute.com/v1");

  const iconPath = path.resolve(process.cwd(), "src/providers/catalog/iteracompute/assets/icon.svg");
  assert.ok(fs.existsSync(iconPath), "IteraCompute icon.svg must exist");

  const runtimeInstance = ProviderRegistry.get("iteracompute");
  assert.ok(runtimeInstance, "ProviderRegistry must resolve iteracompute instance");
  assert.equal(runtimeInstance.id, "iteracompute");
  assert.equal(runtimeInstance.supportsQuota(), true, "IteraCompute must support quota tracking");

  // Verify candidate URLs resolution never includes 404 root /models
  const candidates = resolveCandidateUrls("https://api.iteracompute.com/v1", "openai", "iteracompute", itera);
  assert.ok(candidates.includes("https://api.iteracompute.com/v1/models"));
  assert.ok(!candidates.includes("https://api.iteracompute.com/models"), "Must not include root /models for IteraCompute");

  // Test probeModels on 503 fallback
  const origFetch = globalThis.fetch;
  try {
    globalThis.fetch = async () => new Response(JSON.stringify({ detail: "provider catalog unavailable" }), { status: 503 });
    const probeRes = await (runtimeInstance as any).probeModels({ apiKey: "test-itera-key" });
    assert.equal(probeRes?.success, true, "Must gracefully fallback on 503 catalog unavailable");
    assert.ok(probeRes?.models?.length > 0);
  } finally {
    globalThis.fetch = origFetch;
  }
});

test("New Free Tier Providers - Onomeo metadata and registry verification", () => {
  const onomeo = PROVIDER_REGISTRY["onomeo"];
  assert.ok(onomeo, "onomeo must exist in PROVIDER_REGISTRY");
  assert.equal(onomeo.name, "Onomeo");
  assert.equal(onomeo.category, "freeTier");
  assert.equal(onomeo.image, "/assets/providers/onomeo/icon.svg");
  assert.equal(onomeo.baseUrl, "https://onomeo.com/v1");

  const iconPath = path.resolve(process.cwd(), "src/providers/catalog/onomeo/assets/icon.svg");
  assert.ok(fs.existsSync(iconPath), "Onomeo icon.svg must exist");

  const runtimeInstance = ProviderRegistry.get("onomeo");
  assert.ok(runtimeInstance, "ProviderRegistry must resolve onomeo instance");
  assert.equal(runtimeInstance.id, "onomeo");
  assert.equal(runtimeInstance.supportsQuota(), true, "Onomeo must support quota tracking");
});

test("New Free Tier Providers - Sail Research metadata and registry verification", () => {
  const sail = PROVIDER_REGISTRY["sail"];
  assert.ok(sail, "sail must exist in PROVIDER_REGISTRY");
  assert.equal(sail.name, "Sail Research");
  assert.equal(sail.category, "freeTier");
  assert.equal(sail.image, "/assets/providers/sail/icon.svg");
  assert.equal(sail.baseUrl, "https://api.sailresearch.com/v1");
  assert.equal(sail.format, "responses");

  const iconPath = path.resolve(process.cwd(), "src/providers/catalog/sail/assets/icon.svg");
  assert.ok(fs.existsSync(iconPath), "Sail icon.svg must exist");

  const runtimeInstance = ProviderRegistry.get("sail");
  assert.ok(runtimeInstance, "ProviderRegistry must resolve sail instance");
  assert.equal(runtimeInstance.id, "sail");
});
