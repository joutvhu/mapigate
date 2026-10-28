import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { stripNullBytes, getDatabase } from "../src/storage/database.js";
import { OpenAiProvider } from "../src/providers/runtime/openai/provider.js";
import { normalizeKiroUpstreamModelId } from "../src/providers/runtime/kiro/provider.js";
import { ANTIGRAVITY_USER_AGENT, ANTIGRAVITY_IDE_VERSION } from "../src/providers/runtime/antigravity/types.js";
import { models as antigravityModels } from "../src/providers/runtime/antigravity/models.js";
import { getCapabilitiesForModel } from "../src/core/capabilities/index.js";
import { checkFallbackError, handleFallbackChat } from "../src/providers/composite/combo/fallbackStrategy.js";
import { TokenSaverCoordinator } from "../src/core/tokenSaver/index.js";

describe("Upstream 9router Port Fixes", () => {
  describe("1. SQLite NUL byte safety", () => {
    it("strips NUL bytes from strings and keeps valid content", () => {
      const dirty = `before\0after\0tail`;
      assert.equal(stripNullBytes(dirty), "beforeaftertail");
      assert.equal(stripNullBytes("clean-text"), "clean-text");
      assert.equal(stripNullBytes(123), 123);
      assert.equal(stripNullBytes(null), null);
      assert.equal(stripNullBytes(undefined), undefined);
    });

    it("binds NUL-containing strings safely in SQLite without truncation or throw", () => {
      const db = getDatabase();
      db.exec("CREATE TABLE IF NOT EXISTS test_nul_bytes (id INTEGER PRIMARY KEY, value TEXT)");
      db.run("INSERT INTO test_nul_bytes (value) VALUES (?)", "model-name\0-suffix");
      const row = db.get<{ value: string }>("SELECT value FROM test_nul_bytes WHERE value = ?", "model-name\0-suffix");
      assert.ok(row);
      assert.equal(row.value, "model-name-suffix");
      db.exec("DROP TABLE IF EXISTS test_nul_bytes");
    });
  });

  describe("2. OpenAI max_tokens rename to max_completion_tokens", () => {
    it("renames max_tokens to max_completion_tokens for OpenAI provider", () => {
      const provider = new OpenAiProvider();
      const body = { max_tokens: 4096, temperature: 0.7 };
      const converted = provider.transformRequestBody({
        targetModel: "gpt-4o",
        clientFormat: "openai",
        body,
      } as any);

      assert.equal(converted.max_completion_tokens, 4096);
      assert.equal(converted.max_tokens, undefined);
      assert.equal(converted.temperature, 0.7);
    });

    it("preserves explicit max_completion_tokens if already set", () => {
      const provider = new OpenAiProvider();
      const body = { max_tokens: 2048, max_completion_tokens: 8192 };
      const converted = provider.transformRequestBody({
        targetModel: "o3-mini",
        clientFormat: "openai",
        body,
      } as any);

      assert.equal(converted.max_completion_tokens, 8192);
      assert.equal(converted.max_tokens, undefined);
    });
  });

  describe("3. Antigravity hub/2.28.0 and Gemini 4 Argon tiers", () => {
    it("uses hub/2.28.0 User-Agent", () => {
      assert.equal(ANTIGRAVITY_IDE_VERSION, "2.28.0");
      assert.ok(ANTIGRAVITY_USER_AGENT.includes("hub/2.28.0"));
    });

    it("registers gemini-4-argon medium and low tiers", () => {
      const modelIds = antigravityModels.map((m) => m.id);
      assert.ok(modelIds.includes("gemini-4-argon-high"));
      assert.ok(modelIds.includes("gemini-4-argon-medium"));
      assert.ok(modelIds.includes("gemini-4-argon-low"));
    });
  });

  describe("4. Grok 500k context capabilities", () => {
    it("reports 500k context window for Grok 4.7, 4.6, 4.5", () => {
      const caps47 = getCapabilitiesForModel("grok", "grok-4.7");
      assert.equal(caps47.contextWindow, 500000);
      assert.equal(caps47.maxOutput, 500000);
      assert.equal(caps47.reasoning, true);

      const caps46 = getCapabilitiesForModel("grok", "grok-4.6");
      assert.equal(caps46.contextWindow, 500000);

      const caps45 = getCapabilitiesForModel("grok", "grok-4.5");
      assert.equal(caps45.contextWindow, 500000);

      const caps4 = getCapabilitiesForModel("grok", "grok-4");
      assert.equal(caps4.contextWindow, 256000);
    });
  });

  describe("5. Kiro model normalization", () => {
    it("strips Anthropic date snapshot suffixes to dotted aliases", () => {
      assert.equal(normalizeKiroUpstreamModelId("claude-sonnet-4-5-20250929"), "claude-sonnet-4.5");
      assert.equal(normalizeKiroUpstreamModelId("claude-opus-4-5-20251101"), "claude-opus-4.5");
      assert.equal(normalizeKiroUpstreamModelId("claude-haiku-4-5-20251001"), "claude-haiku-4.5");
    });

    it("normalizes MiniMax casing to lowercase minimax-m2.5", () => {
      assert.equal(normalizeKiroUpstreamModelId("MiniMax-M2.5"), "minimax-m2.5");
    });
  });

  describe("6. Combo fallback on request-scoped 4xx and credit errors", () => {
    it("identifies request-scoped 400 validation error without cooldown", () => {
      const decision = checkFallbackError(400, "Request validation failed");
      assert.equal(decision.shouldFallback, false);
      assert.equal(decision.cooldownMs, 0);
      assert.equal(decision.requestScoped, true);
    });

    it("identifies insufficient credits as quota limit with cooldown", () => {
      const decision = checkFallbackError(400, "credit balance is too low");
      assert.equal(decision.shouldFallback, true);
      assert.ok(decision.cooldownMs && decision.cooldownMs > 0);
    });

    it("advances to next combo model when first model rejects with 400 validation error", async () => {
      const calls: string[] = [];
      const handleSingleModel = async (_body: any, modelStr: string) => {
        calls.push(modelStr);
        if (modelStr === "provider-a/model-a") {
          return { ok: false, status: 400, error: "Unsupported parameter: response_format" };
        }
        return { ok: true, status: 200, text: "Success from model-b" };
      };

      const result = await handleFallbackChat({
        body: { messages: [{ role: "user", content: "hello" }] },
        models: ["provider-a/model-a", "provider-b/model-b"],
        handleSingleModel,
        comboStrategy: "fallback",
        autoSwitch: false,
      });

      assert.equal(result.ok, true);
      assert.equal(result.modelUsed, "provider-b/model-b");
      assert.deepEqual(calls, ["provider-a/model-a", "provider-b/model-b"]);
    });

    it("returns first request-scoped error if all models reject the request", async () => {
      const handleSingleModel = async (_body: any, modelStr: string) => {
        if (modelStr === "provider-a/model-a") {
          return { ok: false, status: 400, error: "Validation failed on model A" };
        }
        return { ok: false, status: 400, error: "Validation failed on model B" };
      };

      const result = await handleFallbackChat({
        body: { messages: [{ role: "user", content: "hello" }] },
        models: ["provider-a/model-a", "provider-b/model-b"],
        handleSingleModel,
        comboStrategy: "fallback",
        autoSwitch: false,
      });

      assert.equal(result.ok, false);
      assert.equal(result.status, 400);
      assert.equal(result.error, "Validation failed on model A");
    });
  });

  describe("7. Custom System Prompt in Token Saver Coordinator", () => {
    it("injects custom prompt into OpenAI messages when enabled", () => {
      const body = {
        messages: [{ role: "user", content: "hello" }],
      };

      const summary = TokenSaverCoordinator.process(
        body,
        { clientFormat: "openai", targetFormat: "openai" },
        {
          rtkEnabled: false,
          cavemanEnabled: false,
          ponytailEnabled: false,
          customPromptEnabled: true,
          customPrompt: "Prefer editing existing files over creating new ones.",
        }
      );

      assert.ok(summary.results.some((r) => r.methodId === "customPrompt" && r.applied));
      const sysMsg = body.messages.find((m) => m.role === "system");
      assert.ok(sysMsg);
      assert.ok(sysMsg.content.includes("Prefer editing existing files over creating new ones."));
    });

    it("does not inject anything when disabled or empty", () => {
      const body = {
        messages: [{ role: "user", content: "hello" }],
      };

      TokenSaverCoordinator.process(
        body,
        { clientFormat: "openai", targetFormat: "openai" },
        {
          rtkEnabled: false,
          cavemanEnabled: false,
          ponytailEnabled: false,
          customPromptEnabled: false,
          customPrompt: "Should not appear",
        }
      );

      const sysMsg = body.messages.find((m) => m.role === "system");
      assert.equal(sysMsg, undefined);
    });
  });
});
