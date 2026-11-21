process.env.NODE_ENV = "test";

import test from "node:test";
import assert from "node:assert/strict";
import { PROVIDER_REGISTRY, getRegistryProvider } from "../src/shared/constants/providerRegistry.js";
import {
  matchesWildcard,
  isFreeTierProvider,
  resolveFreeModels,
  getProviderConnectionStatus,
} from "../src/web/src/utils/freeTierHelper.js";
import { ComboRepository } from "../src/storage/repositories/comboRepo.js";

test("FreeTier - Provider metadata schema extension is populated correctly", () => {
  // 1. Google Gemini AI Studio
  const gemini = getRegistryProvider("gemini");
  assert.ok(gemini, "gemini must exist in registry");
  assert.ok(gemini.freeTier, "gemini must have freeTier config");
  assert.equal(gemini.freeTier.scope, "all");
  assert.equal(gemini.freeTier.limitType, "per-model");
  assert.ok(gemini.freeTier.note?.includes("15 RPM"), "gemini note must mention RPM");

  // 2. OpenRouter (models scope with *:free match)
  const openrouter = getRegistryProvider("openrouter");
  assert.ok(openrouter, "openrouter must exist in registry");
  assert.ok(openrouter.freeTier, "openrouter must have freeTier config");
  assert.equal(openrouter.freeTier.scope, "models");
  assert.deepEqual(openrouter.freeTier.match, ["*:free"]);
  assert.equal(openrouter.freeTier.limitType, "requests");

  // 3. OpenCode Zen
  const opencodeZen = getRegistryProvider("opencode-zen");
  assert.ok(opencodeZen, "opencode-zen must exist in registry");
  assert.ok(opencodeZen.freeTier, "opencode-zen must have freeTier config");
  assert.equal(opencodeZen.freeTier.scope, "models");

  // 4. Kilo Gateway
  const kilo = getRegistryProvider("kilo-gateway");
  assert.ok(kilo, "kilo-gateway must exist in registry");
  assert.ok(kilo.freeTier, "kilo-gateway must have freeTier config");
  assert.equal(kilo.freeTier.scope, "models");
  assert.ok(Array.isArray(kilo.freeTier.models) && kilo.freeTier.models.length > 0);
  assert.ok(kilo.freeTier.models.some((m) => m.id === "kilo-auto/free"));

  // 5. NVIDIA NIM
  const nvidia = getRegistryProvider("nvidia");
  assert.ok(nvidia, "nvidia must exist in registry");
  assert.ok(nvidia.freeTier, "nvidia must have freeTier config");
  assert.equal(nvidia.freeTier.limitType, "credits");

  // 6. Coarena, Iteracompute, Onomeo, Sail
  const coarena = getRegistryProvider("coarena");
  assert.ok(coarena?.freeTier, "coarena must have freeTier");
  assert.equal(coarena.freeTier.limitType, "credits");
  assert.equal(coarena.freeTier.scope, "models");
  assert.deepEqual(
    coarena.freeTier.models?.map((m) => m.id),
    ["gpt-6-luna", "gemini-3-8-flash", "deepseek-v4-1-flash-1017"]
  );

  const itera = getRegistryProvider("iteracompute");
  assert.ok(itera?.freeTier, "iteracompute must have freeTier");
  assert.equal(itera.freeTier.limitType, "requests");

  const onomeo = getRegistryProvider("onomeo");
  assert.ok(onomeo?.freeTier, "onomeo must have freeTier");
  assert.equal(onomeo.freeTier.limitType, "requests");

  const sail = getRegistryProvider("sail");
  assert.ok(sail?.freeTier, "sail must have freeTier");
  assert.equal(sail.freeTier.limitType, "credits");

  // 7. Groq, Cerebras, SambaNova, Mistral
  const groq = getRegistryProvider("groq");
  assert.ok(groq?.freeTier, "groq must have freeTier");
  assert.equal(groq.freeTier.limitType, "per-model");
  assert.equal(groq.freeTier.scope, "all");

  const cerebras = getRegistryProvider("cerebras");
  assert.ok(cerebras?.freeTier, "cerebras must have freeTier");
  assert.equal(cerebras.freeTier.limitType, "requests");

  const sambanova = getRegistryProvider("sambanova");
  assert.ok(sambanova?.freeTier, "sambanova must have freeTier");
  assert.equal(sambanova.freeTier.limitType, "requests");

  const mistral = getRegistryProvider("mistral");
  assert.ok(mistral?.freeTier, "mistral must have freeTier");
  assert.equal(mistral.freeTier.scope, "models");
  assert.ok(mistral.freeTier.models?.some((m) => m.id === "codestral-latest"));

  // 8. Local engines
  const jan = getRegistryProvider("jan");
  assert.ok(jan?.freeTier, "jan must have freeTier");
  assert.equal(jan.freeTier.limitType, "local");

  const lmStudio = getRegistryProvider("lm-studio");
  assert.ok(lmStudio?.freeTier, "lm-studio must have freeTier");
  assert.equal(lmStudio.freeTier.limitType, "local");

  const ollamaLocal = getRegistryProvider("ollama-local");
  assert.ok(ollamaLocal?.freeTier, "ollama-local must have freeTier");
  assert.equal(ollamaLocal.freeTier.limitType, "local");
});

test("FreeTier - Wildcard matcher handles patterns correctly", () => {
  assert.equal(matchesWildcard("*:free", "nvidia/nemotron-3-super-120b-a12b:free"), true);
  assert.equal(matchesWildcard("*:free", "meta-llama/llama-3.3-70b-instruct"), false);
  assert.equal(matchesWildcard("*-free", "muse-spark-1.2-contributor-free"), true);
  assert.equal(matchesWildcard("*/free", "kilo-auto/free"), true);
  assert.equal(matchesWildcard("*contributor-free*", "deepseek-v4-contributor-free-exp"), true);
  assert.equal(matchesWildcard("exact-model", "exact-model"), true);
  assert.equal(matchesWildcard("exact-model", "other-model"), false);
});

test("FreeTier - Free model resolution respects scope and model granularity", () => {
  // Provider with scope 'models'
  const kilo = getRegistryProvider("kilo-gateway")!;
  const kiloFree = resolveFreeModels(kilo);
  assert.ok(kiloFree.length > 0, "kilo-gateway must have resolved free models");
  for (const m of kiloFree) {
    assert.ok(
      m.id.includes("free") || m.id.endsWith(":free") || m.id.endsWith("/free"),
      `Model ${m.id} must be free`
    );
    assert.ok(m.comboModelValue.startsWith("kilo-gateway/"));
  }

  // Provider with scope 'all'
  const gemini = getRegistryProvider("gemini")!;
  const geminiFree = resolveFreeModels(gemini);
  assert.ok(geminiFree.length > 0, "gemini must have resolved free models");
  for (const m of geminiFree) {
    assert.ok(m.comboModelValue.startsWith("gemini/"));
    assert.ok(m.limit?.includes("15 RPM"), "limit note should be attached");
  }
});

test("FreeTier - Connection status calculation", () => {
  const gemini = getRegistryProvider("gemini")!;

  // 1. Without accounts -> not_connected
  const disconnected = getProviderConnectionStatus(gemini, { accounts: [], accountsCount: 0 });
  assert.equal(disconnected.status, "not_connected");

  // 2. With active accounts -> connected
  const connected = getProviderConnectionStatus(gemini, {
    accounts: [{ isActive: true, rateLimitHits: 0 }],
    accountsCount: 1,
  });
  assert.equal(connected.status, "connected");

  // 3. Local engine -> connected without accounts
  const jan = getRegistryProvider("jan")!;
  const janStatus = getProviderConnectionStatus(jan, { accounts: [], accountsCount: 0 });
  assert.equal(janStatus.status, "connected");
  assert.equal(janStatus.label, "Local Engine");

  // 4. Test result success
  const testSuccess = getProviderConnectionStatus(gemini, undefined, {
    success: true,
    latencyMs: 42,
  });
  assert.equal(testSuccess.status, "connected");
  assert.equal(testSuccess.detail, "42ms");

  // 5. Test result quota exhausted
  const testExhausted = getProviderConnectionStatus(gemini, undefined, {
    success: false,
    error: "429 Rate limit exceeded / Quota exhausted",
  });
  assert.equal(testExhausted.status, "exhausted");
  assert.equal(testExhausted.label, "Quota Exhausted");
});

test("FreeTier - Combo creation and persistence", () => {
  const testName = `test-free-combo-${Date.now()}`;
  const models = [
    "gemini/gemini-2.5-flash",
    "kilo-gateway/kilo-auto/free",
    "opencode/deepseek-v4.1-flash-free",
  ];

  const saved = ComboRepository.saveCombo({
    name: testName,
    models,
    strategy: "fallback",
    isActive: true,
  });

  assert.equal(saved.name, testName);
  assert.equal(saved.strategy, "fallback");
  assert.deepEqual(saved.models, models);
  assert.equal(saved.isActive, true);

  const retrieved = ComboRepository.getComboByName(testName);
  assert.ok(retrieved, "Saved combo should be retrievable by name");
  assert.deepEqual(retrieved.models, models);

  // Clean up test combo
  ComboRepository.deleteCombo(saved.id);
  assert.equal(ComboRepository.getComboByName(testName), undefined);
});
