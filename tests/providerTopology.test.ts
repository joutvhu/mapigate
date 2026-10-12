import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { getProviderMeta } from "../src/web/src/components/usage/providerTopologyHelper.js";

test("providerTopology - extracts metadata from getRegistryProvider", () => {
  const claude = getProviderMeta("claude");
  assert.equal(claude.id, "claude");
  assert.equal(claude.name, "Claude Code");
  assert.ok(claude.color, "claude should have a color");
  assert.ok(claude.image, "claude should have an image icon");

  const openai = getProviderMeta("openai");
  assert.equal(openai.id, "openai");
  assert.equal(openai.name, "OpenAI");
  assert.ok(openai.color, "openai should have a color");
  assert.ok(openai.image, "openai should have an image");

  const deepseek = getProviderMeta("deepseek");
  assert.equal(deepseek.id, "deepseek");
  assert.equal(deepseek.name, "DeepSeek");
  assert.ok(deepseek.color, "deepseek should have a color");
  assert.ok(deepseek.image, "deepseek should have an image");
});

test("providerTopology - resolves aliases (github-copilot and copilot to github)", () => {
  const copilot = getProviderMeta("copilot");
  assert.equal(copilot.id, "github");
  assert.equal(copilot.name, "GitHub Copilot");
  assert.equal(copilot.iconBg, "#FFFFFF");
  assert.ok(copilot.image, "copilot should resolve to github image");

  const ghCopilot = getProviderMeta("github-copilot");
  assert.equal(ghCopilot.id, "github");
  assert.equal(ghCopilot.name, "GitHub Copilot");
  assert.equal(ghCopilot.iconBg, "#FFFFFF");
  assert.ok(ghCopilot.image, "github-copilot should resolve to github image");

  const github = getProviderMeta("github");
  assert.equal(github.id, "github");
  assert.equal(github.name, "GitHub Copilot");
  assert.equal(github.iconBg, "#FFFFFF");
});

test("providerTopology - resolves anthropic and handles casing", () => {
  const anthropic = getProviderMeta("anthropic");
  assert.equal(anthropic.id, "anthropic");
  assert.equal(anthropic.name, "Anthropic");
  assert.ok(anthropic.image, "anthropic should have an image");

  const upperAnthropic = getProviderMeta("ANTHROPIC");
  assert.equal(upperAnthropic.id, "anthropic");
  assert.equal(upperAnthropic.name, "Anthropic");
});

test("providerTopology - safe fallbacks for unlisted/custom providers and empty input", () => {
  const custom = getProviderMeta("my-custom-llm");
  assert.equal(custom.id, "my-custom-llm");
  assert.equal(custom.name, "My-custom-llm");
  assert.equal(custom.color, "#64748B");
  assert.equal(custom.image, undefined);

  const empty = getProviderMeta("");
  assert.equal(empty.id, "unknown");
  assert.equal(empty.name, "Unknown");
  assert.equal(empty.color, "#64748B");
});

test("providerTopology - verifies Mapigate favicon.svg asset exists on disk", () => {
  const faviconPath = path.resolve(process.cwd(), "src/web/public/favicon.svg");
  assert.ok(fs.existsSync(faviconPath), "src/web/public/favicon.svg must exist");
  const stat = fs.statSync(faviconPath);
  assert.ok(stat.size > 0, "favicon.svg must be non-empty");
  const content = fs.readFileSync(faviconPath, "utf-8");
  assert.ok(content.includes("<svg"), "favicon.svg must contain valid SVG markup");
});
