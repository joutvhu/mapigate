process.env.NODE_ENV = "test";

import test from "node:test";
import assert from "node:assert/strict";
import {
  stripModelEffortSuffix,
  resolveEffectiveEffort,
  resolveEffortForTarget,
  resolveVariantModelForEffort,
} from "../src/core/thinking/effortResolver.js";
import { resolveTargetModelAndProvider } from "../src/server/proxy/executorHelpers.js";
import { resolveModelDisplayName } from "../src/core/capabilities/modelDictionary.js";
import { extractModelsFromPayload } from "../src/core/scanner/payloadExtractor.js";
import { getSupportedEffortsForTarget } from "../src/core/thinking/effortResolver.js";
import { getCapabilitiesForModel } from "../src/core/capabilities/index.js";
import { CodexProvider } from "../src/providers/runtime/codex/provider.js";
import { ClaudeProvider } from "../src/providers/runtime/claude/provider.js";
import { OpenAiProvider } from "../src/providers/runtime/openai/provider.js";
import { GeminiProvider } from "../src/providers/runtime/gemini/provider.js";
import { AntigravityProvider } from "../src/providers/runtime/antigravity/provider.js";
import { executeAntigravity } from "../src/providers/runtime/antigravity/executor.js";
import type { ProviderRequestContext } from "../src/providers/core/types.js";

function makeCtx(overrides: Partial<ProviderRequestContext> = {}): ProviderRequestContext {
  return {
    requestId: "req_effort_test",
    startTime: Date.now(),
    clientFormat: "openai",
    targetFormat: "openai",
    targetModel: "gpt-6.2-sol",
    rawModel: "gpt-6.2-sol",
    body: { messages: [{ role: "user", content: "hi" }], stream: true },
    req: { headers: {}, path: "/v1/chat/completions", method: "POST" } as any,
    clientTool: "codex",
    rtkStats: { compressedTokens: 0, tokensSaved: 0 },
    ...overrides,
  };
}

test("stripModelEffortSuffix strips arbitrary effort tags and preserves [1m] in either order", () => {
  assert.deepEqual(stripModelEffortSuffix("gpt-6.2-sol(ultra)"), { model: "gpt-6.2-sol", effort: "ultra" });
  assert.deepEqual(stripModelEffortSuffix("codex/gpt-6.2-sol(ultra)[1m]"), { model: "codex/gpt-6.2-sol[1m]", effort: "ultra" });
  assert.deepEqual(stripModelEffortSuffix("codex/gpt-6.2-sol[1m](max)"), { model: "codex/gpt-6.2-sol[1m]", effort: "max" });
  assert.deepEqual(stripModelEffortSuffix("custom/model(deep_think)"), { model: "custom/model", effort: "deep_think" });
  assert.deepEqual(stripModelEffortSuffix("claude-3-5-sonnet(20241022)"), { model: "claude-3-5-sonnet(20241022)" });
});

test("resolveTargetModelAndProvider extracts clean targetModel and targetEffort for LoadBalancer/Pricing compatibility", () => {
  const res = resolveTargetModelAndProvider("codex/gpt-6.2-sol(ultra)");
  assert.equal(res.providerId, "codex");
  assert.equal(res.targetModel, "gpt-6.2-sol");
  assert.equal(res.targetEffort, "ultra");

  const tagged = resolveTargetModelAndProvider("claude[pro]/claude-opus-5-5(max)[1m]");
  assert.equal(tagged.providerId, "claude");
  assert.equal(tagged.targetTag, "pro");
  assert.equal(tagged.targetModel, "claude-opus-5-5");
  assert.equal(tagged.targetEffort, "max");
  assert.equal(tagged.is1mContext, true);
});

test("resolveEffectiveEffort respects priority: fixedVariant > targetEffort > clientEffort > providerThinkingMode", () => {
  assert.equal(
    resolveEffectiveEffort({
      targetEffort: "ultra",
      body: { reasoning_effort: "low" },
      providerThinkingMode: "medium",
    }),
    "ultra"
  );
  assert.equal(
    resolveEffectiveEffort({
      body: { reasoning: { effort: "xhigh" } },
      providerThinkingMode: "low",
    }),
    "xhigh"
  );
  assert.equal(
    resolveEffectiveEffort({
      body: {},
      providerThinkingMode: "high",
    }),
    "high"
  );
  assert.equal(
    resolveEffectiveEffort({
      body: { reasoning_effort: "low" },
      providerThinkingMode: "high",
      hasFixedVariant: true,
    }),
    undefined
  );
});

test("resolveEffortForTarget supports model/provider-driven sets and fail-open passthrough", () => {
  // Custom unconstrained provider passes through arbitrary effort string
  assert.equal(resolveEffortForTarget("deep-think", undefined, { reasoning: true }), "deep-think");

  // Non-reasoning model strips effort to null
  assert.equal(resolveEffortForTarget("ultra", undefined, { reasoning: false }), null);

  // Model with max ceiling clamps ultra -> max
  assert.equal(
    resolveEffortForTarget("ultra", ["low", "medium", "high", "xhigh", "max"], { reasoning: true }),
    "max"
  );

  // Disable request on non-disableable model returns null
  assert.equal(
    resolveEffortForTarget("none", ["low", "medium", "high"], { reasoning: true, thinkingCanDisable: false }),
    null
  );
});

test("Provider transformers handle Codex ultra/max, Claude output_config, OpenAI non-reasoning strip, and Gemini clamping", () => {
  const codex = new CodexProvider();
  const codexUltra = codex.transformRequestBody(
    makeCtx({
      targetModel: "gpt-6.2-sol",
      targetEffort: "ultra",
      provider: { id: "codex", name: "Codex", baseUrl: "", format: "openai-responses", thinkingMode: "auto" } as any,
    })
  );
  assert.equal(codexUltra.model, "gpt-6.2-sol");
  assert.deepEqual(codexUltra.reasoning, { effort: "ultra", summary: "auto" });

  // Model capped at max (gpt-reserve) clamps ultra -> max
  const codexReserve = codex.transformRequestBody(
    makeCtx({
      targetModel: "gpt-reserve",
      body: { messages: [{ role: "user", content: "hi" }], reasoning_effort: "ultra" },
      provider: { id: "codex", name: "Codex", baseUrl: "", format: "openai-responses", thinkingMode: "auto" } as any,
    })
  );
  assert.deepEqual(codexReserve.reasoning, { effort: "max", summary: "auto" });

  // Claude adaptive maps ultra -> max
  const claude = new ClaudeProvider();
  const claudeOut = claude.transformRequestBody(
    makeCtx({
      targetModel: "claude-opus-4-8",
      body: { messages: [{ role: "user", content: "hi" }], reasoning_effort: "ultra" },
      provider: { id: "claude", name: "Claude", baseUrl: "", format: "claude", thinkingMode: "auto" } as any,
    })
  );
  assert.deepEqual(claudeOut.output_config, { effort: "max" });
  assert.equal("reasoning_effort" in claudeOut, false);

  // Claude 3.7 budget-only must NOT receive output_config.effort
  const claude37 = claude.transformRequestBody(
    makeCtx({
      targetModel: "claude-3-7-sonnet",
      body: { messages: [{ role: "user", content: "hi" }], reasoning_effort: "ultra" },
      provider: { id: "claude", name: "Claude", baseUrl: "", format: "claude", thinkingMode: "auto" } as any,
    })
  );
  assert.equal(claude37.output_config, undefined);

  // OpenAI non-reasoning model (gpt-4o) strips reasoning_effort
  const openai = new OpenAiProvider();
  const gpt4oOut = openai.transformRequestBody(
    makeCtx({
      targetModel: "gpt-4o",
      body: { messages: [{ role: "user", content: "hi" }], reasoning_effort: "ultra" },
      provider: { id: "openai", name: "OpenAI", baseUrl: "", format: "openai", thinkingMode: "auto" } as any,
    })
  );
  assert.equal("reasoning_effort" in gpt4oOut, false);

  // Gemini clamps ultra -> high
  const gemini = new GeminiProvider();
  const geminiOut = gemini.transformRequestBody(
    makeCtx({
      targetModel: "gemini-4-neon",
      body: { messages: [{ role: "user", content: "hi" }], reasoning_effort: "ultra" },
      provider: { id: "gemini", name: "Gemini", baseUrl: "", format: "openai", thinkingMode: "auto" } as any,
    })
  );
  assert.equal(geminiOut.reasoning_effort, "high");
});

test("resolveVariantModelForEffort dynamically matches Antigravity variant suffixes and preserves fixed variants", () => {
  const agModels = [
    "gemini-4-neon-disabled",
    "gemini-4-neon-low",
    "gemini-4-neon-medium",
    "gemini-4-neon-high",
    "gemini-4-neon-xhigh",
    "claude-opus-5-5-low",
    "claude-opus-5-5-medium",
    "claude-opus-5-5-high",
    "claude-opus-5-5-max",
    "claude-opus-4-6-thinking",
  ];

  assert.equal(resolveVariantModelForEffort("gemini-4-neon", "ultra", agModels).model, "gemini-4-neon-xhigh");
  assert.equal(resolveVariantModelForEffort("gemini-4-neon", "none", agModels).model, "gemini-4-neon-disabled");
  assert.equal(resolveVariantModelForEffort("claude-opus-5-5", "ultra", agModels).model, "claude-opus-5-5-max");

  // Fixed variant stays pinned
  const pinned = resolveVariantModelForEffort("gemini-4-neon-low", "ultra", agModels);
  assert.equal(pinned.model, "gemini-4-neon-low");
  assert.equal(pinned.isFixedVariant, true);

  // -thinking fixed variant stays pinned
  const thinkingPinned = resolveVariantModelForEffort("claude-opus-4-6-thinking", "low", agModels);
  assert.equal(thinkingPinned.model, "claude-opus-4-6-thinking");
  assert.equal(thinkingPinned.isFixedVariant, true);
});

test("executeAntigravity dynamically routes base model + effort to scanned Antigravity variant", async () => {
  const origFetch = globalThis.fetch;
  let capturedEnvelope: any = null;

  globalThis.fetch = (async (_url: any, init: any) => {
    capturedEnvelope = JSON.parse(String(init?.body || "{}"));
    return new Response(
      JSON.stringify({
        response: {
          candidates: [{ content: { parts: [{ text: "ok" }] }, finishReason: "STOP" }],
          usageMetadata: { promptTokenCount: 5, candidatesTokenCount: 2 },
        },
      }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  }) as typeof fetch;

  try {
    const provider = new AntigravityProvider();
    const mockRes: any = {
      headersSent: false,
      writableEnded: false,
      setHeader() {},
      flushHeaders() {},
      status() { return mockRes; },
      json() { return mockRes; },
      write() { return true; },
      end() { mockRes.writableEnded = true; },
    };
    const res = await executeAntigravity(
      makeCtx({
        targetModel: "gemini-4-neon",
        res: mockRes,
        isPanel: true,
        body: { messages: [{ role: "user", content: "hi" }], reasoning_effort: "ultra", stream: false },
        provider: {
          id: "antigravity",
          name: "Antigravity",
          baseUrl: "https://daily-cloudcode-pa.googleapis.com",
          format: "antigravity",
          thinkingMode: "auto",
          models: ["gemini-4-neon-low", "gemini-4-neon-medium", "gemini-4-neon-high", "gemini-4-neon-xhigh"],
        } as any,
        account: {
          id: "acc_ag_test",
          name: "ag@test.com",
          rawApiKey: JSON.stringify({ accessToken: "tok", expiresAt: Date.now() + 3600_000 }),
          providerSpecificData: { projectId: "proj_1" },
        } as any,
      }),
      provider
    );
    assert.equal(res.ok, true);
    assert.equal(capturedEnvelope?.model, "gemini-4-neon-xhigh");
  } finally {
    globalThis.fetch = origFetch;
  }
});

test("modelDictionary and payloadExtractor handle ultra/max/disabled display tags and supported_reasoning_levels", () => {
  assert.equal(resolveModelDisplayName("gpt-6.2-sol(ultra)"), "GPT-6.2 Sol (Ultra)");
  assert.equal(resolveModelDisplayName("gemini-4-neon-disabled"), "Gemini 4 Neon (Disabled)");
  assert.equal(resolveModelDisplayName("claude-opus-5-5-max"), "Claude Opus 5.5 (Max)");

  const scanned = extractModelsFromPayload(
    {
      models: [
        {
          slug: "gpt-6.2-sol",
          display_name: "GPT-6.2-Sol",
          supported_reasoning_levels: [{ effort: "low" }, { effort: "high" }, { effort: "ultra" }],
        },
      ],
    },
    "codex"
  );
  assert.deepEqual(scanned[0]?.supportedEfforts, ["low", "high", "ultra"]);

  const codexCaps = getCapabilitiesForModel("codex", "gpt-6.2-sol");
  assert.deepEqual(
    getSupportedEffortsForTarget("codex", "gpt-6.2-sol", codexCaps),
    ["low", "medium", "high", "xhigh", "max", "ultra"]
  );
  const gpt4oCaps = getCapabilitiesForModel("openai", "gpt-4o");
  assert.equal(gpt4oCaps.reasoning, false);
});
