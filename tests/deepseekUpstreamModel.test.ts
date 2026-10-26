import test from "node:test";
import assert from "node:assert/strict";
import { ProviderRegistry } from "../src/providers/core/registry.js";
import { metadata } from "../src/providers/runtime/deepseek/metadata.js";
import type { ProviderRequestContext } from "../src/providers/core/types.js";

test("DeepSeek V4.1 Flash upstream model mapping (#4940)", () => {
  const provider = ProviderRegistry.get("deepseek");
  assert.ok(provider, "DeepSeek provider must be registered");

  const modelEntry = metadata.models.find((m) => m.id === "deepseek-v4.1-flash");
  assert.ok(modelEntry, "deepseek-v4.1-flash must exist in metadata");
  assert.equal(modelEntry.upstreamModelId, "deepseek-flash");

  // 1. Plain targetModel
  const context: ProviderRequestContext = {
    req: {} as any,
    targetModel: "deepseek-v4.1-flash",
    clientFormat: "openai",
    targetFormat: "openai",
    body: { model: "deepseek-v4.1-flash", messages: [{ role: "user", content: "hi" }] },
    provider: metadata,
  };

  const transformed = provider.transformRequestBody(context);
  assert.equal(transformed.model, "deepseek-flash");

  // 2. With thinking suffix (e.g. (high))
  const contextWithSuffix: ProviderRequestContext = {
    ...context,
    targetModel: "deepseek-v4.1-flash(high)",
    body: { model: "deepseek-v4.1-flash(high)", messages: [{ role: "user", content: "hi" }] },
  };

  const transformedWithSuffix = provider.transformRequestBody(contextWithSuffix);
  assert.equal(transformedWithSuffix.model, "deepseek-flash(high)");

  // 3. Models without upstreamModelId remain unchanged
  const contextPro: ProviderRequestContext = {
    ...context,
    targetModel: "deepseek-v4-pro",
    body: { model: "deepseek-v4-pro", messages: [{ role: "user", content: "hi" }] },
  };
  const transformedPro = provider.transformRequestBody(contextPro);
  assert.equal(transformedPro.model, "deepseek-v4-pro");
});
