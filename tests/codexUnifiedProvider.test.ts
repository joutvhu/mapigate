process.env.NODE_ENV = "test";

import test from "node:test";
import assert from "node:assert/strict";
import { ProviderRegistry } from "../src/providers/core/registry.js";
import { metadata as codexMetadata, CODEX_CLIENT_VERSION } from "../src/providers/runtime/codex/metadata.js";
import { getRegistryProvider } from "../src/shared/constants/providerRegistry.js";
import { resolveCandidateUrls } from "../src/core/scanner/urlResolver.js";

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
  assert.ok(codexMetadata.models.some((m) => m.id === "gpt-6.2-sol"));
  assert.ok(codexMetadata.models.some((m) => m.id === "gpt-6.2-astra"));
  assert.ok(codexMetadata.models.some((m) => m.id === "gpt-6.1-terra"));
  assert.ok(codexMetadata.models.some((m) => m.id === "gpt-daybreak-blue-latest"));
  assert.equal(codexMetadata.defaultHeaders?.["User-Agent"], `codex_cli_rs/${CODEX_CLIENT_VERSION}`);
  assert.equal(codexMetadata.defaultHeaders?.["version"], CODEX_CLIENT_VERSION);
  const resolvedUrls = resolveCandidateUrls("https://chatgpt.com/backend-api/codex/responses", "openai-responses", "codex");
  assert.equal(resolvedUrls[0], `https://chatgpt.com/backend-api/codex/models?client_version=${CODEX_CLIENT_VERSION}`);

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
