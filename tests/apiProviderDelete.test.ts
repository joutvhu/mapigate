process.env.NODE_ENV = "test";

import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import app from "../src/server/index.js";
import { ProviderRepository } from "../src/storage/repositories/providerRepo.js";
import { ModelRepository } from "../src/storage/repositories/modelRepo.js";

test("Integration - DELETE /api/providers/:id deletes provider and cascades accounts and model routes", async () => {
  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", () => resolve()));
  const address = server.address() as { port: number };
  const baseUrl = `http://127.0.0.1:${address.port}`;

  const providerId = `test_delete_prov_${Date.now()}`;
  const accountId1 = `acc_${Date.now()}_1`;
  const accountId2 = `acc_${Date.now()}_2`;
  const ruleId = `rule_${Date.now()}`;
  const ruleAlias = `delete-alias-${Date.now()}`;

  try {
    // 1. Setup provider
    ProviderRepository.saveProvider({
      id: providerId,
      name: "Custom Delete Test Provider",
      baseUrl: "https://api.test-custom.com",
      format: "openai",
      isActive: true,
      priority: 1,
      models: ["custom-model-1", "custom-model-2"],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    // 2. Add accounts
    ProviderRepository.addAccount({
      id: accountId1,
      providerId,
      name: "Account 1",
      rawApiKey: "sk-test-key-1",
    });
    ProviderRepository.addAccount({
      id: accountId2,
      providerId,
      name: "Account 2",
      rawApiKey: "sk-test-key-2",
    });

    // 3. Add model rule targeting this provider
    ModelRepository.saveRule({
      id: ruleId,
      alias: ruleAlias,
      targetModel: "custom-model-1",
      targetProviderId: providerId,
      fallbackRules: [],
      isDefault: false,
    });

    // Verify entities exist prior to deletion
    assert.ok(ProviderRepository.getProviderById(providerId));
    assert.equal(ProviderRepository.getAccountsByProvider(providerId).length, 2);
    assert.ok(ModelRepository.getRuleByAlias(ruleAlias));

    // 4. Issue DELETE /api/providers/:id
    const res = await fetch(`${baseUrl}/api/providers/${providerId}`, {
      method: "DELETE",
    });

    assert.equal(res.status, 200);
    const body = (await res.json()) as any;
    assert.deepEqual(body, { success: true });

    // 5. Verify provider is deleted and cascade removed accounts and model routes
    assert.equal(ProviderRepository.getProviderById(providerId), undefined);
    assert.equal(ProviderRepository.getAccountsByProvider(providerId).length, 0);
    assert.equal(ModelRepository.getRuleByAlias(ruleAlias), undefined);
  } finally {
    // Cleanup in case of failures
    try {
      ProviderRepository.deleteAccount(accountId1);
      ProviderRepository.deleteAccount(accountId2);
      ModelRepository.deleteRule(ruleId);
      ProviderRepository.deleteProvider(providerId);
    } catch {
      // Ignore cleanup error
    }
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});
