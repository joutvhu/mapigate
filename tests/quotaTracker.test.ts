import test from "node:test";
import assert from "node:assert/strict";
import {
  calculatePercentage,
  formatResetTime,
  parseResetTime,
  getStatusColor,
  formatResetTimeDisplay,
} from "../src/core/usage/utils.js";
import { QuotaService } from "../src/core/usage/quotaService.js";
import { ProviderRepository } from "../src/storage/repositories/providerRepo.js";
import { getClaudeUsage, CLAUDE_REFRESH_INTERVAL_MS } from "../src/core/usage/handlers/claude.js";
import { extractCredentials, isTokenExpired } from "../src/core/usage/tokenHelper.js";

test("utils - parseResetTime correctly handles varied date formats", () => {
  assert.equal(parseResetTime(null), null);
  assert.equal(parseResetTime(undefined), null);
  assert.equal(parseResetTime(""), null);

  // ISO string
  const iso = "2026-03-30T15:00:00.000Z";
  assert.equal(parseResetTime(iso), new Date(iso).getTime());

  // Seconds timestamp (< 1e12)
  const sec = 1774882800;
  assert.equal(parseResetTime(sec), sec * 1000);

  // Milliseconds timestamp
  const ms = 1774882800000;
  assert.equal(parseResetTime(ms), ms);

  // Numeric string
  assert.equal(parseResetTime("1774882800000"), ms);
});

test("utils - calculatePercentage computes remaining percentage correctly", () => {
  assert.equal(calculatePercentage(0, 1000), 100);
  assert.equal(calculatePercentage(500, 1000), 50);
  assert.equal(calculatePercentage(1000, 1000), 0);
  assert.equal(calculatePercentage(1200, 1000), 0); // clamp min
  assert.equal(calculatePercentage(-10, 1000), 100); // clamp max
  assert.equal(calculatePercentage(0, 0), 0); // division by 0 guard
});

test("utils - formatResetTime displays appropriate countdown string", () => {
  assert.equal(formatResetTime(null), "-");

  const now = Date.now();
  // Past date
  assert.equal(formatResetTime(now - 10000), "Expired");

  // In 30 minutes
  const in30m = now + 30 * 60 * 1000;
  assert.match(formatResetTime(in30m), /30m|29m/);

  // In 5 hours 10 minutes
  const in5h = now + (5 * 3600 + 10 * 60) * 1000;
  assert.match(formatResetTime(in5h), /5h 10m|5h 9m/);

  // In 3 days 4 hours
  const in3d = now + (3 * 86400 + 4 * 3600) * 1000;
  assert.match(formatResetTime(in3d), /3d 4h|3d 3h/);
});

test("utils - getStatusColor returns expected semantic styles", () => {
  const green = getStatusColor(75);
  assert.equal(green.emoji, "🟢");
  assert.ok(green.text.includes("emerald"));

  const amber = getStatusColor(25);
  assert.equal(amber.emoji, "🟡");
  assert.ok(amber.text.includes("amber"));

  const red = getStatusColor(0);
  assert.equal(red.emoji, "🔴");
  assert.ok(red.text.includes("red"));
});

test("tokenHelper - extractCredentials and isTokenExpired work as expected", () => {
  const jsonToken = JSON.stringify({
    accessToken: "test-access-token",
    refreshToken: "test-refresh-token",
    expiresAt: Date.now() + 3600000,
    email: "dev@example.com",
  });

  const creds = extractCredentials(jsonToken);
  assert.equal(creds.accessToken, "test-access-token");
  assert.equal(creds.refreshToken, "test-refresh-token");
  assert.equal(creds.email, "dev@example.com");
  assert.equal(isTokenExpired(creds.expiresAt), false);

  // Expired token test
  assert.equal(isTokenExpired(Date.now() - 5000), true);
  assert.equal(isTokenExpired(Date.now() + 30000), true); // Within 60s safety buffer
});

test("quotaService - integrates with ProviderRepository and handles mock accounts", async () => {
  const testProviderId = "test_prov_" + Date.now();
  const testAccountId = "test_acc_" + Date.now();

  // Create test provider and account
  ProviderRepository.saveProvider({
    id: testProviderId,
    name: "Test Provider",
    baseUrl: "https://api.test.com",
    format: "openai",
    isActive: true,
    priority: 1,
    models: ["test-model"],
    createdAt: Date.now(),
    updatedAt: Date.now(),
  });

  ProviderRepository.addAccount({
    id: testAccountId,
    providerId: testProviderId,
    name: "Test Developer",
    rawApiKey: "sk-test-key-12345",
  });

  const quotaService = QuotaService.getInstance();
  const result = await quotaService.fetchQuotaForAccount(testAccountId, true);

  assert.equal(result.accountId, testAccountId);
  assert.equal(result.accountName, "Test Developer");
  assert.equal(result.isActive, true);

  // Test bulk toggle
  quotaService.bulkToggle([testAccountId], false);
  const toggledAccount = ProviderRepository.getAccountById(testAccountId);
  assert.equal(toggledAccount?.isActive, false);

  quotaService.bulkToggle([testAccountId], true);
  const reToggled = ProviderRepository.getAccountById(testAccountId);
  assert.equal(reToggled?.isActive, true);

  // Cleanup
  ProviderRepository.deleteAccount(testAccountId);
  ProviderRepository.deleteProvider(testProviderId);
});

test("claudeHandler - exports correct 10-minute refresh interval and handles empty tokens gracefully", async () => {
  assert.equal(CLAUDE_REFRESH_INTERVAL_MS, 600000);

  const emptyResult = await getClaudeUsage("");
  assert.ok(emptyResult.message?.includes("Claude access token not available"));
});
