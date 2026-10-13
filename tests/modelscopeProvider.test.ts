import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import {
  PROVIDER_REGISTRY,
  getRegistryProvider,
  getAllRegistryProviders,
} from "../src/shared/constants/providerRegistry.js";
import { ProviderRegistry } from "../src/providers/core/registry.js";
import { ModelscopeProvider } from "../src/providers/catalog/modelscope/provider.js";
import { COMMUNITY_PROVIDERS_CATALOG } from "../src/providers/catalog/communityCatalog.js";
import type { ProviderRequestContext } from "../src/providers/core/types.js";

test("ModelScope Provider - Metadata & Registry Configuration", () => {
  const ms = PROVIDER_REGISTRY["modelscope"];
  assert.ok(ms, "modelscope must be registered in PROVIDER_REGISTRY");
  assert.equal(ms.id, "modelscope");
  assert.equal(ms.name, "ModelScope");
  assert.equal(ms.alias, "ms");
  assert.deepEqual(ms.aliases, ["ms", "modelscope"]);
  assert.equal(ms.uiAlias, "ms");
  assert.equal(ms.color, "#624AFF");
  assert.equal(ms.iconBg, "#FFFFFF");
  assert.equal(ms.image, "/assets/providers/modelscope/icon.svg");
  assert.equal(ms.website, "https://modelscope.cn");
  assert.equal(ms.category, "apikey");
  assert.equal(ms.authType, "apikey");
  assert.equal(ms.format, "openai");
  assert.equal(ms.passthroughModels, true);

  // Domain guard: verify .cn domain and guard against .ai regression
  assert.equal(ms.baseUrl, "https://api-inference.modelscope.cn/v1/chat/completions");
  assert.ok(
    ms.baseUrl.includes("api-inference.modelscope.cn"),
    `Must use verified .cn domain: ${ms.baseUrl}`
  );
  assert.ok(
    !ms.baseUrl.includes("modelscope.ai"),
    "Must not regress to unverified .ai domain"
  );

  const modelIds = ms.models.map((m) => m.id);
  assert.ok(
    modelIds.includes("Qwen/Qwen2.5-Coder-32B-Instruct"),
    "Must include Qwen 2.5 Coder 32B"
  );
  assert.ok(
    modelIds.includes("Qwen/Qwen2.5-Coder-7B-Instruct"),
    "Must include Qwen 2.5 Coder 7B"
  );
  assert.ok(
    modelIds.includes("deepseek-ai/DeepSeek-V3"),
    "Must include DeepSeek V3"
  );
  assert.ok(
    modelIds.includes("deepseek-ai/DeepSeek-R1"),
    "Must include DeepSeek R1"
  );
});

test("ModelScope Provider - Resolution by ID and Aliases", () => {
  const byId = getRegistryProvider("modelscope");
  assert.ok(byId, "Resolvable by 'modelscope'");
  assert.equal(byId.id, "modelscope");

  const byUpperId = getRegistryProvider("MODELSCOPE");
  assert.ok(byUpperId, "Resolvable case-insensitively");
  assert.equal(byUpperId.id, "modelscope");

  const byAlias = getRegistryProvider("ms");
  assert.ok(byAlias, "Resolvable by alias 'ms'");
  assert.equal(byAlias.id, "modelscope");

  const byUpperAlias = getRegistryProvider("MS");
  assert.ok(byUpperAlias, "Resolvable by uppercase alias 'MS'");
  assert.equal(byUpperAlias.id, "modelscope");

  const all = getAllRegistryProviders();
  assert.ok(all.some((p) => p.id === "modelscope"), "Present in getAllRegistryProviders");

  const runtimeInstance = ProviderRegistry.get("modelscope");
  assert.ok(runtimeInstance, "ProviderRegistry.get('modelscope') returns instance");
  assert.equal(runtimeInstance.id, "modelscope");
});

test("ModelScope Provider - Runtime Execution & Headers", async () => {
  const provider = new ModelscopeProvider();
  const fakeContext: ProviderRequestContext = {
    req: { headers: {} } as any,
    targetModel: "Qwen/Qwen2.5-Coder-32B-Instruct",
    clientFormat: "openai",
    provider: PROVIDER_REGISTRY["modelscope"],
    account: {
      id: "acc_ms_1",
      name: "ModelScope Key",
      provider: "modelscope",
      rawApiKey: "ms-token-12345",
    } as any,
  };

  const headers = await provider.buildHeaders(fakeContext);
  assert.equal(headers["Authorization"], "Bearer ms-token-12345");
  assert.equal(headers["Content-Type"], "application/json");

  const anthropicContext: ProviderRequestContext = {
    ...fakeContext,
    clientFormat: "anthropic",
    body: {
      messages: [{ role: "user", content: "Write a quicksort in TypeScript" }],
      max_tokens: 4096,
    },
  };
  const transformed = provider.transformRequestBody(anthropicContext);
  assert.equal(transformed.model, "Qwen/Qwen2.5-Coder-32B-Instruct");
  assert.ok(Array.isArray(transformed.messages));
});

test("Community Catalog - No Duplicate Stubs for Built-in Providers", () => {
  const hasCursorApi = COMMUNITY_PROVIDERS_CATALOG.some((p) => p.id === "cursor-api");
  const hasModelscope = COMMUNITY_PROVIDERS_CATALOG.some((p) => p.id === "modelscope");
  assert.equal(hasCursorApi, false, "cursor-api must not remain as a communityCatalog stub");
  assert.equal(hasModelscope, false, "modelscope must not remain as a communityCatalog stub");
});

test("ModelScope Provider - Vector Icon Exists on Disk", () => {
  const msIcon = path.resolve(process.cwd(), "src/providers/catalog/modelscope/assets/icon.svg");
  assert.ok(fs.existsSync(msIcon), "modelscope icon.svg must exist");
  const msContent = fs.readFileSync(msIcon, "utf8");
  assert.ok(msContent.includes("<svg"), "modelscope icon.svg must be valid SVG");
});
