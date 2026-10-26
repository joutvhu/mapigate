process.env.NODE_ENV = "test";

import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import app from "../src/server/index.js";
import { ProviderRepository } from "../src/storage/repositories/providerRepo.js";
import { LoadBalancer } from "../src/core/router/loadBalancer.js";

test("Integration - Account Reorder & Fill-First Strategy Selection", async () => {
  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", () => resolve()));
  const address = server.address() as { port: number };
  const baseUrl = `http://127.0.0.1:${address.port}`;

  const providerId = `test_reorder_prov_${Date.now()}`;
  const accountId1 = `acc_reorder_${Date.now()}_1`;
  const accountId2 = `acc_reorder_${Date.now()}_2`;
  const accountId3 = `acc_reorder_${Date.now()}_3`;

  try {
    // 1. Setup provider with strategy: "fill-first"
    ProviderRepository.saveProvider({
      id: providerId,
      name: "Reorder Test Provider",
      baseUrl: "https://api.test-reorder.com",
      format: "openai",
      isActive: true,
      priority: 1,
      models: ["test-model-1"],
      strategy: "fill-first",
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    // 2. Add 3 accounts sequentially
    ProviderRepository.addAccount({
      id: accountId1,
      providerId,
      name: "Account Alpha",
      rawApiKey: "sk-key-1",
    });
    ProviderRepository.addAccount({
      id: accountId2,
      providerId,
      name: "Account Beta",
      rawApiKey: "sk-key-2",
    });
    ProviderRepository.addAccount({
      id: accountId3,
      providerId,
      name: "Account Gamma",
      rawApiKey: "sk-key-3",
    });

    // 3. Initial check: fill-first picks Account Alpha (sort_order = 0)
    const initialPick = LoadBalancer.pickAccount(providerId);
    assert.ok(initialPick, "Should pick an account");
    assert.equal(initialPick.id, accountId1, "Initial fill-first should pick Account Alpha (sort_order 0)");

    // 4. Send PUT /api/providers/:id/accounts/reorder to promote Gamma to 1st, Alpha to 2nd, Beta to 3rd
    const reorderPayload = [accountId3, accountId1, accountId2];
    const reorderRes = await fetch(`${baseUrl}/api/providers/${providerId}/accounts/reorder`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ accountIds: reorderPayload }),
    });

    assert.equal(reorderRes.status, 200, "Reorder endpoint must return 200 OK (not 404 from shadowing)");
    const reorderData = (await reorderRes.json()) as any;
    assert.equal(reorderData.success, true);

    // 5. Test GET /api/providers/:id to ensure persistence on re-fetching provider details (exit & re-enter)
    const getRes = await fetch(`${baseUrl}/api/providers/${providerId}`);
    assert.equal(getRes.status, 200);
    const getData = (await getRes.json()) as any;
    assert.ok(Array.isArray(getData.accounts));
    assert.equal(getData.accounts.length, 3);
    assert.equal(getData.accounts[0].id, accountId3, "1st account must be Gamma");
    assert.equal(getData.accounts[0].sortOrder, 0);
    assert.equal(getData.accounts[1].id, accountId1, "2nd account must be Alpha");
    assert.equal(getData.accounts[1].sortOrder, 1);
    assert.equal(getData.accounts[2].id, accountId2, "3rd account must be Beta");
    assert.equal(getData.accounts[2].sortOrder, 2);

    // 6. Test fill-first after reordering: must pick Gamma (accountId3)
    const afterReorderPick = LoadBalancer.pickAccount(providerId);
    assert.ok(afterReorderPick);
    assert.equal(afterReorderPick.id, accountId3, "Fill-first must pick newly promoted Gamma (sort_order 0)");

    // 7. Verify priority even if Gamma has rate limit hits in history
    ProviderRepository.recordRateLimitHit(accountId3);
    ProviderRepository.recordRateLimitHit(accountId3);
    const historicalHitPick = LoadBalancer.pickAccount(providerId);
    assert.ok(historicalHitPick);
    assert.equal(
      historicalHitPick.id,
      accountId3,
      "Fill-first must still respect manual sort_order priority ahead of historical rate_limit_hits"
    );
  } finally {
    ProviderRepository.deleteProvider(providerId);
    server.close();
  }
});
