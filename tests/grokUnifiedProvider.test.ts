process.env.NODE_ENV = "test";

import test from "node:test";
import assert from "node:assert/strict";
import { ProviderRegistry } from "../src/providers/core/registry.js";
import { metadata as supergrokMetadata } from "../src/providers/runtime/grok-cli/metadata.js";
import { metadata as grokMetadata } from "../src/providers/runtime/grok/metadata.js";

test("Grok Providers - Separation of Developer API and SuperGrok Subscription", () => {
  // 1. Official Developer API (xAI Grok)
  const xaiInstance = ProviderRegistry.get("grok");
  assert.ok(xaiInstance, "Must resolve grok instance");
  assert.equal(xaiInstance.id, "grok");
  assert.equal(grokMetadata.baseUrl, "https://api.x.ai/v1/chat/completions");

  const xaiAlias = ProviderRegistry.resolveCanonicalId("xai");
  assert.equal(xaiAlias, "grok", "'xai' alias must resolve to official 'grok'");

  // 2. SuperGrok (grok.com) Subscription Provider
  const subInstance = ProviderRegistry.get("grok-cli");
  assert.ok(subInstance, "Must resolve grok-cli subscription instance");
  assert.equal(subInstance.id, "grok-cli");
  assert.equal(supergrokMetadata.name, "SuperGrok (grok.com)");

  // 3. Aliases resolution for SuperGrok
  for (const alias of ["grok-web", "grok-build", "gb", "gcli", "gw", "supergrok"]) {
    const resolved = ProviderRegistry.resolveCanonicalId(alias);
    assert.equal(resolved, "grok-cli", `Alias '${alias}' must resolve to 'grok-cli'`);
    const instance = ProviderRegistry.get(alias);
    assert.equal(instance.id, "grok-cli", `Provider instance for alias '${alias}' must be grok-cli`);
  }

  // 4. Verify distinct endpoints
  assert.ok(supergrokMetadata.baseUrls.includes("https://cli-chat-proxy.grok.com/v1/responses"));
  assert.ok(supergrokMetadata.baseUrls.includes("https://grok.com/rest/app-chat/conversations/new"));
  assert.notEqual(supergrokMetadata.baseUrl, grokMetadata.baseUrl);
});
