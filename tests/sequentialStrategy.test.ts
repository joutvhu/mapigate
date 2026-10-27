process.env.NODE_ENV = "test";

import test from "node:test";
import assert from "node:assert/strict";
import { SequentialSelector } from "../src/core/router/sequentialSelector.js";
import { LoadBalancer } from "../src/core/router/loadBalancer.js";
import { ProviderRepository } from "../src/storage/repositories/providerRepo.js";
import type { ProviderAccount } from "../src/shared/types/index.js";

test("SequentialSelector - stays on current account across repeated calls (Drain)", () => {
  SequentialSelector.clear();

  const providerId = "test_seq_drain";
  const acc1: ProviderAccount & { rawApiKey: string } = {
    id: "acc_1",
    providerId,
    name: "Account 1",
    apiKeyEncrypted: "",
    rawApiKey: "key-1",
    isActive: true,
    rateLimitHits: 0,
    sortOrder: 0,
  };
  const acc2: ProviderAccount & { rawApiKey: string } = {
    id: "acc_2",
    providerId,
    name: "Account 2",
    apiKeyEncrypted: "",
    rawApiKey: "key-2",
    isActive: true,
    rateLimitHits: 0,
    sortOrder: 1,
  };
  const acc3: ProviderAccount & { rawApiKey: string } = {
    id: "acc_3",
    providerId,
    name: "Account 3",
    apiKeyEncrypted: "",
    rawApiKey: "key-3",
    isActive: true,
    rateLimitHits: 0,
    sortOrder: 2,
  };

  const pool = [acc1, acc2, acc3];
  const allOrdered = [acc1, acc2, acc3];

  // Request 1: Picks Account 1
  const pick1 = SequentialSelector.pickSequentialAccount(providerId, pool, allOrdered);
  assert.equal(pick1?.id, "acc_1");

  // Requests 2..10: Must persistently stay on Account 1 (not alternate like round-robin)
  for (let i = 0; i < 10; i++) {
    const pick = SequentialSelector.pickSequentialAccount(providerId, pool, allOrdered);
    assert.equal(pick?.id, "acc_1", `Call ${i} must stay on acc_1`);
  }
});

test("SequentialSelector - advances to next account when current is in cooldown, and stays there (No Ping-Pong)", () => {
  SequentialSelector.clear();

  const providerId = "test_seq_cooldown";
  const acc1: ProviderAccount & { rawApiKey: string } = {
    id: "acc_1",
    providerId,
    name: "Account 1",
    apiKeyEncrypted: "",
    rawApiKey: "key-1",
    isActive: true,
    rateLimitHits: 0,
    sortOrder: 0,
  };
  const acc2: ProviderAccount & { rawApiKey: string } = {
    id: "acc_2",
    providerId,
    name: "Account 2",
    apiKeyEncrypted: "",
    rawApiKey: "key-2",
    isActive: true,
    rateLimitHits: 0,
    sortOrder: 1,
  };
  const acc3: ProviderAccount & { rawApiKey: string } = {
    id: "acc_3",
    providerId,
    name: "Account 3",
    apiKeyEncrypted: "",
    rawApiKey: "key-3",
    isActive: true,
    rateLimitHits: 0,
    sortOrder: 2,
  };

  const allOrdered = [acc1, acc2, acc3];

  // Start with acc1 active
  SequentialSelector.setActiveAccountId(providerId, "acc_1");

  // acc1 enters cooldown -> pool only has [acc2, acc3]
  const poolWithoutAcc1 = [acc2, acc3];
  const pickAfterCooldown = SequentialSelector.pickSequentialAccount(providerId, poolWithoutAcc1, allOrdered);
  assert.equal(pickAfterCooldown?.id, "acc_2", "Must advance to acc_2 when acc_1 is under cooldown");

  // Now acc1 cooldown expires! acc1 is back in pool: [acc1, acc2, acc3]
  // In fill-first, it would ping-pong back to acc_1.
  // In sequential, it MUST STAY ON acc_2 until acc_2 is drained!
  const poolRestored = [acc1, acc2, acc3];
  for (let i = 0; i < 5; i++) {
    const pick = SequentialSelector.pickSequentialAccount(providerId, poolRestored, allOrdered);
    assert.equal(pick?.id, "acc_2", "Must stay on acc_2 and avoid ping-ponging back to acc_1");
  }
});

test("SequentialSelector - advances when quota is exhausted (0%) and wraps around cyclically", () => {
  SequentialSelector.clear();

  const providerId = "antigravity";
  const now = Date.now();

  const acc1: ProviderAccount & { rawApiKey: string } = {
    id: "acc_1",
    providerId,
    name: "Account 1",
    apiKeyEncrypted: "",
    rawApiKey: "key-1",
    isActive: true,
    rateLimitHits: 0,
    sortOrder: 0,
    cachedQuotas: JSON.stringify({
      accountId: "acc_1",
      providerId,
      quotas: [{ label: "Gemini (Weekly)", remainingPercentage: 0, resetAt: now + 86400000 }],
    }),
  };

  const acc2: ProviderAccount & { rawApiKey: string } = {
    id: "acc_2",
    providerId,
    name: "Account 2",
    apiKeyEncrypted: "",
    rawApiKey: "key-2",
    isActive: true,
    rateLimitHits: 0,
    sortOrder: 1,
    cachedQuotas: JSON.stringify({
      accountId: "acc_2",
      providerId,
      quotas: [{ label: "Gemini (Weekly)", remainingPercentage: 70, resetAt: now + 86400000 }],
    }),
  };

  const acc3: ProviderAccount & { rawApiKey: string } = {
    id: "acc_3",
    providerId,
    name: "Account 3",
    apiKeyEncrypted: "",
    rawApiKey: "key-3",
    isActive: true,
    rateLimitHits: 0,
    sortOrder: 2,
    cachedQuotas: JSON.stringify({
      accountId: "acc_3",
      providerId,
      quotas: [{ label: "Gemini (Weekly)", remainingPercentage: 90, resetAt: now + 86400000 }],
    }),
  };

  const allOrdered = [acc1, acc2, acc3];
  const pool = [acc1, acc2, acc3];

  // Acc 1 is exhausted (0%) -> must skip Acc 1 and pick Acc 2
  const pick = SequentialSelector.pickSequentialAccount(providerId, pool, allOrdered, "gemini-2.5-pro");
  assert.equal(pick?.id, "acc_2", "Must advance to acc_2 because acc_1 quota is 0%");

  // Next, if Acc 2 also exhausts its quota (0%):
  acc2.cachedQuotas = JSON.stringify({
    accountId: "acc_2",
    providerId,
    quotas: [{ label: "Gemini (Weekly)", remainingPercentage: 0, resetAt: now + 86400000 }],
  });

  const pickAfter2Exhausted = SequentialSelector.pickSequentialAccount(providerId, pool, allOrdered, "gemini-2.5-pro");
  assert.equal(pickAfter2Exhausted?.id, "acc_3", "Must advance to acc_3 when acc_2 quota is exhausted");

  // Next, if Acc 3 exhausts, and Acc 1 has reset back to 100%:
  acc3.cachedQuotas = JSON.stringify({
    accountId: "acc_3",
    providerId,
    quotas: [{ label: "Gemini (Weekly)", remainingPercentage: 0, resetAt: now + 86400000 }],
  });
  acc1.cachedQuotas = JSON.stringify({
    accountId: "acc_1",
    providerId,
    quotas: [{ label: "Gemini (Weekly)", remainingPercentage: 100, resetAt: now + 7 * 86400000 }],
  });

  const pickWrapped = SequentialSelector.pickSequentialAccount(providerId, pool, allOrdered, "gemini-2.5-pro");
  assert.equal(pickWrapped?.id, "acc_1", "Must wrap cyclically back to acc_1 when it recovers");
});

test("LoadBalancer - End-to-end pickAccount with Sequential strategy", () => {
  LoadBalancer.reset();

  const providerId = `prov_seq_e2e_${Date.now()}`;
  const now = Date.now();

  ProviderRepository.saveProvider({
    id: providerId,
    name: "Sequential Provider",
    baseUrl: "https://api.seq.test",
    format: "openai",
    isActive: true,
    priority: 1,
    models: ["gpt-4o"],
    strategy: "sequential",
    createdAt: now,
    updatedAt: now,
  });

  const accId1 = `acc_e2e_seq_1_${Date.now()}`;
  const accId2 = `acc_e2e_seq_2_${Date.now()}`;

  ProviderRepository.addAccount({
    id: accId1,
    providerId,
    name: "Seq Account 1",
    rawApiKey: "key-seq-1",
  });
  ProviderRepository.addAccount({
    id: accId2,
    providerId,
    name: "Seq Account 2",
    rawApiKey: "key-seq-2",
  });

  // Call 1 -> picks Account 1
  const pick1 = LoadBalancer.pickAccount(providerId);
  assert.equal(pick1?.id, accId1);

  // Call 2 -> stays on Account 1
  const pick2 = LoadBalancer.pickAccount(providerId);
  assert.equal(pick2?.id, accId1);

  // Mark Account 1 rate limited
  LoadBalancer.markRateLimited(accId1, 30_000, providerId);

  // Call 3 -> picks Account 2
  const pick3 = LoadBalancer.pickAccount(providerId);
  assert.equal(pick3?.id, accId2, "Must advance to Account 2 after Account 1 rate limited");

  // Call 4 -> stays on Account 2
  const pick4 = LoadBalancer.pickAccount(providerId);
  assert.equal(pick4?.id, accId2, "Must stay on Account 2");
});
