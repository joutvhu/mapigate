process.env.NODE_ENV = "test";

import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import {
  extractKiroConversationId,
} from "../src/mitm/handlers/kiro/interceptor.js";
import {
  codeWhispererToMessages,
  recoverUnchangedFileContent,
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

  describe("3. Unchanged File Cache Recovery & Loop Breaker", () => {
    it("returns raw tool content if not containing unchanged message", () => {
      const tr = {
        toolUseId: "call_file_1",
        content: [{ text: "fn main() { println!(\"Hello\"); }" }],
      };
      const result = recoverUnchangedFileContent(tr, []);
      assert.equal(result, "fn main() { println!(\"Hello\"); }");
    });

    it("recovers file content from prior history when unchanged notice is encountered", () => {
      const priorHistory = [
        {
          assistantResponseMessage: {
            content: "I will read Cargo.toml",
            toolUses: [
              {
                toolUseId: "call_read_1",
                name: "read_file",
                input: { path: "Cargo.toml", offset: 0, limit: 100 },
              },
            ],
          },
        },
        {
          userInputMessage: {
            content: "",
            userInputMessageContext: {
              toolResults: [
                {
                  toolUseId: "call_read_1",
                  content: [{ text: "[package]\nname = \"mcp-sentinel\"\nversion = \"0.1.0\"" }],
                },
              ],
            },
          },
        },
        {
          assistantResponseMessage: {
            content: "I will read Cargo.toml again",
            toolUses: [
              {
                toolUseId: "call_read_2",
                name: "read_file",
                input: { path: "Cargo.toml" },
              },
            ],
          },
        },
      ];

      const currentTr = {
        toolUseId: "call_read_2",
        content: [{ text: "'Cargo.toml' is unchanged since you read it earlier this session — the content is already in your context above." }],
      };

      const recovered = recoverUnchangedFileContent(currentTr, priorHistory);
      assert.equal(recovered, "[package]\nname = \"mcp-sentinel\"\nversion = \"0.1.0\"");
    });

    it("normalizes path with Windows backslashes to match history", () => {
      const priorHistory = [
        {
          assistantResponseMessage: {
            toolUses: [
              {
                toolUseId: "call_init",
                name: "read_file",
                input: { path: "f:\\projects\\app\\src\\index.ts" },
              },
            ],
          },
        },
        {
          userInputMessage: {
            content: "",
            userInputMessageContext: {
              toolResults: [
                {
                  toolUseId: "call_init",
                  content: [{ text: "console.log('original index.ts');" }],
                },
              ],
            },
          },
        },
      ];

      const currentTr = {
        toolUseId: "call_repeat",
        content: "'f:/projects/app/src/index.ts' is unchanged since you read it earlier this session — the content is already in your context above.",
      };

      const recovered = recoverUnchangedFileContent(currentTr, priorHistory);
      assert.equal(recovered, "console.log('original index.ts');");
    });

    it("appends concise system note if file content is absent in history", () => {
      const currentTr = {
        toolUseId: "call_missing",
        content: "'unknown.txt' is unchanged since you read it earlier this session — the content is already in your context above.",
      };
      const res = recoverUnchangedFileContent(currentTr, []);
      assert.ok(res.includes("'unknown.txt' is unchanged since you read it earlier this session"));
      assert.ok(res.includes("[System Note: The full content of this file was already loaded in the conversation history above."));
    });

    it("codeWhispererToMessages properly recovers unchanged file content in message stream", () => {
      const body = {
        conversationState: {
          history: [
            {
              assistantResponseMessage: {
                toolUses: [
                  {
                    toolUseId: "call_hist_1",
                    name: "read_file",
                    input: { path: "package.json" },
                  },
                ],
              },
            },
            {
              userInputMessage: {
                content: "",
                userInputMessageContext: {
                  toolResults: [
                    {
                      toolUseId: "call_hist_1",
                      content: [{ text: "{\"name\": \"mapigate\"}" }],
                    },
                  ],
                },
              },
            },
            {
              assistantResponseMessage: {
                toolUses: [
                  {
                    toolUseId: "call_hist_2",
                    name: "read_file",
                    input: { path: "package.json" },
                  },
                ],
              },
            },
          ],
          currentMessage: {
            userInputMessage: {
              content: "",
              userInputMessageContext: {
                toolResults: [
                  {
                    toolUseId: "call_hist_2",
                    content: "'package.json' is unchanged since you read it earlier this session — the content is already in your context above.",
                  },
                ],
              },
            },
          },
        },
      };

      const messages = codeWhispererToMessages(body);
      const lastToolMsg = messages.find((m) => m.role === "tool" && m.tool_call_id === "call_hist_2");
      assert.ok(lastToolMsg);
      assert.equal(lastToolMsg.content, "{\"name\": \"mapigate\"}");
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
