import test from "node:test";
import assert from "node:assert/strict";
import {
  calculateCostFromTokens,
  getPricingForModel,
  isFreeModel,
  formatCost,
} from "../src/core/usage/pricing.js";
import { UsageRepository, PENDING_TIMEOUT_MS } from "../src/storage/repositories/usageRepo.js";
import { RequestDetailsRepository, flushRequestDetailsBuffer, getMaxRecords } from "../src/storage/repositories/requestDetailsRepo.js";
import { SettingsRepository } from "../src/storage/repositories/settingsRepo.js";
import { LogRepository } from "../src/storage/repositories/logRepo.js";

test("pricing - detects free model namespaces correctly", () => {
  assert.equal(isFreeModel("cline-free/deepseek-chat"), true);
  assert.equal(isFreeModel("free/gpt-4o"), true);
  assert.equal(isFreeModel("local/llama3"), true);
  assert.equal(isFreeModel("claude-3-7-sonnet-20250219"), false);
  assert.equal(isFreeModel("gpt-4o"), false);
});

test("pricing - resolves known and pattern-matched model pricing", () => {
  const claudePricing = getPricingForModel("anthropic", "claude-3-7-sonnet-20250219");
  assert.ok(claudePricing);
  assert.equal(claudePricing.input, 3.0);
  assert.equal(claudePricing.output, 15.0);
  assert.equal(claudePricing.cached, 0.3);

  const codexPricing = getPricingForModel("openai", "gpt-5.3-codex");
  assert.ok(codexPricing);
  assert.equal(codexPricing.input, 1.75);
  assert.equal(codexPricing.output, 14.0);

  const deepseekPricing = getPricingForModel("deepseek", "deepseek-chat");
  assert.ok(deepseekPricing);
  assert.equal(deepseekPricing.input, 0.14);
  assert.equal(deepseekPricing.output, 0.28);

  const dsV4Pro = getPricingForModel("deepseek", "deepseek-v4-pro");
  assert.ok(dsV4Pro);
  assert.equal(dsV4Pro.input, 0.66);
  assert.equal(dsV4Pro.output, 1.98);
  assert.equal(dsV4Pro.cached, 0.066);

  const qwen38 = getPricingForModel("qwen", "qwen3.8-max");
  assert.ok(qwen38);
  assert.equal(qwen38.input, 2.00);
  assert.equal(qwen38.output, 6.00);

  const qwenTurbo = getPricingForModel("qwen", "qwen-turbo");
  assert.ok(qwenTurbo);
  assert.equal(qwenTurbo.input, 0.05);
  assert.equal(qwenTurbo.output, 0.20);

  const mimoPro = getPricingForModel("mimo", "mimo-v2.6-pro");
  assert.ok(mimoPro);
  assert.equal(mimoPro.input, 0.435);
  assert.equal(mimoPro.output, 0.87);
  assert.equal(mimoPro.cached, 0.0036);

  const mimoFlash = getPricingForModel("mimo", "mimo-v2.6-flash");
  assert.ok(mimoFlash);
  assert.equal(mimoFlash.input, 0.14);
  assert.equal(mimoFlash.output, 0.28);

  const kimiK31Pro = getPricingForModel("kimi", "k3.1-pro");
  assert.ok(kimiK31Pro);
  assert.equal(kimiK31Pro.input, 2.0);
  assert.equal(kimiK31Pro.output, 10.0);
  assert.equal(kimiK31Pro.cached, 0.2);
  assert.equal(kimiK31Pro.cache_creation, 2.0);

  const kimiK31Highspeed = getPricingForModel("kimi", "k3.1-pro-highspeed");
  assert.ok(kimiK31Highspeed);
  assert.equal(kimiK31Highspeed.input, 4.0);
  assert.equal(kimiK31Highspeed.output, 20.0);
  assert.equal(kimiK31Highspeed.cached, 0.2);
  assert.equal(kimiK31Highspeed.cache_creation, 4.0);

  const kimiK3 = getPricingForModel("kimi", "k3");
  assert.ok(kimiK3);
  assert.equal(kimiK3.input, 3.0);
  assert.equal(kimiK3.output, 15.0);
  assert.equal(kimiK3.cached, 0.3);
  assert.equal(kimiK3.cache_creation, 3.0);

  const gemini4Argon = getPricingForModel("google", "gemini-4-argon");
  assert.ok(gemini4Argon);
  assert.equal(gemini4Argon.input, 2.0);
  assert.equal(gemini4Argon.output, 10.0);
  assert.equal(gemini4Argon.cached, 0.1);

  const sonnet55 = getPricingForModel("anthropic", "claude-sonnet-5.5");
  assert.ok(sonnet55);
  assert.equal(sonnet55.input, 2.0);
  assert.equal(sonnet55.output, 10.0);
  assert.equal(sonnet55.cached, 0.2);

  const opus55 = getPricingForModel("anthropic", "claude-opus-5.5");
  assert.ok(opus55);
  assert.equal(opus55.input, 4.0);
  assert.equal(opus55.output, 20.0);
  assert.equal(opus55.cached, 0.4);

  const fable51 = getPricingForModel("anthropic", "claude-fable-5.1");
  assert.ok(fable51);
  assert.equal(fable51.input, 10.0);
  assert.equal(fable51.output, 50.0);
  assert.equal(fable51.cached, 1.0);

  const gpt6Sol = getPricingForModel("openai", "gpt-6.1-sol");
  assert.ok(gpt6Sol);
  assert.equal(gpt6Sol.input, 2.0);
  assert.equal(gpt6Sol.output, 10.0);
  assert.equal(gpt6Sol.cached, 0.1);

  const gpt6Terra = getPricingForModel("openai", "gpt-6.1-terra");
  assert.ok(gpt6Terra);
  assert.equal(gpt6Terra.input, 1.0);
  assert.equal(gpt6Terra.output, 5.0);
  assert.equal(gpt6Terra.cached, 0.05);

  const mmM3 = getPricingForModel("minimax", "MiniMax-M3");
  assert.ok(mmM3);
  assert.equal(mmM3.input, 0.30);
  assert.equal(mmM3.output, 1.20);
  assert.equal(mmM3.cached, 0.06);

  const mmFlash = getPricingForModel("minimax", "minimax-m3.1-flash");
  assert.ok(mmFlash);
  assert.equal(mmFlash.input, 0.15);
  assert.equal(mmFlash.output, 0.60);
  assert.equal(mmFlash.cached, 0.03);
});

test("pricing - calculates token cost accurately with caching and reasoning tiers", () => {
  // 1,000,000 prompt tokens (with 200,000 cached) and 500,000 completion tokens
  // For claude-3-7:
  // non-cached input = 800,000 * 3.0 / 1M = 2.40
  // cached = 200,000 * 0.3 / 1M = 0.06
  // completion = 500,000 * 15.0 / 1M = 7.50
  // total = 2.40 + 0.06 + 7.50 = 9.96
  const cost = calculateCostFromTokens(
    {
      promptTokens: 1_000_000,
      cachedTokens: 200_000,
      completionTokens: 500_000,
    },
    "claude-3-7-sonnet-20250219",
    "anthropic"
  );
  assert.equal(cost, 9.96);

  assert.equal(formatCost(cost), "$9.96");
  assert.equal(formatCost(0), "$0.00");
  assert.equal(formatCost(0.005), "<$0.01");
  assert.equal(formatCost(3013.5), "$3,013.50");
  assert.equal(formatCost(1234567.89), "$1,234,567.89");
  assert.equal(formatCost(1000000000.5), "$1,000,000,000.50");
});

test("usageRepo - tracks and clears active pending requests", () => {
  const reqId = "test-pending-" + Date.now();
  UsageRepository.startPendingRequest({
    id: reqId,
    model: "claude-3-7-sonnet",
    provider: "antigravity",
    account: "Test Account",
  });

  const activeBefore = UsageRepository.getActiveRequests();
  const found = activeBefore.find((r) => r.provider === "antigravity" && r.model === "claude-3-7-sonnet");
  assert.ok(found);
  assert.ok(found.count >= 1);

  UsageRepository.endPendingRequest(reqId, false);
  const activeAfter = UsageRepository.getActiveRequests();
  const foundAfter = activeAfter.find((r) => r.provider === "antigravity" && r.model === "claude-3-7-sonnet");
  assert.equal(foundAfter, undefined);
});

test("requestDetailsRepo - writes, sanitizes headers, and queries request details", () => {
  const detailId = "test-detail-" + Date.now();
  RequestDetailsRepository.saveRequestDetail({
    id: detailId,
    timestamp: new Date().toISOString(),
    provider: "test-provider",
    model: "test-model-v1",
    connectionId: "conn-123",
    accountName: "Primary Account",
    clientTool: "claude-code",
    status: 200,
    latency: { totalMs: 145, ttftMs: 35 },
    tokens: {
      promptTokens: 1500,
      cachedTokens: 500,
      completionTokens: 300,
      tokensSavedByRtk: 250,
    },
    cost: 0.0045,
    request: {
      headers: {
        authorization: "Bearer secret-token-xyz",
        "content-type": "application/json",
      },
      body: { prompt: "Hello test" },
    },
  });

  // Force buffer flush
  flushRequestDetailsBuffer();

  const fetched = RequestDetailsRepository.getRequestDetailById(detailId);
  assert.ok(fetched);
  assert.equal(fetched.id, detailId);
  assert.equal(fetched.provider, "test-provider");
  assert.equal(fetched.model, "test-model-v1");
  // Header should be redacted
  assert.equal(fetched.request?.headers?.authorization, "[REDACTED]");
  assert.equal(fetched.request?.headers?.["content-type"], "application/json");

  // Query list with filter
  const list = RequestDetailsRepository.getRequestDetails({
    provider: "test-provider",
    pageSize: 10,
  });
  assert.ok(list.details.some((d) => d.id === detailId));
});

test("usageRepo - computes usage stats and chart buckets from saved logs", () => {
  const logId = "test-log-" + Date.now();
  LogRepository.saveLog({
    id: logId,
    timestamp: Date.now(),
    clientTool: "cursor",
    requestedModel: "gpt-4o",
    actualModel: "gpt-4o",
    providerId: "openai",
    promptTokens: 1000,
    completionTokens: 200,
    tokensSavedByRtk: 300,
    cachedTokens: 150,
    cost: 0.0035,
    apiKeyId: "key_cursor_team",
    apiKeyName: "Cursor Team Key",
    durationMs: 250,
    status: "success",
  });

  const stats = UsageRepository.getUsageStats("24h");
  assert.ok(stats.totalRequests >= 1);
  assert.ok(stats.totalPromptTokens >= 1000);
  assert.ok(stats.byProvider["openai"]);
  assert.ok(stats.byProvider["openai"].requests >= 1);
  assert.ok(stats.byApiKey?.["key_cursor_team"]);
  assert.equal(stats.byApiKey["key_cursor_team"].apiKeyName, "Cursor Team Key");
  assert.ok(stats.byApiKey["key_cursor_team"].requests >= 1);
  assert.ok(stats.byApiKey["key_cursor_team"].promptTokens >= 1000);

  const chart = UsageRepository.getChartData("24h");
  assert.equal(chart.length, 24);
  const totalChartTokens = chart.reduce((acc, c) => acc + c.tokens, 0);
  assert.ok(totalChartTokens >= 1200);
});

test("usageRepo - pending timeout threshold supports long-running reasoning models", () => {
  assert.ok(PENDING_TIMEOUT_MS >= 600_000, "Pending timeout should be at least 10 minutes (600,000ms)");
});

test("requestDetailsRepo - supports configurable retention ceiling via settings and env", () => {
  assert.ok(getMaxRecords() >= 1000, "Default max records should be at least 1000");

  SettingsRepository.setSetting("maxRequestDetails", 2500);
  assert.equal(getMaxRecords(), 2500, "Should read max records from SettingsRepository");

  // Reset to default
  SettingsRepository.setSetting("maxRequestDetails", null);
});

test("usageRepo - daily_usage_stats rollup and 90d period support", () => {
  assert.equal(SettingsRepository.getLogRetentionDays(), 10, "Default log retention should be 10 days");
  SettingsRepository.setLogRetentionDays(30);
  assert.equal(SettingsRepository.getLogRetentionDays(), 30);
  SettingsRepository.setLogRetentionDays(10);

  // Trigger backfillDailyStats
  UsageRepository.backfillDailyStats();

  const stats90d = UsageRepository.getUsageStats("90d");
  assert.ok(stats90d);
  assert.ok(typeof stats90d.totalRequests === "number");

  const chart90d = UsageRepository.getChartData("90d");
  assert.equal(chart90d.length, 90, "Chart data for 90d should have 90 buckets");
});

