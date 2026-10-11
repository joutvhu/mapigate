import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import http from "node:http";

import app from "../src/server/index.js";
import { ProviderRepository } from "../src/storage/repositories/providerRepo.js";
import {
  PROVIDER_REGISTRY,
  getRegistryProvider,
} from "../src/shared/constants/providerRegistry.js";
import {
  COMMUNITY_PROVIDERS_CATALOG,
  getCommunityCatalogProvider,
} from "../src/shared/constants/communityProvidersCatalog.js";

const P1_PROVIDERS = [
  "deepinfra",
  "novita",
  "nanogpt",
  "bailian-coding-plan",
  "codestral",
  "volcengine-coding-plan",
  "volcengine-agent-plan",
  "v0-vercel",
  "auggie",
  "zcode",
  "amazon-q",
  "codex-app-server",
  "devin-desktop",
  "devin-cli-agentic",
  "watsonx",
  "databricks",
];

const P2_PROVIDERS = [
  "yi",
  "baichuan",
  "stepfun",
  "internlm",
  "sensenova",
  "sparkdesk",
  "moonshot",
  "zai",
  "ant-ling",
  "360ai",
  "doubao",
  "scaleway",
  "ovhcloud",
  "lambda-ai",
  "nscale",
  "nube",
  "baseten",
  "modal",
  "synthetic",
  "predibase",
  "friendliai",
  "openference-api",
  "clova-studio",
  "typhoon",
  "sealion",
  "sarvam",
  "plamo",
  "maritalk",
  "gigachat",
  "snowflake",
  "aimlapi",
  "ai21",
  "upstage",
  "meta-llama",
  "nous-research",
  "reka",
  "coze",
  "writer",
  "arcee-ai",
  "liquid",
  "pioneer",
  "longcat",
  "ollama-cloud",
];

test("Providers Expansion - P1 Providers Registered and Configured", () => {
  for (const id of P1_PROVIDERS) {
    const p = PROVIDER_REGISTRY[id];
    assert.ok(p, `P1 Provider '${id}' must be present in PROVIDER_REGISTRY`);
    assert.equal(p.id, id);
    assert.ok(p.name, `Provider '${id}' must have a name`);
    assert.ok(p.models.length > 0, `Provider '${id}' must define at least one model`);
  }

  // Check bailian-coding-plan format
  const bailian = PROVIDER_REGISTRY["bailian-coding-plan"];
  assert.equal(bailian.format, "claude", "bailian-coding-plan must use format 'claude' (Anthropic Messages API)");

  // Check codestral
  const codestral = PROVIDER_REGISTRY["codestral"];
  assert.ok(codestral.baseUrl.includes("codestral.mistral.ai"), "codestral must use codestral endpoint");
});

test("Providers Expansion - P2 Providers Registered", () => {
  for (const id of P2_PROVIDERS) {
    const p = PROVIDER_REGISTRY[id];
    assert.ok(p, `P2 Provider '${id}' must be present in PROVIDER_REGISTRY`);
    assert.equal(p.id, id);
    assert.ok(p.name, `Provider '${id}' must have a name`);
    assert.ok(p.models.length > 0, `Provider '${id}' must have models`);
  }
});

test("Providers Expansion - Deduplication Invariant", () => {
  // Existing providers must not be duplicated
  assert.ok(PROVIDER_REGISTRY["chutes"], "chutes must exist");
  assert.ok(PROVIDER_REGISTRY["github"], "github (Copilot) must exist");
  assert.ok(PROVIDER_REGISTRY["gitlab"], "gitlab (GitLab Duo) must exist");
  assert.ok(PROVIDER_REGISTRY["baidu"], "baidu must exist");

  // Verify no duplicate keys with different case or aliases as separate duplicate entries
  assert.equal(PROVIDER_REGISTRY["ghe-copilot"], undefined, "ghe-copilot should not exist as a duplicate");
  assert.equal(PROVIDER_REGISTRY["gitlab-duo"], undefined, "gitlab-duo should not exist as a duplicate");
  assert.equal(PROVIDER_REGISTRY["qianfan"], undefined, "qianfan should be resolved via baidu alias, not duplicate root entry");

  // Verify baidu alias resolves qianfan
  const resolvedQianfan = getRegistryProvider("qianfan");
  assert.ok(resolvedQianfan, "getRegistryProvider('qianfan') must resolve to baidu");
  assert.equal(resolvedQianfan.id, "baidu");
});

test("Providers Expansion - Community Providers Catalog (P3)", () => {
  const catalogPath = path.resolve("src/shared/constants/communityProvidersCatalog.json");
  assert.ok(fs.existsSync(catalogPath), "communityProvidersCatalog.json must exist");

  const raw = fs.readFileSync(catalogPath, "utf8");
  const catalog = JSON.parse(raw);
  assert.ok(Array.isArray(catalog), "Catalog must be a JSON array");
  assert.ok(catalog.length >= 100, `Catalog must contain at least 100 P3 items, found: ${catalog.length}`);

  for (const item of catalog) {
    assert.ok(item.id, "Catalog item must have id");
    assert.ok(item.name, "Catalog item must have name");
    assert.ok(!item.id.endsWith("-web"), `Catalog item ${item.id} must not be a web cookie scraper`);
  }
});

test("Providers Expansion - Anti-Bloat Guard", () => {
  const BANNED_PROVIDERS = [
    "ideogram", "leonardo", "udio", "haiper", "magnific", "segmind", "deepai",
    "adobe-firefly", "soniox", "gladia", "rev-ai", "speechmatics",
    "chatgpt-web", "claude-web", "deepseek-web", "copilot-web", "gemini-web",
    "vllm", "lm-studio", "llama-cpp", "llamafile", "lemonade", "triton"
  ];

  for (const id of BANNED_PROVIDERS) {
    assert.equal(PROVIDER_REGISTRY[id], undefined, `Banned provider '${id}' must NOT be in PROVIDER_REGISTRY`);
  }
});

test("Providers Expansion - Community Catalog API & On-Demand Import", async () => {
  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", () => resolve()));
  const address = server.address() as { port: number };
  const baseUrl = `http://127.0.0.1:${address.port}`;

  const testProviderId = "openvecta";

  try {
    // 1. GET /api/providers/community-catalog
    const res1 = await fetch(`${baseUrl}/api/providers/community-catalog`);
    assert.equal(res1.status, 200);
    const data1 = (await res1.json()) as any;
    assert.ok(data1.total >= 100);
    assert.ok(Array.isArray(data1.catalog));

    // 2. Query filter
    const res2 = await fetch(`${baseUrl}/api/providers/community-catalog?q=openvecta`);
    assert.equal(res2.status, 200);
    const data2 = (await res2.json()) as any;
    assert.ok(data2.catalog.some((p: any) => p.id === "openvecta"));

    // 3. POST /api/providers/community-catalog/import
    const importRes = await fetch(`${baseUrl}/api/providers/community-catalog/import`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: testProviderId,
        customBaseUrl: "https://api.openvecta.ai/v1",
        apiKey: "sk-test-community-key",
        accountName: "Community Test Key",
      }),
    });
    assert.equal(importRes.status, 200);
    const importData = (await importRes.json()) as any;
    assert.equal(importData.success, true);
    assert.equal(importData.provider.id, testProviderId);

    // 4. Verify in DB
    const saved = ProviderRepository.getProviderById(testProviderId);
    assert.ok(saved, "Provider must be saved in SQLite DB");
    assert.equal(saved.id, testProviderId);

    const accounts = ProviderRepository.getAllAccountsByProvider(testProviderId);
    assert.ok(accounts.length > 0, "Account must be created in SQLite DB");
  } finally {
    // Cleanup
    ProviderRepository.deleteProvider(testProviderId);
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

