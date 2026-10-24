process.env.NODE_ENV = "test";

import test from "node:test";
import assert from "node:assert/strict";
import { ProviderRegistry } from "../src/providers/core/registry.js";
import { metadata as minimaxMetadata } from "../src/providers/runtime/minimax/metadata.js";
import { metadata as minimaxCodeMetadata } from "../src/providers/runtime/minimax-code/metadata.js";

test("MiniMax Unified Providers - Clean separation of OAuth Code Agent and Direct API Key", () => {
  // 1. Direct API Key Provider (MiniMax)
  const minimaxInstance = ProviderRegistry.get("minimax");
  assert.ok(minimaxInstance, "Must resolve minimax provider");
  assert.equal(minimaxInstance.id, "minimax");
  assert.equal(minimaxMetadata.name, "MiniMax");
  assert.equal(minimaxMetadata.category, "apikey");
  assert.ok(minimaxMetadata.regions && minimaxMetadata.regions.length === 2);
  assert.equal(minimaxMetadata.defaultRegion, "global");

  for (const alias of ["minimax-cn", "minimax-coding"]) {
    const resolved = ProviderRegistry.resolveCanonicalId(alias);
    assert.equal(resolved, "minimax", `Alias '${alias}' must resolve to 'minimax'`);
    const inst = ProviderRegistry.get(alias);
    assert.equal(inst.id, "minimax");
  }

  // 2. OAuth Device Code Provider (MiniMax Code)
  const mcodeInstance = ProviderRegistry.get("minimax-code");
  assert.ok(mcodeInstance, "Must resolve minimax-code provider");
  assert.equal(mcodeInstance.id, "minimax-code");
  assert.equal(minimaxCodeMetadata.name, "MiniMax Code");
  assert.equal(minimaxCodeMetadata.category, "oauth");
  assert.ok(minimaxCodeMetadata.regions && minimaxCodeMetadata.regions.length === 2);
  assert.equal(minimaxCodeMetadata.defaultRegion, "global");

  for (const alias of ["minimax-code-global", "mmg", "mcode"]) {
    const resolved = ProviderRegistry.resolveCanonicalId(alias);
    assert.equal(resolved, "minimax-code", `Alias '${alias}' must resolve to 'minimax-code'`);
    const inst = ProviderRegistry.get(alias);
    assert.equal(inst.id, "minimax-code");
  }
});
