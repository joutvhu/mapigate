process.env.NODE_ENV = "test";

import test from "node:test";
import assert from "node:assert/strict";
import { ProviderRegistry } from "../src/providers/core/registry.js";
import { metadata as clineMetadata } from "../src/providers/runtime/cline/metadata.js";
import { getRegistryProvider } from "../src/shared/constants/providerRegistry.js";
import { getClineAccessToken } from "../src/providers/runtime/cline/provider.js";

test("Cline Unified Provider - Merged ClinePass and Aliases Resolution", () => {
  // 1. Canonical provider resolution
  const cline = ProviderRegistry.get("cline");
  assert.ok(cline, "ProviderRegistry must resolve cline");
  assert.equal(cline.id, "cline");
  assert.equal(clineMetadata.name, "Cline");
  assert.equal(clineMetadata.category, "oauth");

  // 2. Models verification (contains both core and cline-pass models)
  assert.ok(clineMetadata.models.some((m) => m.id === "anthropic/claude-sonnet-4.6"));
  assert.ok(clineMetadata.models.some((m) => m.id === "cline-pass/glm-5.2"));
  assert.ok(clineMetadata.models.some((m) => m.id === "cline-pass/qwen3.7-max"));

  // 3. Aliases resolution
  for (const alias of ["clinepass", "cl"]) {
    const canonical = ProviderRegistry.resolveCanonicalId(alias);
    assert.equal(canonical, "cline", `Alias '${alias}' must resolve to 'cline'`);
    const inst = ProviderRegistry.get(alias);
    assert.equal(inst.id, "cline");
    const meta = getRegistryProvider(alias);
    assert.ok(meta, `Metadata for alias '${alias}' must exist`);
    assert.equal(meta?.id, "cline");
  }

  // 4. Token prefixing logic
  const jwt = "eyJhbGciOiJSUzI1NiJ9.eyJzdWIiOiIxMjMifQ.signature";
  assert.equal(getClineAccessToken(jwt), `workos:${jwt}`);
  assert.equal(getClineAccessToken("clp_api_key_12345"), "clp_api_key_12345");
  assert.equal(getClineAccessToken(`workos:${jwt}`), `workos:${jwt}`);
});
