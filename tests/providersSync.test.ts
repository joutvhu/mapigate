import test from "node:test";
import assert from "node:assert/strict";
import { ProviderRegistry } from "../src/providers/registry.js";
import { getRegistryProvider } from "../src/providers/metadataRegistry.js";
import { OAuthHandlerRegistry } from "../src/providers/core/oauthRegistry.js";
import { getClineAccessToken } from "../src/providers/runtime/cline/provider.js";
import {
  stripCodexUnsupportedPatterns,
  convertSystemToDeveloperRole,
  stripStoredItemReferences,
} from "../src/providers/runtime/codex/schemaSanitizer.js";
import { qoderEncodeBody, buildCosyHeaders } from "../src/providers/runtime/qoder/cosy.js";

test("providersSync - promoted runtime providers are registered in ProviderRegistry", () => {
  const trae = ProviderRegistry.get("trae");
  assert.ok(trae, "trae should be registered in ProviderRegistry");
  assert.equal(trae.id, "trae");

  const zed = ProviderRegistry.get("zed");
  assert.ok(zed, "zed should be registered in ProviderRegistry");
  assert.equal(zed.id, "zed");
  assert.equal(zed.supportsQuota(), true);

  const windsurf = ProviderRegistry.get("windsurf");
  assert.ok(windsurf, "windsurf should be registered in ProviderRegistry");
  assert.equal(windsurf.id, "windsurf");

  const codebuddy = ProviderRegistry.get("codebuddy-cn");
  assert.ok(codebuddy, "codebuddy-cn should be registered in ProviderRegistry");
  assert.equal(codebuddy.id, "codebuddy-cn");
  assert.equal(codebuddy.supportsQuota(), true);
});

test("providersSync - metadata registry contains updated metadata and models", () => {
  const traeMeta = getRegistryProvider("trae");
  assert.ok(traeMeta);
  assert.equal(traeMeta?.name, "Trae");
  assert.ok(traeMeta?.models.some((m) => m.id === "auto"));

  const wsMeta = getRegistryProvider("windsurf");
  assert.ok(wsMeta);
  assert.ok(wsMeta?.models.length && wsMeta.models.length >= 70, "Windsurf should have 70+ models");
  assert.ok(wsMeta?.models.some((m) => m.id === "swe-1.6"));

  const cbMeta = getRegistryProvider("codebuddy-cn");
  assert.ok(cbMeta);
  assert.ok(cbMeta?.models.some((m) => m.id === "glm-5.3"));
});

test("providersSync - OAuth handlers are registered for all new/updated routes", () => {
  const handlers = [
    "trae",
    "zed",
    "windsurf",
    "codebuddy-cn",
    "grok",
    "qoder",
    "minimax",
    "iflow",
    "kimchi",
    "clinepass",
    "kilocode",
    "gitlab",
  ];

  for (const id of handlers) {
    const handler = OAuthHandlerRegistry.get(id);
    assert.ok(handler, `OAuthHandler for ${id} should be registered`);
  }
});

test("providersSync - Cline WorkOS JWT token prefixing", () => {
  assert.equal(getClineAccessToken("workos:abc123jwt"), "workos:abc123jwt");
  assert.equal(getClineAccessToken("eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.payload.sig"), "workos:eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.payload.sig");
  assert.equal(getClineAccessToken("clp_normal_api_key"), "clp_normal_api_key");
  assert.equal(getClineAccessToken(""), "");
});

test("providersSync - Codex tool schema regex sanitizer and input normalizer", () => {
  const schemaWithUnicode = {
    type: "object",
    properties: {
      fieldA: {
        type: "string",
        pattern: "^(?!__.*__$)[^\\p{Cc}\\p{Cf}\\p{Zl}\\p{Zp}\"\\\\./\\[\\]]{1,200}$",
      },
      fieldB: {
        type: "string",
        pattern: "^[a-zA-Z0-9_-]+$",
      },
    },
  };

  const sanitized = stripCodexUnsupportedPatterns(schemaWithUnicode);
  assert.equal(sanitized.properties.fieldA.pattern, undefined, "Unicode property escape pattern should be stripped");
  assert.equal(sanitized.properties.fieldB.pattern, "^[a-zA-Z0-9_-]+$", "Standard regex pattern should be preserved");

  const body = {
    messages: [
      { role: "system", content: "You are an assistant" },
      { role: "user", id: "msg_12345", content: "Hello" },
      { role: "assistant", id: "rs_67890", content: "Hi" },
    ],
  };

  convertSystemToDeveloperRole(body);
  assert.equal(body.messages[0].role, "developer", "System message role converted to developer");

  stripStoredItemReferences(body);
  assert.equal(body.messages[1].id, undefined, "Server item ID msg_* stripped");
  assert.equal(body.messages[2].id, undefined, "Server item ID rs_* stripped");
});

test("providersSync - Qoder COSY signing and body encoding", () => {
  const encoded = qoderEncodeBody("{\"query\":\"hello world\"}");
  assert.ok(encoded && encoded.length > 0);
  assert.notEqual(encoded, "{\"query\":\"hello world\"}");

  const headers = buildCosyHeaders(Buffer.from("test body"), "https://api3.qoder.sh/algo/api/v2/chat/completions", {
    userId: "usr_12345",
    authToken: "dt-token-abc",
  });

  assert.ok(headers["Cosy-Key"], "Must contain Cosy-Key");
  assert.ok(headers["Cosy-Info"], "Must contain Cosy-Info");
  assert.ok(headers["Cosy-Sign"], "Must contain Cosy-Sign");
  assert.equal(headers["Authorization"], "Bearer dt-token-abc");
});
