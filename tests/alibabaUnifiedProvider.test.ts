process.env.NODE_ENV = "test";

import test from "node:test";
import assert from "node:assert/strict";
import { ProviderRegistry } from "../src/providers/core/registry.js";
import { resolveAlibabaBaseUrl } from "../src/providers/runtime/alicode/provider.js";
import { metadata } from "../src/providers/runtime/alicode/metadata.js";

test("Alibaba Unified Provider - Auto-detection and Region Routing", () => {
  // 1. Auto-detection from token prefix
  assert.equal(
    resolveAlibabaBaseUrl(undefined, "sk-sp-1234567890abcdef"),
    "https://coding-intl.dashscope.aliyuncs.com/v1",
    "sk-sp-* must auto-route to Coding Plan Intl"
  );

  assert.equal(
    resolveAlibabaBaseUrl(undefined, "tp-1234567890abcdef"),
    "https://token-plan.ap-southeast-1.maas.aliyuncs.com/compatible-mode/v1",
    "tp-* must auto-route to Token Plan Singapore"
  );

  assert.equal(
    resolveAlibabaBaseUrl(undefined, "sk-1234567890abcdef"),
    "https://dashscope-intl.aliyuncs.com/compatible-mode/v1",
    "sk-* must auto-route to Model Studio Intl"
  );

  // 2. Explicit region routing overrides
  assert.equal(
    resolveAlibabaBaseUrl("coding-cn", "sk-sp-123456"),
    "https://coding.dashscope.aliyuncs.com/v1",
    "coding-cn region must route to China Coding Plan"
  );

  assert.equal(
    resolveAlibabaBaseUrl("studio-cn", "sk-123456"),
    "https://dashscope.aliyuncs.com/compatible-mode/v1",
    "studio-cn region must route to China Model Studio"
  );

  assert.equal(
    resolveAlibabaBaseUrl("token-plan", "any-key"),
    "https://token-plan.ap-southeast-1.maas.aliyuncs.com/compatible-mode/v1",
    "token-plan region must route to Singapore Token Plan"
  );

  // 3. ProviderRegistry aliases resolution
  const provInstance = ProviderRegistry.get("alicode");
  assert.ok(provInstance, "ProviderRegistry must resolve alicode");
  assert.equal(provInstance.id, "alicode");

  for (const alias of ["alibaba", "alicode-intl", "alims-intl", "alitp-intl", "dashscope", "qwen"]) {
    const resolved = ProviderRegistry.resolveCanonicalId(alias);
    assert.equal(resolved, "alicode", `Alias '${alias}' must resolve to 'alicode'`);
    const resolvedInst = ProviderRegistry.get(alias);
    assert.equal(resolvedInst.id, "alicode", `Provider instance for alias '${alias}' must be alicode`);
  }

  // 4. Metadata verification
  assert.equal(metadata.id, "alicode");
  assert.ok(metadata.regions && metadata.regions.length >= 5);
  assert.equal(metadata.hasProviderSpecificData, true);
});
