process.env.NODE_ENV = "test";

import test from "node:test";
import assert from "node:assert/strict";
import { ProviderRegistry } from "../src/providers/core/registry.js";
import { resolveAlibabaBaseUrl, normalizeAlibabaEndpoint } from "../src/providers/runtime/alicode/provider.js";
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

  assert.equal(
    resolveAlibabaBaseUrl("token-plan-cn", "any-key"),
    "https://token-plan.cn-beijing.maas.aliyuncs.com/compatible-mode/v1",
    "token-plan-cn region must route to Beijing Token Plan"
  );

  assert.equal(
    resolveAlibabaBaseUrl("ap-southeast-1", "any-key"),
    "https://dashscope-intl.aliyuncs.com/compatible-mode/v1",
    "ap-southeast-1 region must route to Singapore Model Studio"
  );

  assert.equal(
    resolveAlibabaBaseUrl("cn-beijing", "any-key"),
    "https://dashscope.aliyuncs.com/compatible-mode/v1",
    "cn-beijing region must route to Beijing Model Studio"
  );

  assert.equal(
    resolveAlibabaBaseUrl("cn-hongkong", "any-key"),
    "https://cn-hongkong.dashscope.aliyuncs.com/compatible-mode/v1",
    "cn-hongkong region must route to Hong Kong Model Studio"
  );

  assert.equal(
    resolveAlibabaBaseUrl("us-east-1", "any-key"),
    "https://dashscope-us.aliyuncs.com/compatible-mode/v1",
    "us-east-1 region must route to US Virginia Model Studio"
  );

  // 3. Custom Dedicated Workspace URL overrides
  assert.equal(
    resolveAlibabaBaseUrl(
      "ap-southeast-1",
      "sk-custom",
      "https://ws-tx2va1idka7fndag.ap-southeast-1.maas.aliyuncs.com/compatible-mode/v1"
    ),
    "https://ws-tx2va1idka7fndag.ap-southeast-1.maas.aliyuncs.com/compatible-mode/v1",
    "customBaseUrl must take highest priority"
  );

  assert.equal(
    normalizeAlibabaEndpoint("ws-tx2va1idka7fndag.ap-southeast-1.maas.aliyuncs.com"),
    "https://ws-tx2va1idka7fndag.ap-southeast-1.maas.aliyuncs.com/compatible-mode/v1",
    "normalizeAlibabaEndpoint must handle bare host name"
  );

  assert.equal(
    normalizeAlibabaEndpoint("https://ws-tx2va1idka7fndag.ap-southeast-1.maas.aliyuncs.com/compatible-mode/v1/chat/completions"),
    "https://ws-tx2va1idka7fndag.ap-southeast-1.maas.aliyuncs.com/compatible-mode/v1",
    "normalizeAlibabaEndpoint must strip /chat/completions"
  );

  assert.equal(
    resolveAlibabaBaseUrl(
      "ap-southeast-1",
      "sk-custom",
      undefined,
      "ws-tx2va1idka7fndag"
    ),
    "https://ws-tx2va1idka7fndag.ap-southeast-1.maas.aliyuncs.com/compatible-mode/v1",
    "workspaceId + region must format into dedicated workspace endpoint"
  );

  // 4. ProviderRegistry aliases resolution
  const provInstance = ProviderRegistry.get("alicode");
  assert.ok(provInstance, "ProviderRegistry must resolve alicode");
  assert.equal(provInstance.id, "alicode");

  for (const alias of ["alibaba", "alicode-intl", "alims-intl", "alitp-intl", "dashscope", "qwen"]) {
    const resolved = ProviderRegistry.resolveCanonicalId(alias);
    assert.equal(resolved, "alicode", `Alias '${alias}' must resolve to 'alicode'`);
    const resolvedInst = ProviderRegistry.get(alias);
    assert.equal(resolvedInst.id, "alicode", `Provider instance for alias '${alias}' must be alicode`);
  }

  // 5. Metadata verification
  assert.equal(metadata.id, "alicode");
  assert.ok(metadata.regions && metadata.regions.length >= 10);
  assert.equal(metadata.hasProviderSpecificData, true);
});
