process.env.NODE_ENV = "test";

import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import app from "../src/server/index.js";
import { ProviderRepository } from "../src/storage/repositories/providerRepo.js";
import { testProviderConnection } from "../src/core/scanner/connectionTester.js";
import { resolveCandidateUrls } from "../src/core/scanner/modelScanner.js";

test("Integration - Real Connection Testing & Endpoint Validation", async () => {
  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", () => resolve()));
  const address = server.address() as { port: number };
  const baseUrl = `http://127.0.0.1:${address.port}`;

  const testProviderId = "test_conn_prov_" + Date.now();
  const testAccountId = "test_conn_acc_" + Date.now();
  const disabledAccountId = "test_disabled_acc_" + Date.now();

  try {
    // 0. Antigravity candidate URLs validation
    const agUrls = resolveCandidateUrls("https://daily-cloudcode-pa.googleapis.com", "antigravity", "antigravity");
    assert.ok(agUrls.some((u) => u.includes("fetchAvailableModels")), "Antigravity candidate URLs must include fetchAvailableModels");
    assert.ok(agUrls.some((u) => u.includes("loadCodeAssist")), "Antigravity candidate URLs must include loadCodeAssist");
    assert.ok(!agUrls.some((u) => u.endsWith("/models")), "Antigravity must not use standard /models endpoint");

    // 1. Non-existent provider test
    const notFoundRes = await testProviderConnection({ providerId: "non_existent_provider_xyz" });
    assert.equal(notFoundRes.success, false);
    assert.match(notFoundRes.message, /not found/i);

    // 2. Setup mock provider pointing to an invalid port (simulating unreachable upstream)
    ProviderRepository.saveProvider({
      id: testProviderId,
      name: "Test Unreachable Provider",
      baseUrl: "http://127.0.0.1:59999/v1",
      format: "openai",
      isActive: true,
    });

    ProviderRepository.addAccount({
      id: testAccountId,
      providerId: testProviderId,
      name: "Invalid Key Account",
      rawApiKey: "sk-invalid-test-key",
      isActive: true,
    });

    ProviderRepository.addAccount({
      id: disabledAccountId,
      providerId: testProviderId,
      name: "Disabled Account",
      rawApiKey: "sk-disabled-test-key",
      isActive: false,
    });

    // 3. Test provider endpoint directly via HTTP POST /api/providers/:id/test
    const testHttpRes = await fetch(`${baseUrl}/api/providers/${testProviderId}/test`, {
      method: "POST",
    });
    assert.equal(testHttpRes.status, 200);
    const testData = (await testHttpRes.json()) as any;
    assert.equal(testData.success, false, "Must not return success when upstream is unreachable");
    assert.ok(testData.message, "Must return descriptive failure message");
    assert.ok(typeof testData.latencyMs === "number", "Must track latency");

    // 4. Test specific active account endpoint POST /api/providers/:id/accounts/:accountId/test
    const testAccRes = await fetch(
      `${baseUrl}/api/providers/${testProviderId}/accounts/${testAccountId}/test`,
      { method: "POST" }
    );
    assert.equal(testAccRes.status, 200);
    const testAccData = (await testAccRes.json()) as any;
    assert.equal(testAccData.success, false, "Account test must fail when upstream is unreachable");
    assert.ok(testAccData.message);

    // 5. Test specific DISABLED account endpoint - must find the account and attempt connection, NOT report "No configured accounts"
    const testDisabledRes = await fetch(
      `${baseUrl}/api/providers/${testProviderId}/accounts/${disabledAccountId}/test`,
      { method: "POST" }
    );
    assert.equal(testDisabledRes.status, 200);
    const testDisabledData = (await testDisabledRes.json()) as any;
    assert.equal(testDisabledData.success, false);
    assert.ok(!testDisabledData.message.includes("No configured accounts"), "Disabled account must be found and tested");

    // 6. Test bulk endpoint POST /api/providers/test-bulk
    const bulkRes = await fetch(`${baseUrl}/api/providers/test-bulk`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ providerIds: [testProviderId, "non_existent_provider_xyz"] }),
    });
    assert.equal(bulkRes.status, 200);
    const bulkData = (await bulkRes.json()) as any;
    assert.equal(bulkData.success, true);
    assert.ok(bulkData.results);
    assert.equal(bulkData.results[testProviderId].success, false);
    assert.equal(bulkData.results["non_existent_provider_xyz"].success, false);
  } finally {
    try {
      ProviderRepository.deleteAccount(testAccountId);
      ProviderRepository.deleteProvider(testProviderId);
    } catch {
      // Ignore cleanup error
    }
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});
