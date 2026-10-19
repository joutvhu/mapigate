import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_KIRO_MAPPINGS,
  MitmRepository,
  getDefaultMappings,
} from "../src/storage/repositories/mitmRepo.js";
import { normalizeModelSlug } from "../src/mitm/toolsHelper.js";
import { resolveModelMapping } from "../src/mitm/server.js";
import { getDatabase } from "../src/storage/database.js";

describe("Kiro Model Mapping & Slug Normalization", () => {
  beforeEach(() => {
    const db = getDatabase();
    db.run("DELETE FROM mitm_mappings WHERE ide = 'kiro'");
  });

  it("defines standard kebab-case wire format models for Kiro defaults", () => {
    const kiroDefaults = getDefaultMappings("kiro");
    const expectedModels = [
      "claude-sonnet-4.5",
      "claude-sonnet-4",
      "claude-haiku-4.5",
      "claude-sonnet-5",
      "deepseek-3.2",
      "minimax-m2.5",
      "minimax-m2.1",
      "glm-5",
      "auto",
      "simple-task",
      "gpt-5.6-sol",
      "gpt-5.6-terra",
      "gpt-5.6-luna",
      "qwen3-coder-next",
    ];

    assert.equal(kiroDefaults.length, expectedModels.length);
    for (let i = 0; i < expectedModels.length; i++) {
      assert.equal(kiroDefaults[i].sourceModel, expectedModels[i]);
      assert.equal(kiroDefaults[i].targetModel, "");
      assert.equal(kiroDefaults[i].ide, "kiro");
    }
  });

  it("normalizes model slugs correctly across different formats", () => {
    assert.equal(normalizeModelSlug("Claude Sonnet 4.5"), "claude-sonnet-4.5");
    assert.equal(normalizeModelSlug("claude-sonnet-4.5"), "claude-sonnet-4.5");
    assert.equal(normalizeModelSlug("models/claude-sonnet-4.5"), "claude-sonnet-4.5");
    assert.equal(normalizeModelSlug("models/Claude Sonnet 4.5"), "claude-sonnet-4.5");
    assert.equal(normalizeModelSlug("Auto (Kiro Agent)"), "auto-(kiro-agent)");
    assert.equal(normalizeModelSlug("GPT 5.6 Sol"), "gpt-5.6-sol");
    assert.equal(normalizeModelSlug("DeepSeek 3.2"), "deepseek-3.2");
    assert.equal(normalizeModelSlug("MiniMax M2.5"), "minimax-m2.5");
    assert.equal(normalizeModelSlug(""), "");
    assert.equal(normalizeModelSlug(null), "");
    assert.equal(normalizeModelSlug(undefined), "");
  });

  it("resolves model mappings accurately with smart slug normalization and synonyms", () => {
    // Populate kiro mappings with a target model configured for claude-sonnet-4.5 and auto
    MitmRepository.updateMapping("kiro", "claude-sonnet-4.5", "anthropic/claude-3-7-sonnet");
    MitmRepository.updateMapping("kiro", "auto", "combo/kiro-combo");
    MitmRepository.updateMapping("kiro", "gpt-5.6-sol", "openai/gpt-4o");

    // Both wire format and display-name formats must resolve to the configured target model
    assert.equal(
      resolveModelMapping("kiro", "claude-sonnet-4.5"),
      "anthropic/claude-3-7-sonnet"
    );
    assert.equal(
      resolveModelMapping("kiro", "Claude Sonnet 4.5"),
      "anthropic/claude-3-7-sonnet"
    );
    assert.equal(
      resolveModelMapping("kiro", "models/claude-sonnet-4.5"),
      "anthropic/claude-3-7-sonnet"
    );
    assert.equal(
      resolveModelMapping("kiro", "claude-sonnet-4-5"),
      "anthropic/claude-3-7-sonnet"
    );

    // Auto agent synonyms
    assert.equal(resolveModelMapping("kiro", "auto"), "combo/kiro-combo");
    assert.equal(resolveModelMapping("kiro", "Auto (Kiro Agent)"), "combo/kiro-combo");
    assert.equal(resolveModelMapping("kiro", "kiro-auto"), "combo/kiro-combo");

    // Sol synonyms
    assert.equal(resolveModelMapping("kiro", "gpt-5.6-sol"), "openai/gpt-4o");
    assert.equal(resolveModelMapping("kiro", "GPT 5.6 Sol"), "openai/gpt-4o");

    // Unmapped model (targetModel = "") returns null (safe passthrough)
    assert.equal(resolveModelMapping("kiro", "claude-haiku-4.5"), null);
    assert.equal(resolveModelMapping("kiro", "simple-task"), null);
    assert.equal(resolveModelMapping("kiro", "unknown-random-model"), null);
  });

  it("automatically migrates legacy display-name rows in SQLite to kebab-case while preserving target_model", () => {
    const db = getDatabase();

    // Insert legacy format rows into mitm_mappings
    db.run(
      "INSERT INTO mitm_mappings (ide, source_model, target_model) VALUES ('kiro', 'Claude Sonnet 4.5', 'anthropic/claude-3-7-sonnet')"
    );
    db.run(
      "INSERT INTO mitm_mappings (ide, source_model, target_model) VALUES ('kiro', 'Auto (Kiro Agent)', 'combo/default-combo')"
    );
    db.run(
      "INSERT INTO mitm_mappings (ide, source_model, target_model) VALUES ('kiro', 'GPT 5.6 Sol', 'openai/gpt-5-sol')"
    );
    db.run(
      "INSERT INTO mitm_mappings (ide, source_model, target_model) VALUES ('kiro', 'custom-special-model', 'custom/my-target')"
    );

    // Calling getMappings triggers auto-migration
    const migrated = MitmRepository.getMappings("kiro");

    // Legacy display names must no longer exist as source_model
    assert.equal(migrated.some((m) => m.sourceModel === "Claude Sonnet 4.5"), false);
    assert.equal(migrated.some((m) => m.sourceModel === "Auto (Kiro Agent)"), false);
    assert.equal(migrated.some((m) => m.sourceModel === "GPT 5.6 Sol"), false);

    // Standard kebab-case models must have preserved the user's targetModel
    const sonnet = migrated.find((m) => m.sourceModel === "claude-sonnet-4.5");
    assert.ok(sonnet);
    assert.equal(sonnet.targetModel, "anthropic/claude-3-7-sonnet");

    const auto = migrated.find((m) => m.sourceModel === "auto");
    assert.ok(auto);
    assert.equal(auto.targetModel, "combo/default-combo");

    const sol = migrated.find((m) => m.sourceModel === "gpt-5.6-sol");
    assert.ok(sol);
    assert.equal(sol.targetModel, "openai/gpt-5-sol");

    // Custom model must be preserved
    const custom = migrated.find((m) => m.sourceModel === "custom-special-model");
    assert.ok(custom);
    assert.equal(custom.targetModel, "custom/my-target");

    // All standard defaults should be present
    for (const def of DEFAULT_KIRO_MAPPINGS) {
      assert.ok(
        migrated.some((m) => m.sourceModel === def.sourceModel),
        `Default model '${def.sourceModel}' missing after migration`
      );
    }
  });

  it("handles smart resetMappings preserving user choices across kebab-case", () => {
    MitmRepository.updateMapping("kiro", "claude-sonnet-4.5", "custom/preserved-choice");
    MitmRepository.updateMapping("kiro", "custom-temp", "custom/temp-target");

    const reset = MitmRepository.resetMappings("kiro");

    const preserved = reset.find((m) => m.sourceModel === "claude-sonnet-4.5");
    assert.ok(preserved);
    assert.equal(preserved.targetModel, "custom/preserved-choice");

    const unmapped = reset.find((m) => m.sourceModel === "claude-haiku-4.5");
    assert.ok(unmapped);
    assert.equal(unmapped.targetModel, "");
  });
});
