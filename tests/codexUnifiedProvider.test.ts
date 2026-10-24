process.env.NODE_ENV = "test";

import test from "node:test";
import assert from "node:assert/strict";
import { ProviderRegistry } from "../src/providers/core/registry.js";
import { metadata as codexMetadata } from "../src/providers/runtime/codex/metadata.js";
import { getRegistryProvider } from "../src/shared/constants/providerRegistry.js";

test("OpenAI Codex Unified Provider - Merged App-Server and Aliases Resolution", () => {
  // 1. Canonical provider resolution
  const codex = ProviderRegistry.get("codex");
  assert.ok(codex, "ProviderRegistry must resolve codex");
  assert.equal(codex.id, "codex");
  assert.equal(codexMetadata.name, "OpenAI Codex");
  assert.equal(codexMetadata.category, "oauth");

  // 2. BaseUrls includes both online API and App-Server websocket
  assert.ok(codexMetadata.baseUrls.includes("https://chatgpt.com/backend-api/codex/responses"));
  assert.ok(codexMetadata.baseUrls.includes("codex-app-server://cli/websocket"));

  // 3. Models verification
  assert.ok(codexMetadata.models.some((m) => m.id === "gpt-5.5-codex"));
  assert.ok(codexMetadata.models.some((m) => m.id === "codex-pro"));

  // 4. Aliases resolution
  for (const alias of ["codex-app-server", "cxa"]) {
    const canonical = ProviderRegistry.resolveCanonicalId(alias);
    assert.equal(canonical, "codex", `Alias '${alias}' must resolve to 'codex'`);
    const inst = ProviderRegistry.get(alias);
    assert.equal(inst.id, "codex");
    const meta = getRegistryProvider(alias);
    assert.ok(meta, `Metadata for alias '${alias}' must exist`);
    assert.equal(meta?.id, "codex");
  }
});
