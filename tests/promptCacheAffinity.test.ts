import test from "node:test";
import assert from "node:assert/strict";
import {
  extractConversationPrefixHash,
  pickAffinityAccount,
} from "../src/core/caching/promptCacheAffinity.js";
import {
  applyCacheControlPolicy,
  shouldPreserveCacheControl,
  stripCacheControl,
} from "../src/core/caching/cacheControlPolicy.js";
import { LoadBalancer } from "../src/core/router/loadBalancer.js";
import { ProviderRepository } from "../src/storage/repositories/providerRepo.js";
import { cooldownManager } from "../src/core/resilience/index.js";

test("PromptCacheAffinity - Invariant root hash stability across multi-turn messages", () => {
  const systemPrompt = "You are an expert TypeScript coding assistant.";
  const firstUserMessage = "How do I implement Rendezvous Hashing in Node.js?";

  // Turn 1: System prompt + 1 user message
  const turn1Body = {
    system: systemPrompt,
    messages: [{ role: "user", content: firstUserMessage }],
  };

  // Turn 2: System prompt + 3 messages (user, assistant, follow-up user)
  const turn2Body = {
    system: systemPrompt,
    messages: [
      { role: "user", content: firstUserMessage },
      { role: "assistant", content: "Here is an explanation of Rendezvous Hashing..." },
      { role: "user", content: "Can you provide a code sample?" },
    ],
  };

  // Turn 3: System prompt + 5 messages
  const turn3Body = {
    system: systemPrompt,
    messages: [
      { role: "user", content: firstUserMessage },
      { role: "assistant", content: "Here is an explanation of Rendezvous Hashing..." },
      { role: "user", content: "Can you provide a code sample?" },
      { role: "assistant", content: "```ts\nexport function pickAccount() {}\n```" },
      { role: "user", content: "Thanks! Can you add tests?" },
    ],
  };

  const hashTurn1 = extractConversationPrefixHash(turn1Body);
  const hashTurn2 = extractConversationPrefixHash(turn2Body);
  const hashTurn3 = extractConversationPrefixHash(turn3Body);

  assert.ok(hashTurn1, "Turn 1 hash should not be null");
  assert.equal(hashTurn1.length, 64, "Hash should be a 64-char sha256 hex string");
  assert.equal(hashTurn1, hashTurn2, "Turn 1 and Turn 2 hashes must be identical");
  assert.equal(hashTurn2, hashTurn3, "Turn 2 and Turn 3 hashes must be identical");
});

test("PromptCacheAffinity - String vs array system prompt handling (Anthropic & OpenAI parity)", () => {
  const promptText = "You are an expert AI architect.";
  const userText = "Analyze this codebase architecture.";

  // Format 1: Anthropic string system prompt
  const anthropicString = {
    system: promptText,
    messages: [{ role: "user", content: userText }],
  };

  // Format 2: Anthropic array system prompt with cache_control
  const anthropicArray = {
    system: [
      { type: "text", text: promptText, cache_control: { type: "ephemeral" } },
    ],
    messages: [{ role: "user", content: userText }],
  };

  // Format 3: OpenAI messages format with system role
  const openAiFormat = {
    messages: [
      { role: "system", content: promptText },
      { role: "user", content: userText },
    ],
  };

  // Format 4: OpenAI messages format with developer role
  const openAiDeveloper = {
    messages: [
      { role: "developer", content: promptText },
      { role: "user", content: userText },
    ],
  };

  const hash1 = extractConversationPrefixHash(anthropicString);
  const hash2 = extractConversationPrefixHash(anthropicArray);
  const hash3 = extractConversationPrefixHash(openAiFormat);
  const hash4 = extractConversationPrefixHash(openAiDeveloper);

  assert.ok(hash1, "Hash 1 should exist");
  assert.equal(hash1, hash2, "Anthropic string and array system prompt hashes must be identical");
  assert.equal(hash1, hash3, "Anthropic and OpenAI system prompt hashes must be identical");
  assert.equal(hash1, hash4, "System and developer role hashes must be identical");
});

test("PromptCacheAffinity - Edge cases and fail-open behavior", () => {
  assert.equal(extractConversationPrefixHash(null), null);
  assert.equal(extractConversationPrefixHash(undefined), null);
  assert.equal(extractConversationPrefixHash({}), null);
  assert.equal(extractConversationPrefixHash({ messages: [] }), null);

  // User only, no system prompt
  const userOnly = {
    messages: [{ role: "user", content: "Hello world" }],
  };
  const userOnlyHash = extractConversationPrefixHash(userOnly);
  assert.ok(userOnlyHash, "User-only prompt should still produce a prefix hash");

  // Multi-turn user-only
  const userOnlyTurn2 = {
    messages: [
      { role: "user", content: "Hello world" },
      { role: "assistant", content: "Hi!" },
      { role: "user", content: "What is 2+2?" },
    ],
  };
  assert.equal(
    extractConversationPrefixHash(userOnlyTurn2),
    userOnlyHash,
    "Multi-turn user-only conversation must keep invariant first-user hash"
  );
});

test("PromptCacheAffinity - Rendezvous Hashing (HRW) deterministic selection across 100 runs", () => {
  const accounts = [
    { id: "acc_alpha", name: "Alpha Key" },
    { id: "acc_beta", name: "Beta Key" },
    { id: "acc_gamma", name: "Gamma Key" },
    { id: "acc_delta", name: "Delta Key" },
  ];

  const prefixHash = "a1b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f60718293a4b5c6d7e8f90";

  // Pick on run 0
  const firstChoice = pickAffinityAccount(accounts, prefixHash);
  assert.ok(firstChoice, "Should select an account");

  // Verify across 100 consecutive runs
  for (let i = 0; i < 100; i++) {
    const choice = pickAffinityAccount(accounts, prefixHash);
    assert.equal(
      choice?.id,
      firstChoice.id,
      `Run ${i}: Must deterministically choose ${firstChoice.id}`
    );
  }

  // With a different prefixHash, selection should still be deterministic
  const differentHash = "00112233445566778899aabbccddeeff00112233445566778899aabbccddeeff";
  const secondChoice = pickAffinityAccount(accounts, differentHash);
  assert.ok(secondChoice, "Should select an account for different hash");

  for (let i = 0; i < 50; i++) {
    const choice = pickAffinityAccount(accounts, differentHash);
    assert.equal(choice?.id, secondChoice.id, "Must remain deterministic for second hash");
  }
});

test("PromptCacheAffinity - Cooldown failover selects second-highest weight account", () => {
  const accounts = [
    { id: "acc_1", name: "Account 1" },
    { id: "acc_2", name: "Account 2" },
    { id: "acc_3", name: "Account 3" },
  ];

  const prefixHash = "deadbeefcafebabe1234567890abcdefdeadbeefcafebabe1234567890abcdef";

  // Determine initial winner among all 3 accounts
  const winner = pickAffinityAccount(accounts, prefixHash);
  assert.ok(winner);

  // Remove winner (simulating cooldown exclusion)
  const remaining = accounts.filter((a) => a.id !== winner.id);
  const secondWinner = pickAffinityAccount(remaining, prefixHash);

  assert.ok(secondWinner);
  assert.notEqual(secondWinner.id, winner.id, "Second choice must not be the original winner");

  // Verify second winner is deterministic across runs
  for (let i = 0; i < 20; i++) {
    const choice = pickAffinityAccount(remaining, prefixHash);
    assert.equal(choice?.id, secondWinner.id, "Second choice must be deterministic");
  }

  // Remove second winner, leaving one account
  const lastRemaining = remaining.filter((a) => a.id !== secondWinner.id);
  const lastWinner = pickAffinityAccount(lastRemaining, prefixHash);
  assert.equal(lastWinner?.id, lastRemaining[0].id);

  // Empty pool returns undefined
  assert.equal(pickAffinityAccount([], prefixHash), undefined);
});

test("CacheControlPolicy - Preserves cache_control for Anthropic, DashScope, and Xiaomi MiMo", () => {
  assert.equal(shouldPreserveCacheControl("anthropic", "claude-3-5-sonnet", "claude"), true);
  assert.equal(shouldPreserveCacheControl("claude", "claude-3-opus", "claude"), true);
  assert.equal(shouldPreserveCacheControl("custom-claude", "claude-3-haiku", "claude"), true);
  assert.equal(shouldPreserveCacheControl("dashscope", "qwen-max", "openai"), true);
  assert.equal(shouldPreserveCacheControl("alibaba", "qwen-plus", "openai"), true);
  assert.equal(shouldPreserveCacheControl("qwen", "qwen-turbo", "openai"), true);
  assert.equal(shouldPreserveCacheControl("xiaomi-mimo", "mimo-v1", "openai"), true);
  assert.equal(shouldPreserveCacheControl("mimo", "mimo-v1", "openai"), true);

  // In-place preservation test for Anthropic
  const anthropicBody = {
    system: [
      { type: "text", text: "System prompt", cache_control: { type: "ephemeral" } },
    ],
    messages: [
      {
        role: "user",
        content: [
          { type: "text", text: "Code review", cache_control: { type: "ephemeral" } },
        ],
      },
    ],
    tools: [
      {
        name: "test_tool",
        cache_control: { type: "ephemeral" },
      },
    ],
  };

  applyCacheControlPolicy(anthropicBody, "anthropic", "claude-3-5-sonnet", "claude");
  assert.ok(anthropicBody.system[0].cache_control, "Anthropic system cache_control must be preserved");
  assert.ok(
    (anthropicBody.messages[0].content as any)[0].cache_control,
    "Anthropic message cache_control must be preserved"
  );
  assert.ok(anthropicBody.tools[0].cache_control, "Anthropic tools cache_control must be preserved");

  // In-place preservation test for DashScope
  const dashscopeBody = {
    messages: [
      {
        role: "user",
        content: [
          { type: "text", text: "Hello", cache_control: { type: "ephemeral" } },
        ],
      },
    ],
  };
  applyCacheControlPolicy(dashscopeBody, "dashscope", "qwen-max", "openai");
  assert.ok(
    (dashscopeBody.messages[0].content as any)[0].cache_control,
    "DashScope cache_control must be preserved"
  );
});

test("CacheControlPolicy - Strips cache_control recursively for standard OpenAI, Azure, Codex, and Ollama", () => {
  assert.equal(shouldPreserveCacheControl("openai", "gpt-4o", "openai"), false);
  assert.equal(shouldPreserveCacheControl("azure", "gpt-4o", "openai"), false);
  assert.equal(shouldPreserveCacheControl("codex", "codex-mini", "openai"), false);
  assert.equal(shouldPreserveCacheControl("ollama", "llama3", "openai"), false);

  const testPayload = () => ({
    system: [
      { type: "text", text: "Base", cache_control: { type: "ephemeral" } },
    ],
    messages: [
      {
        role: "user",
        cache_control: { type: "ephemeral" },
        content: [
          { type: "text", text: "Sub-block", cache_control: { type: "ephemeral" } },
        ],
      },
    ],
    tools: [
      {
        name: "calc",
        cache_control: { type: "ephemeral" },
        function: {
          cache_control: { type: "ephemeral" },
        },
      },
    ],
  });

  // 1. OpenAI
  const oaiBody = testPayload();
  applyCacheControlPolicy(oaiBody, "openai", "gpt-4o", "openai");
  assert.equal(oaiBody.system[0].cache_control, undefined);
  assert.equal(oaiBody.messages[0].cache_control, undefined);
  assert.equal((oaiBody.messages[0].content as any)[0].cache_control, undefined);
  assert.equal(oaiBody.tools[0].cache_control, undefined);
  assert.equal((oaiBody.tools[0] as any).function.cache_control, undefined);

  // 2. Azure
  const azureBody = testPayload();
  applyCacheControlPolicy(azureBody, "azure", "gpt-4o", "openai");
  assert.equal(azureBody.system[0].cache_control, undefined);
  assert.equal(azureBody.messages[0].cache_control, undefined);
  assert.equal((azureBody.messages[0].content as any)[0].cache_control, undefined);

  // 3. Codex
  const codexBody = testPayload();
  applyCacheControlPolicy(codexBody, "codex", "codex-mini", "openai");
  assert.equal(codexBody.system[0].cache_control, undefined);
  assert.equal((codexBody.messages[0].content as any)[0].cache_control, undefined);

  // 4. Ollama
  const ollamaBody = testPayload();
  applyCacheControlPolicy(ollamaBody, "ollama", "llama3", "openai");
  assert.equal(ollamaBody.system[0].cache_control, undefined);
  assert.equal((ollamaBody.messages[0].content as any)[0].cache_control, undefined);
});

test("LoadBalancer integration - Prompt Cache Affinity with cooldown failover", () => {
  const providerId = "test_affinity_provider";

  // Clean up any stale accounts from previous test runs
  try {
    ProviderRepository.deleteAccount("acc_affinity_1");
    ProviderRepository.deleteAccount("acc_affinity_2");
    ProviderRepository.deleteAccount("acc_affinity_3");
    ProviderRepository.deleteProvider(providerId);
  } catch {}

  // Create provider
  ProviderRepository.ensureProviderExists(providerId, "Affinity Test Provider");
  ProviderRepository.updateProviderStrategy(providerId, "round-robin", 1);

  // Register 3 accounts
  ProviderRepository.addAccount({
    id: "acc_affinity_1",
    providerId,
    name: "Key 1",
    rawApiKey: "sk-key-1",
  });
  ProviderRepository.addAccount({
    id: "acc_affinity_2",
    providerId,
    name: "Key 2",
    rawApiKey: "sk-key-2",
  });
  ProviderRepository.addAccount({
    id: "acc_affinity_3",
    providerId,
    name: "Key 3",
    rawApiKey: "sk-key-3",
  });

  LoadBalancer.clearCooldowns();
  LoadBalancer.clearStickyCounts();

  const prefixHash = "fedcba9876543210fedcba9876543210fedcba9876543210fedcba9876543210";

  // Pick with prefixHash
  const firstPick = LoadBalancer.pickAccount(providerId, { prefixHash });
  assert.ok(firstPick, "Must pick an account with prefixHash");

  // Repeated calls with same prefixHash must pick the same account
  for (let i = 0; i < 10; i++) {
    const pick = LoadBalancer.pickAccount(providerId, { prefixHash });
    assert.equal(pick?.id, firstPick.id, "Must deterministically pick the same affinity account");
  }

  // Put firstPick into cooldown
  cooldownManager.markRateLimited(firstPick.id, 60_000, providerId);

  // Pick again: must pick second-highest affinity account
  const secondPick = LoadBalancer.pickAccount(providerId, { prefixHash });
  assert.ok(secondPick, "Must pick a healthy account when first is in cooldown");
  assert.notEqual(secondPick.id, firstPick.id, "Must not pick account in cooldown");

  // Repeated calls must pick the same second-highest account
  for (let i = 0; i < 10; i++) {
    const pick = LoadBalancer.pickAccount(providerId, { prefixHash });
    assert.equal(pick?.id, secondPick.id, "Must deterministically pick second-highest affinity account");
  }

  // Clean up
  LoadBalancer.clearCooldowns();
});
