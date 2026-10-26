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

