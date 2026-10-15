import test from "node:test";
import assert from "node:assert/strict";
import {
  ReasoningCache,
  reasoningCache,
  requiresReasoningReplay,
  applyReasoningReplayPolicy,
  pruneExpiredReasoningCache,
  startReasoningCachePruneJob,
  stopReasoningCachePruneJob,
} from "../src/core/caching/reasoningCache.js";
import { getDatabase } from "../src/storage/database.js";

test("ReasoningCache - In-memory LRU eviction", () => {
  // Initialize cache with max 2 entries
  const cache = new ReasoningCache(2);
  cache.clear();

  cache.save("call_1", "deepseek", "deepseek-chat", "reasoning 1");
  cache.save("call_2", "deepseek", "deepseek-chat", "reasoning 2");

  assert.equal(cache.hasInMemory("call_1"), true);
  assert.equal(cache.hasInMemory("call_2"), true);
  assert.equal(cache.getMemorySize(), 2);

  // Access call_1 so call_2 becomes the oldest entry
  const r1 = cache.get("call_1");
  assert.equal(r1, "reasoning 1");

  // Save third entry; call_2 should be evicted from in-memory cache
  cache.save("call_3", "deepseek", "deepseek-chat", "reasoning 3");

  assert.equal(cache.hasInMemory("call_1"), true);
  assert.equal(cache.hasInMemory("call_2"), false, "call_2 should have been evicted from LRU memory");
  assert.equal(cache.hasInMemory("call_3"), true);
  assert.equal(cache.getMemorySize(), 2);
});

test("ReasoningCache - SQLite persistence and reload into memory", () => {
  const cache1 = new ReasoningCache();
  cache1.clear();

  cache1.save("call_persist_1", "deepseek", "deepseek-reasoner", "deep reasoning text");

  // Verify directly in SQLite database
  const db = getDatabase();
  const row = db.get<{ reasoning: string; provider: string; model: string }>(
    "SELECT reasoning, provider, model FROM reasoning_cache WHERE tool_call_id = ?",
    "call_persist_1"
  );
  assert.ok(row, "Row must exist in SQLite reasoning_cache table");
  assert.equal(row.reasoning, "deep reasoning text");
  assert.equal(row.provider, "deepseek");
  assert.equal(row.model, "deepseek-reasoner");

  // Create a brand new cache instance with empty memory
  const cache2 = new ReasoningCache();
  assert.equal(cache2.hasInMemory("call_persist_1"), false);

  // get() should fetch from SQLite and reload into memory
  const reloaded = cache2.get("call_persist_1");
  assert.equal(reloaded, "deep reasoning text");
  assert.equal(cache2.hasInMemory("call_persist_1"), true);
});

test("ReasoningCache - saveMultiple handles arrays of tool IDs", () => {
  const cache = new ReasoningCache();
  cache.clear();

  cache.saveMultiple(["tc_1", "tc_2", "tc_3"], "moonshot", "kimi-k2.7-code", "kimi reasoning");

  assert.equal(cache.get("tc_1"), "kimi reasoning");
  assert.equal(cache.get("tc_2"), "kimi reasoning");
  assert.equal(cache.get("tc_3"), "kimi reasoning");
});

test("requiresReasoningReplay - identifies thinking vs non-thinking providers/models", () => {
  // Thinking providers
  assert.equal(requiresReasoningReplay("deepseek", "deepseek-chat"), true);
  assert.equal(requiresReasoningReplay("kimi-coding", "kimi-k2"), true);
  assert.equal(requiresReasoningReplay("xiaomi-mimo", "mimo-v1"), true);
  assert.equal(requiresReasoningReplay("command-code", "anything"), true);

  // Model pattern matches on arbitrary providers
  assert.equal(requiresReasoningReplay("custom", "deepseek-r1-distill"), true);
  assert.equal(requiresReasoningReplay("openrouter", "deepseek/deepseek-v4-pro"), true);
  assert.equal(requiresReasoningReplay("together", "Qwen/QwQ-32B-Preview"), true);
  assert.equal(requiresReasoningReplay("host", "glm-4-thinking"), true);
  assert.equal(requiresReasoningReplay("host", "claude-3-7-sonnet-thinking"), true);

  // Object params format
  assert.equal(requiresReasoningReplay({ provider: "deepseek", model: "deepseek-chat" }), true);

  // Non-thinking models/providers
  assert.equal(requiresReasoningReplay("openai", "gpt-4o"), false);
  assert.equal(requiresReasoningReplay("openai", "gpt-3.5-turbo"), false);
  assert.equal(requiresReasoningReplay("anthropic", "claude-3-5-sonnet-20241022"), false);
  assert.equal(requiresReasoningReplay("mistral", "mistral-large-2407"), false);
});

test("applyReasoningReplayPolicy - OpenAI format with cached reasoning", () => {
  const cache = new ReasoningCache();
  cache.clear();
  cache.save("call_abc_1", "deepseek", "deepseek-chat", "Calculated 2 + 2 = 4 internally");

  const messages = [
    { role: "user", content: "What is 2 + 2?" },
    {
      role: "assistant",
      content: null,
      tool_calls: [
        {
          id: "call_abc_1",
          type: "function",
          function: { name: "calculate", arguments: '{"expr":"2+2"}' },
        },
      ],
    },
    { role: "tool", tool_call_id: "call_abc_1", content: "4" },
  ];

  applyReasoningReplayPolicy(messages, "deepseek", "deepseek-chat", cache);

  assert.equal(
    (messages[1] as any).reasoning_content,
    "Calculated 2 + 2 = 4 internally",
    "Should inject cached reasoning_content into assistant message with tool_calls"
  );
});

test("applyReasoningReplayPolicy - OpenAI format with cache miss falls back to empty string", () => {
  const cache = new ReasoningCache();
  cache.clear();

  const messages = [
    { role: "user", content: "Search for weather" },
    {
      role: "assistant",
      content: null,
      tool_calls: [
        {
          id: "call_uncached_999",
          type: "function",
          function: { name: "get_weather", arguments: '{"city":"Tokyo"}' },
        },
      ],
    },
  ];

  applyReasoningReplayPolicy(messages, "deepseek", "deepseek-chat", cache);

  assert.equal(
    (messages[1] as any).reasoning_content,
    "",
    "Cache miss on thinking model must fall back to empty string '' to prevent 400 error"
  );
});

test("applyReasoningReplayPolicy - Anthropic format with cached reasoning", () => {
  const cache = new ReasoningCache();
  cache.clear();
  cache.save("toolu_xyz_1", "deepseek", "deepseek-chat", "Anthropic thinking steps");

  const messages = [
    { role: "user", content: "Run diagnostics" },
    {
      role: "assistant",
      content: [
        {
          type: "tool_use",
          id: "toolu_xyz_1",
          name: "diagnostics",
          input: { run: true },
        },
      ],
    },
  ];

  applyReasoningReplayPolicy(messages, "deepseek", "deepseek-chat", cache);

  const assistantContent = messages[1].content as any[];
  assert.equal(assistantContent.length, 2);
  assert.deepEqual(assistantContent[0], {
    type: "thinking",
    thinking: "Anthropic thinking steps",
  });
  assert.equal(assistantContent[1].type, "tool_use");
});

test("applyReasoningReplayPolicy - Anthropic format with cache miss falls back to empty string", () => {
  const cache = new ReasoningCache();
  cache.clear();

  const messages = [
    { role: "user", content: "Run search" },
    {
      role: "assistant",
      content: [
        {
          type: "tool_use",
          id: "toolu_unknown_456",
          name: "search",
          input: { q: "test" },
        },
      ],
    },
  ];

  applyReasoningReplayPolicy(messages, "deepseek", "deepseek-chat", cache);

  const assistantContent = messages[1].content as any[];
  assert.equal(assistantContent.length, 2);
  assert.deepEqual(assistantContent[0], {
    type: "thinking",
    thinking: "",
  });
});

test("applyReasoningReplayPolicy - strips reasoning for non-thinking models", () => {
  // Test OpenAI format stripping
  const openAiMessages = [
    { role: "user", content: "Hello" },
    {
      role: "assistant",
      content: "Hi there!",
      reasoning_content: "Leftover thinking from prior deepseek turn",
      reasoning: "Alternative field",
    },
  ];

  applyReasoningReplayPolicy(openAiMessages, "openai", "gpt-4o");

  assert.equal("reasoning_content" in openAiMessages[1], false);
  assert.equal("reasoning" in openAiMessages[1], false);
  assert.equal(openAiMessages[1].content, "Hi there!");

  // Test Anthropic format stripping
  const anthropicMessages = [
    { role: "user", content: "Hello" },
    {
      role: "assistant",
      content: [
        { type: "thinking", thinking: "Unwanted thinking block" },
        { type: "text", text: "Answer without thinking" },
      ],
    },
  ];

  applyReasoningReplayPolicy(anthropicMessages, "mistral", "mistral-large");

  const blocks = anthropicMessages[1].content as any[];
  assert.equal(blocks.length, 1);
  assert.equal(blocks[0].type, "text");
  assert.equal(blocks[0].text, "Answer without thinking");
});

test("ReasoningCache - secondary index idx_reasoning_cache_expires exists in database", () => {
  const db = getDatabase();
  const indexRow = db.get<{ name: string }>(
    "SELECT name FROM sqlite_master WHERE type = 'index' AND name = 'idx_reasoning_cache_expires'"
  );
  assert.ok(indexRow, "Index idx_reasoning_cache_expires must exist on reasoning_cache table");
});

test("ReasoningCache - pruneExpiredReasoningCache cleans up expired rows", () => {
  const db = getDatabase();
  const now = Date.now();

  // Insert one expired entry and one active entry
  db.run(
    `INSERT OR REPLACE INTO reasoning_cache (tool_call_id, provider, model, reasoning, char_count, created_at, expires_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    "tc_expired_test_1",
    "deepseek",
    "deepseek-reasoner",
    "expired reasoning",
    17,
    now - 10_000,
    now - 1_000 // Expired 1 second ago
  );

  db.run(
    `INSERT OR REPLACE INTO reasoning_cache (tool_call_id, provider, model, reasoning, char_count, created_at, expires_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    "tc_active_test_1",
    "deepseek",
    "deepseek-reasoner",
    "active reasoning",
    16,
    now,
    now + 60_000 // Valid for 60s
  );

  const prunedCount = pruneExpiredReasoningCache();
  assert.ok(prunedCount >= 1, `Pruned count must be at least 1, got ${prunedCount}`);

  const expiredRow = db.get("SELECT * FROM reasoning_cache WHERE tool_call_id = ?", "tc_expired_test_1");
  assert.equal(expiredRow, undefined, "Expired row should be removed by pruneExpiredReasoningCache");

  const activeRow = db.get("SELECT * FROM reasoning_cache WHERE tool_call_id = ?", "tc_active_test_1");
  assert.ok(activeRow, "Active row should remain in reasoning_cache");

  // Verify prune job functions
  const timer = startReasoningCachePruneJob();
  assert.ok(timer, "Timer must be returned");
  stopReasoningCachePruneJob();
});


