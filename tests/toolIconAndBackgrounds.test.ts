import test from "node:test";
import assert from "node:assert/strict";

import { getRegistryProvider, PROVIDER_REGISTRY } from "../src/providers/metadataRegistry.js";
import { CLI_TOOLS, CLI_TOOLS_ARRAY } from "../src/cli/tools/index.js";
import { MITM_TOOLS } from "../src/mitm/config.js";
import {
  OAUTH_PROVIDERS_LIST,
  FREE_TIER_PROVIDERS_LIST,
  API_KEY_PROVIDERS_LIST,
  CLI_TOOLS_LIST,
} from "../src/web/src/constants/providersData.js";
import { isLightColor } from "../src/web/src/components/ui/ToolIcon.js";

test("Tool icon background configurations in Provider registry", () => {
  const targetProviders = [
    "ollama",
    "ollama-local",
    "ollama-search",
    "baseten",
    "black-forest-labs",
    "github",
    "cursor",
    "commandcode",
    "featherless",
    "jina-reader",
    "reka",
    "runwayml",
    "v0-vercel",
    "vercel-ai-gateway",
    "writer",
  ];

  for (const pId of targetProviders) {
    const prov = getRegistryProvider(pId);
    assert.ok(prov, `Provider '${pId}' should exist in registry`);
    assert.equal(
      prov.iconBg,
      "#FFFFFF",
      `Provider '${pId}' must have iconBg set to '#FFFFFF'`
    );
  }
});

test("CLI tool definitions have iconBg properly set", () => {
  assert.ok(CLI_TOOLS["cursor"], "Cursor CLI tool must exist");
  assert.equal(CLI_TOOLS["cursor"].iconBg, "#FFFFFF");

  assert.ok(CLI_TOOLS["copilot"], "Copilot CLI tool must exist");
  assert.equal(CLI_TOOLS["copilot"].iconBg, "#FFFFFF");

  const cursorInArray = CLI_TOOLS_ARRAY.find((t) => t.id === "cursor");
  assert.equal(cursorInArray?.iconBg, "#FFFFFF");

  const copilotInArray = CLI_TOOLS_ARRAY.find((t) => t.id === "copilot");
  assert.equal(copilotInArray?.iconBg, "#FFFFFF");
});

test("MITM tool configurations have iconBg properly set", () => {
  const cursorMitm = MITM_TOOLS.find((t) => t.id === "cursor");
  assert.ok(cursorMitm, "Cursor MITM config must exist");
  assert.equal(cursorMitm.iconBg, "#FFFFFF");

  const copilotMitm = MITM_TOOLS.find((t) => t.id === "copilot");
  assert.ok(copilotMitm, "Copilot MITM config must exist");
  assert.equal(copilotMitm.iconBg, "#FFFFFF");
});

test("Web providersData propagates iconBg for providers and CLI tools", () => {
  const ghOauth = OAUTH_PROVIDERS_LIST.find((p) => p.id === "github");
  assert.ok(ghOauth, "GitHub Copilot should be in OAuth list");
  assert.equal(ghOauth.iconBg, "#FFFFFF");

  const ollamaFree = FREE_TIER_PROVIDERS_LIST.find((p) => p.id === "ollama");
  assert.ok(ollamaFree, "Ollama Cloud should be in Free Tier list");
  assert.equal(ollamaFree.iconBg, "#FFFFFF");

  const basetenApiKey = API_KEY_PROVIDERS_LIST.find((p) => p.id === "baseten");
  assert.ok(basetenApiKey, "Baseten should be in API key list");
  assert.equal(basetenApiKey.iconBg, "#FFFFFF");

  const cursorCli = CLI_TOOLS_LIST.find((t) => t.id === "cursor");
  assert.ok(cursorCli, "Cursor should be in CLI_TOOLS_LIST");
  assert.equal(cursorCli.iconBg, "#FFFFFF");

  const copilotCli = CLI_TOOLS_LIST.find((t) => t.id === "copilot");
  assert.ok(copilotCli, "Copilot should be in CLI_TOOLS_LIST");
  assert.equal(copilotCli.iconBg, "#FFFFFF");
});

test("isLightColor correctly evaluates 6-digit hex, 3-digit shorthand, and translucent alpha tints", () => {
  // 6-digit opaque colors
  assert.equal(isLightColor("#FFFFFF"), true, "#FFFFFF should be light");
  assert.equal(isLightColor("#ffffff"), true, "#ffffff should be light");
  assert.equal(isLightColor("#000000"), false, "#000000 should be dark");
  assert.equal(isLightColor("#0D1322"), false, "#0D1322 should be dark");
  assert.equal(isLightColor("#333333"), false, "#333333 should be dark");

  // 3-digit shorthand
  assert.equal(isLightColor("#FFF"), true, "#FFF should be light");
  assert.equal(isLightColor("#fff"), true, "#fff should be light");
  assert.equal(isLightColor("#000"), false, "#000 should be dark");

  // Translucent tints (alpha channel < 0.5)
  assert.equal(isLightColor("#ffffff18"), false, "#ffffff18 (translucent tint) must not be light");
  assert.equal(isLightColor("#FFF8"), false, "#FFF8 (translucent tint shorthand) must not be light");

  // Empty / undefined / falsy
  assert.equal(isLightColor(undefined), false);
  assert.equal(isLightColor(""), false);
});

