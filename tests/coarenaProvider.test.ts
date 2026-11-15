import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import {
  PROVIDER_REGISTRY,
  getRegistryProvider,
} from "../src/shared/constants/providerRegistry.js";
import { CoarenaProvider } from "../src/providers/catalog/coarena/provider.js";
import { getCoarenaUsage } from "../src/providers/catalog/coarena/quota.js";
import type { ProviderUsageContext } from "../src/core/usage/types.js";

test("Coarena Provider - metadata, aliases, and assets", () => {
  const item = PROVIDER_REGISTRY["coarena"];
  assert.ok(item, "coarena must exist in PROVIDER_REGISTRY");
  assert.equal(item.id, "coarena");
  assert.equal(item.name, "Coarena");
  assert.equal(item.baseUrl, "https://coarena.ai/api/v1");
  assert.equal(item.validateUrl, "https://coarena.ai/api/v1/limits");
  assert.equal(item.format, "openai");
  assert.equal(item.category, "freeTier");
  assert.equal(item.iconBg, "#ffffff");
  assert.equal(item.passthroughModels, true);

  const byLookup = getRegistryProvider("coarena");
  assert.ok(byLookup);
  assert.equal(byLookup.id, "coarena");

  const byAlias = getRegistryProvider("coasty");
  assert.ok(byAlias);
  assert.equal(byAlias.id, "coarena");

  const iconSvg = path.resolve(process.cwd(), "src/providers/catalog/coarena/assets/icon.svg");
  const iconPng = path.resolve(process.cwd(), "src/providers/catalog/coarena/assets/icon.png");
  assert.ok(fs.existsSync(iconSvg), "icon.svg must exist");
  assert.ok(fs.existsSync(iconPng), "icon.png must exist");

  const modelIds = item.models.map((m) => m.id);
  assert.ok(modelIds.includes("deepseek-v4-1-flash-1017"));
  assert.ok(modelIds.includes("gpt-6-1-sol"));
  assert.ok(modelIds.includes("gemini-4-argon"));
});

test("Coarena Provider - quota handler validation and calculation", async () => {
  // 1. Missing API key
  const mockContextNoKey: ProviderUsageContext = {
    providerId: "coarena",
    account: {
      id: "acc_test",
      providerId: "coarena",
      name: "Coarena Test",
      rawApiKey: "",
      isActive: true,
      createdAt: Date.now(),
    },
  };
  const noKeyResult = await getCoarenaUsage(mockContextNoKey);
  assert.ok(noKeyResult.message?.includes("API key is required"));

  // 2. Auth error (401)
  const mockContextWithKey: ProviderUsageContext = {
    providerId: "coarena",
    account: {
      id: "acc_test",
      providerId: "coarena",
      name: "Coarena Test",
      rawApiKey: "coa_invalid",
      isActive: true,
      createdAt: Date.now(),
    },
  };
  const mockFetch401 = async () =>
    new Response(JSON.stringify({ error: { message: "Invalid key" } }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  const authErrResult = await getCoarenaUsage(mockContextWithKey, { fetchFn: mockFetch401 as any });
  assert.ok(authErrResult.error?.includes("Authentication failed (HTTP 401)"));

  // 3. Successful limits response
  const mockPayload = {
    data: {
      free: true,
      usd_per_day: 5.0,
      default_usd_per_day: 5.0,
      source: "default",
      requests_per_minute_key: 60,
      requests_per_day: null,
      concurrency: 2,
      today: {
        used_usd: 1.25,
        held_usd: 0,
        left_usd: 3.75,
        requests: 15,
        requests_left: null,
        resets_at: "2026-11-16T00:00:00Z",
      },
    },
  };
  const mockFetch200 = async () =>
    new Response(JSON.stringify(mockPayload), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  const quotaResult = await getCoarenaUsage(mockContextWithKey, { fetchFn: mockFetch200 as any });

  assert.equal(quotaResult.plan, "Free Tier ($5/day)");
  assert.ok(quotaResult.quotas);

  const dailyBucket = quotaResult.quotas.daily_usd;
  assert.ok(dailyBucket);
  assert.equal(dailyBucket.displayName, "Daily Allowance ($ USD)");
  assert.equal(dailyBucket.total, 5.0);
  assert.equal(dailyBucket.used, 1.25);
  assert.equal(dailyBucket.remaining, 3.75);
  assert.equal(dailyBucket.remainingPercentage, 75);
  assert.equal(dailyBucket.resetAt, "2026-11-16T00:00:00Z");

  const rpmBucket = quotaResult.quotas.rpm;
  assert.ok(rpmBucket);
  assert.equal(rpmBucket.total, 60);

  const requestsBucket = quotaResult.quotas.requests_today;
  assert.ok(requestsBucket);
  assert.equal(requestsBucket.used, 15);
  assert.equal(requestsBucket.unlimited, true);

  const concurrencyBucket = quotaResult.quotas.concurrency;
  assert.ok(concurrencyBucket);
  assert.equal(concurrencyBucket.total, 2);
});

test("Coarena Provider - class instance and probeModels", async () => {
  const provider = new CoarenaProvider();
  assert.equal(provider.id, "coarena");
  assert.equal(provider.supportsQuota(), true);

  // Probe without key
  const probeNoKey = await provider.probeModels({ providerId: "coarena", apiKey: "" });
  assert.ok(probeNoKey);
  assert.equal(probeNoKey.success, false);

  // Probe with valid mock fetch
  const originalFetch = globalThis.fetch;
  try {
    globalThis.fetch = (async (url: any) => {
      const urlStr = String(url);
      if (urlStr.includes("/api/v1/limits")) {
        return new Response(JSON.stringify({ data: { free: true } }), { status: 200 });
      }
      if (urlStr.includes("/api/v1/models")) {
        return new Response(
          JSON.stringify({
            data: [
              {
                id: "gpt-6-1-sol",
                display_name: "GPT-6.1 Sol",
                context_length: 128000,
                capabilities: { reasoning_text: true, vision: true },
              },
            ],
          }),
          { status: 200 }
        );
      }
      return new Response("Not found", { status: 404 });
    }) as any;

    const probeResult = await provider.probeModels({
      providerId: "coarena",
      apiKey: "coa_test123",
    });

    assert.ok(probeResult);
    assert.equal(probeResult.success, true);
    assert.equal(probeResult.count, 1);
    assert.equal(probeResult.models?.[0].id, "gpt-6-1-sol");
  } finally {
    globalThis.fetch = originalFetch;
  }
});
