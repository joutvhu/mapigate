process.env.NODE_ENV = "test";

import test from "node:test";
import assert from "node:assert/strict";
import { ProviderRegistry } from "../src/providers/core/registry.js";
import { metadata as qoderMetadata } from "../src/providers/runtime/qoder/metadata.js";
import { getRegistryProvider } from "../src/shared/constants/providerRegistry.js";

test("Qoder Unified Provider - Regions and Aliases Resolution", () => {
  // 1. Canonical provider resolution
  const qd = ProviderRegistry.get("qoder");
  assert.ok(qd, "ProviderRegistry must resolve qoder");
  assert.equal(qd.id, "qoder");
  assert.equal(qoderMetadata.name, "Qoder");
  assert.equal(qoderMetadata.category, "oauth");

  // 2. Regions verification
  assert.ok(qoderMetadata.regions && qoderMetadata.regions.length === 2);
  assert.equal(qoderMetadata.defaultRegion, "intl");
  assert.equal(qoderMetadata.regions[0].id, "intl");
  assert.equal(qoderMetadata.regions[1].id, "cn");

  // 3. Aliases resolution
  for (const alias of ["qoder-cn", "qdcn"]) {
    const canonical = ProviderRegistry.resolveCanonicalId(alias);
    assert.equal(canonical, "qoder", `Alias '${alias}' must resolve to 'qoder'`);
    const inst = ProviderRegistry.get(alias);
    assert.equal(inst.id, "qoder");
    const meta = getRegistryProvider(alias);
    assert.ok(meta, `Metadata for alias '${alias}' must exist`);
    assert.equal(meta?.id, "qoder");
  }
});
