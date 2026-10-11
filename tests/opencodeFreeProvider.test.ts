import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import app from "../src/server/index.js";
import { getRegistryProvider } from "../src/shared/constants/providerRegistry.js";
import { ProviderRepository } from "../src/storage/repositories/providerRepo.js";
import { LoadBalancer } from "../src/core/router/loadBalancer.js";
import {
  generateSessionId,
  getStableSessionId,
  applyFingerprintTools,
  restoreToolNames,
  buildOpenCodeUrl,
  buildOpenCodeHeaders,
  OPENCODE_SESSION_RE,
  OPENCODE_REQUEST_RE,
  OPENCODE_FINGERPRINT_TOOLS,
} from "../src/core/adapters/openCodeAdapter.js";

test("OpenCode Free Provider - Registry Configuration and Aliases", () => {
  const byId = getRegistryProvider("opencode");
  assert.ok(byId, "Provider 'opencode' must exist in registry");
  assert.equal(byId.id, "opencode");
  assert.equal(byId.alias, "oc");
  assert.equal(byId.name, "OpenCode Free");
  assert.equal(byId.category, "free");
  assert.equal(byId.noAuth, true);
  assert.equal(byId.baseUrl, "https://opencode.ai");

  const byAlias = getRegistryProvider("oc");
  assert.ok(byAlias, "Provider 'oc' must resolve to registry item");
  assert.equal(byAlias.id, "opencode");

  const hasUnionAlpha = byId.models.some((m) => m.id === "union-alpha");
  const hasMuseSpark = byId.models.some((m) => m.id === "muse-spark-1.3-contributor-free");
  assert.ok(hasUnionAlpha, "Must include union-alpha in curated models");
  assert.ok(hasMuseSpark, "Must include muse-spark-1.3-contributor-free in curated models");
});

test("OpenCode Free Provider - Zero-Auth Virtual Account Resolution", () => {
  // 1. Storage repository returns synthetic account without requiring DB insertion
  const accounts = ProviderRepository.getAccountsByProvider("opencode");
  assert.ok(accounts.length >= 1, "Must return at least 1 account for opencode");
  assert.equal(accounts[0].rawApiKey, "public");
  assert.equal(accounts[0].isActive, true);

  // 2. LoadBalancer resolves virtual account seamlessly
  const picked = LoadBalancer.pickAccount("opencode");
  assert.ok(picked, "LoadBalancer must pick account for zero-auth provider");
  assert.equal(picked.rawApiKey, "public");
  assert.equal(picked.isActive, true);

  // Also via alias "oc"
  const pickedAlias = LoadBalancer.pickAccount("oc");
  assert.ok(pickedAlias, "LoadBalancer must pick account for alias 'oc'");
  assert.equal(pickedAlias.rawApiKey, "public");
});

test("OpenCode Free Provider - Session Fingerprinting and Tool Cloaking", () => {
  const session = generateSessionId();
  assert.match(session, OPENCODE_SESSION_RE);

  const stable1 = getStableSessionId("test-agent");
  const stable2 = getStableSessionId("test-agent");
  assert.equal(stable1, stable2, "Stable session must be cached per identity");

  // Tool quartet cloaking
  const reqBody: any = {
    tools: [
      {
        type: "function",
        function: { name: "Bash", description: "Execute bash command", parameters: { type: "object", properties: {} } },
      },
    ],
  };

  const map = applyFingerprintTools(reqBody, false);
  assert.equal(map.get("bash"), "Bash");

  // All 4 fingerprint tools must now be present
  const toolNames = reqBody.tools.map((t: any) => t.function?.name);
  for (const name of OPENCODE_FINGERPRINT_TOOLS) {
    assert.ok(toolNames.includes(name), `Fingerprint tool ${name} must be present`);
  }

  // Response restoration
  const streamChunk = {
    choices: [
      {
        delta: {
          tool_calls: [
            {
              id: "call_1",
              type: "function",
              function: { name: "bash", arguments: '{"command":"git status"}' },
            },
          ],
        },
      },
    ],
  };

  restoreToolNames(streamChunk, map);
  assert.equal(streamChunk.choices[0].delta.tool_calls[0].function.name, "Bash");
});

test("OpenCode Free Provider - URL and Headers Contract", () => {
  assert.equal(buildOpenCodeUrl("union-alpha"), "https://opencode.ai/zen/v1/messages");
  assert.equal(buildOpenCodeUrl("muse-spark-1.3-contributor-free"), "https://opencode.ai/zen/v1/responses");
  assert.equal(buildOpenCodeUrl("jev-1.13-free"), "https://opencode.ai/zen/v1/chat/completions");

  const headers = buildOpenCodeHeaders({}, "ses_1234567890ab1234567890abcd", "msg_1234567890ab1234567890abcd", "https://opencode.ai/zen/v1/messages");
  assert.equal(headers["Authorization"], "Bearer public");
  assert.equal(headers["User-Agent"], "opencode/1.18.31");
  assert.equal(headers["x-opencode-client"], "desktop");
  assert.equal(headers["x-opencode-project"], "global");
  assert.equal(headers["anthropic-version"], "2023-06-01");
});

test("OpenCode Free Provider - Endpoints & HTTP Integration", async () => {
  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", () => resolve()));
  const address = server.address() as { port: number };
  const baseUrl = `http://127.0.0.1:${address.port}`;

  try {
    // 1. POST /api/providers/validate passes for opencode without API key
    const valRes = await fetch(`${baseUrl}/api/providers/validate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ provider: "opencode" }),
    });
    assert.equal(valRes.status, 200);
    const valData = await valRes.json();
    assert.equal(valData.valid, true);

    // Also alias "oc"
    const valAliasRes = await fetch(`${baseUrl}/api/providers/validate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ provider: "oc" }),
    });
    assert.equal(valAliasRes.status, 200);
    const valAliasData = await valAliasRes.json();
    assert.equal(valAliasData.valid, true);

    // 2. GET /api/models/available?connectedOnly=true includes OpenCode Free models
    const availRes = await fetch(`${baseUrl}/api/models/available?connectedOnly=true`);
    assert.equal(availRes.status, 200);
    const availableModels = (await availRes.json()) as any[];

    const opencodeModels = availableModels.filter(
      (m) => m.providerId === "opencode" || m.providerId === "oc"
    );
    assert.ok(opencodeModels.length > 0, "OpenCode models must be included under connectedOnly=true");
    for (const m of opencodeModels) {
      assert.equal(m.hasConnectedAccount, true);
      assert.ok(m.accountsCount >= 1);
    }
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});
