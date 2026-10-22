process.env.NODE_ENV = "test";

import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import {
  extractKiroConversationId,
} from "../src/mitm/handlers/kiro/interceptor.js";
import {
  codeWhispererToMessages,
  convertUserInputMessage,
} from "../src/mitm/handlers/kiro/converter.js";
import { resolveSessionId } from "../src/providers/runtime/antigravity/schema.js";
import { LoadBalancer } from "../src/core/router/loadBalancer.js";
import { ProviderRepository } from "../src/storage/repositories/providerRepo.js";
import { getDatabase } from "../src/storage/database.js";
import { extractSessionId } from "../src/server/proxy/executorHelpers.js";

describe("Kiro Session Extraction, Cache Recovery & Stickiness", () => {
  describe("1. extractKiroConversationId & extractSessionId", () => {
    it("extracts session from conversationState.conversationId at Turn 1", () => {
      const body = {
        conversationState: {
          conversationId: "sess_turn_1_abc123",
          history: [],
        },
      };
      assert.equal(extractKiroConversationId(body), "sess_turn_1_abc123");
      assert.equal(extractSessionId({}, body), "sess_turn_1_abc123");
    });

    it("extracts session from metadata['kiro:conversation_id'] at Turn 2+", () => {
      const body = {
        conversationState: {
          history: [],
        },
        metadata: {
          "kiro:conversation_id": "sess_turn_2_xyz789",
          "kiro:root_conversation_id": "sess_turn_2_xyz789",
        },
      };
      assert.equal(extractKiroConversationId(body), "sess_turn_2_xyz789");
      assert.equal(extractSessionId({}, body), "sess_turn_2_xyz789");
    });

    it("extracts session from metadata['kiro:root_conversation_id'] if conversation_id missing", () => {
      const body = {
        metadata: {
          "kiro:root_conversation_id": "sess_root_456",
        },
      };
      assert.equal(extractKiroConversationId(body), "sess_root_456");
      assert.equal(extractSessionId({}, body), "sess_root_456");
    });

    it("extracts session from headers (x-session-id)", () => {
      const req = {
        headers: {
          "x-session-id": "sess_header_999",
        },
      };
      assert.equal(extractSessionId(req, {}), "sess_header_999");
    });

    it("returns empty string / undefined when no session id is present", () => {
      assert.equal(extractKiroConversationId({}), "");
      assert.equal(extractKiroConversationId(null), "");
      assert.equal(extractSessionId({}, {}), undefined);
    });
  });

  describe("2. resolveSessionId in Antigravity Schema", () => {
    it("prioritizes x-session-id header over body", () => {
      const req = { headers: { "x-session-id": "header_sid_123" } };
      const body = { metadata: { "kiro:conversation_id": "body_sid_456" } };
      assert.equal(resolveSessionId(req, body, "fallback_acc"), "header_sid_123");
    });

    it("extracts from body.metadata['kiro:conversation_id'] when header is missing", () => {
      const req = { headers: {} };
      const body = { metadata: { "kiro:conversation_id": "kiro_meta_sid_789" } };
      assert.equal(resolveSessionId(req, body, "fallback_acc"), "kiro_meta_sid_789");
    });

    it("extracts from body.conversationState.conversationId when header is missing", () => {
      const req = { headers: {} };
      const body = { conversationState: { conversationId: "kiro_state_sid_001" } };
      assert.equal(resolveSessionId(req, body, "fallback_acc"), "kiro_state_sid_001");
    });

    it("falls back to antigravity:account:identifier when no session id exists", () => {
      const req = { headers: {} };
      const body = {};
      assert.equal(resolveSessionId(req, body, "acc_test_fallback"), "antigravity:account:acc_test_fallback");
    });
  });

  describe("3. Raw Tool Result Preservation (9router parity)", () => {
    it("returns raw tool content as-is without alteration", () => {
      const uim = {
        userInputMessageContext: {
          toolResults: [
            {
              toolUseId: "call_file_1",
              content: [{ text: "fn main() { println!(\"Hello\"); }" }],
            },
          ],
        },
      };
      const result = convertUserInputMessage(uim);
      assert.equal(result.length, 1);
      assert.equal(result[0].role, "tool");
      assert.equal(result[0].content, "fn main() { println!(\"Hello\"); }");
    });

    it("codeWhispererToMessages preserves tool results untouched", () => {
      const body = {
        conversationState: {
          history: [],
          currentMessage: {
            userInputMessage: {
              content: "",
              userInputMessageContext: {
                toolResults: [
                  {
                    toolUseId: "call_hist_2",
                    content: [
                      {
                        text: "'package.json' is unchanged since you read it earlier this session — the content is already in your context above.",
                      },
                    ],
                  },
                ],
              },
            },
          },
        },
      };

      const messages = codeWhispererToMessages(body);
      const toolMsg = messages.find((m) => m.role === "tool" && m.tool_call_id === "call_hist_2");
      assert.ok(toolMsg);
      assert.equal(
        toolMsg.content,
        "'package.json' is unchanged since you read it earlier this session — the content is already in your context above."
      );
    });
  });

  describe("4. Session Stickiness in LoadBalancer (100% Affinity with 429 Failover)", () => {
    const testProviderId = "test_stickiness_prov";
    const acc1Id = "acc_stick_1";
    const acc2Id = "acc_stick_2";

    beforeEach(() => {
      LoadBalancer.reset();

      // Clean DB test records
      const db = getDatabase();
      db.run("DELETE FROM provider_accounts WHERE provider_id = ?", testProviderId);
      db.run("DELETE FROM providers WHERE id = ?", testProviderId);

      // Create test provider with round-robin strategy
      ProviderRepository.saveProvider({
        id: testProviderId,
        name: "Stickiness Test Provider",
        baseUrl: "https://api.test.com/v1",
        format: "openai",
        strategy: "round-robin",
        isActive: true,
      });

      // Add two accounts
      ProviderRepository.addAccount({
        id: acc1Id,
        providerId: testProviderId,
        name: "Sticky Account 1",
        apiKeyEncrypted: "enc_key_1",
        rawApiKey: "key_1",
        isActive: true,
        priority: 1,
      });

      ProviderRepository.addAccount({
        id: acc2Id,
        providerId: testProviderId,
        name: "Sticky Account 2",
        apiKeyEncrypted: "enc_key_2",
        rawApiKey: "key_2",
        isActive: true,
        priority: 2,
      });
    });

    it("guarantees 100% session affinity across repeated calls with same sessionId", () => {
      const sessionId = "sess_affinity_100pct";

      // First pick establishes the sticky mapping
      const firstPick = LoadBalancer.pickAccount(testProviderId, { sessionId });
      assert.ok(firstPick);
      const chosenAccountId = firstPick.id;

      // Call 25 times: MUST ALWAYS pick the exact same account
      for (let i = 0; i < 25; i++) {
        const pick = LoadBalancer.pickAccount(testProviderId, { sessionId });
        assert.equal(pick?.id, chosenAccountId, `Turn ${i + 1} must maintain 100% session affinity`);
      }
    });

    it("fails over smoothly and rebinds session when sticky account hits rate limit (429)", () => {
      const sessionId = "sess_failover_test";

      const pick1 = LoadBalancer.pickAccount(testProviderId, { sessionId });
      assert.ok(pick1);
      const originalAccountId = pick1.id;
      const expectedFailoverId = originalAccountId === acc1Id ? acc2Id : acc1Id;

      // Sticky account hits rate limit
      LoadBalancer.markRateLimited(originalAccountId, 60_000, testProviderId);

      // Next pick for the session MUST failover to the healthy account and rebind
      const pick2 = LoadBalancer.pickAccount(testProviderId, {
        excludeAccountIds: new Set([originalAccountId]),
        sessionId,
      });
      assert.ok(pick2);
      assert.equal(pick2.id, expectedFailoverId, "Must fail over to alternate healthy account");

      // Subsequent calls for that session MUST now stick to the new account
      for (let i = 0; i < 10; i++) {
        const subsequentPick = LoadBalancer.pickAccount(testProviderId, { sessionId });
        assert.equal(subsequentPick?.id, expectedFailoverId, "Must remain stuck to newly failovered account");
      }
    });

    it("clearSessionStickiness clears mapping for session", () => {
      const sessionId = "sess_clear_test";
      const pick1 = LoadBalancer.pickAccount(testProviderId, { sessionId });
      assert.ok(pick1);

      assert.equal(LoadBalancer.getStickyAccountId(testProviderId, sessionId), pick1.id);
      LoadBalancer.clearSessionStickiness(sessionId, testProviderId);
      assert.equal(LoadBalancer.getStickyAccountId(testProviderId, sessionId), undefined);
    });
  });
});
