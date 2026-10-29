process.env.NODE_ENV = "test";

import test from "node:test";
import assert from "node:assert/strict";
import { ProviderRegistry } from "../src/providers/core/registry.js";
import { metadata as cbMetadata } from "../src/providers/runtime/codebuddy/metadata.js";
import { getRegistryProvider } from "../src/shared/constants/providerRegistry.js";

test("CodeBuddy Unified Provider - Regions and Aliases Resolution", () => {
  // 1. Canonical provider resolution
  const cb = ProviderRegistry.get("codebuddy");
  assert.ok(cb, "ProviderRegistry must resolve codebuddy");
  assert.equal(cb.id, "codebuddy");
  assert.equal(cbMetadata.name, "CodeBuddy");
  assert.equal(cbMetadata.category, "oauth");

  // 2. Regions verification
  assert.ok(cbMetadata.regions && cbMetadata.regions.length === 2);
  assert.equal(cbMetadata.defaultRegion, "intl");
  assert.equal(cbMetadata.regions[0].id, "intl");
  assert.equal(cbMetadata.regions[1].id, "cn");

  // 3. Aliases resolution
  for (const alias of ["codebuddy-intl", "codebuddy-cn", "cbai", "cbcn"]) {
    const canonical = ProviderRegistry.resolveCanonicalId(alias);
    assert.equal(canonical, "codebuddy", `Alias '${alias}' must resolve to 'codebuddy'`);
    const inst = ProviderRegistry.get(alias);
    assert.equal(inst.id, "codebuddy");
    const meta = getRegistryProvider(alias);
    assert.ok(meta, `Metadata for alias '${alias}' must exist`);
    assert.equal(meta?.id, "codebuddy");
  }
});

test("CodeBuddy Unified Provider - Channel Verification Headers", async () => {
  const cb = ProviderRegistry.get("codebuddy") as any;
  assert.ok(cb, "ProviderRegistry must resolve codebuddy");

  const mockContext: any = {
    account: { rawApiKey: "test_token" },
    req: { headers: {} },
  };

  const headers = await cb.buildHeaders(mockContext);
  assert.ok(typeof headers["X-Request-ID"] === "string" && headers["X-Request-ID"].length > 0);
  assert.ok(typeof headers["X-Conversation-ID"] === "string" && headers["X-Conversation-ID"].length > 0);
  assert.equal(headers["X-Request-ID"], headers["X-Conversation-Request-ID"]);
  assert.equal(headers["X-Request-ID"], headers["X-Conversation-Message-ID"]);
  assert.notEqual(headers["X-Request-ID"], headers["X-Conversation-ID"]);
});
