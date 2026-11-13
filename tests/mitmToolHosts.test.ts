import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  TOOL_HOSTS,
  ALL_MITM_HOSTS,
  HOST_REWRITE,
  getToolForHost,
  isMitmHost,
  formatToolDefaultHosts,
  isChatRequest,
  extractModel,
  MODEL_NO_MAP,
  MODEL_SYNONYMS,
  MODEL_PATTERNS,
} from "../src/shared/constants/mitmToolHosts.js";
import {
  getDefaultMappings,
  DEFAULT_ANTIGRAVITY_MAPPINGS,
  DEFAULT_KIRO_MAPPINGS,
  DEFAULT_COPILOT_MAPPINGS,
  TOOL_DEFAULT_HOSTS,
  MitmRepository,
} from "../src/storage/repositories/mitmRepo.js";
import { checkAllDNSStatus } from "../src/mitm/dns/dnsConfig.js";

describe("MITM Tool Hosts and Routing Alignment", () => {
  it("defines exact verified domains for all 3 tools", () => {
    assert.deepEqual(TOOL_HOSTS.antigravity, [
      "daily-cloudcode-pa.googleapis.com",
      "cloudcode-pa.googleapis.com",
    ]);
    assert.deepEqual(TOOL_HOSTS.copilot, [
      "api.githubcopilot.com",
      "copilot-proxy.githubusercontent.com",
      "api.individual.githubcopilot.com",
      "api.business.githubcopilot.com",
      "api.enterprise.githubcopilot.com",
    ]);
    assert.deepEqual(TOOL_HOSTS.kiro, [
      "management.us-east-1.kiro.dev",
      "runtime.us-east-1.kiro.dev",
      "q.us-east-1.amazonaws.com",
      "codewhisperer.us-east-1.amazonaws.com",
    ]);
    assert.equal(ALL_MITM_HOSTS.length, 11);
  });

  it("rewrites production cloudcode-pa to daily-cloudcode-pa", () => {
    assert.equal(
      HOST_REWRITE["cloudcode-pa.googleapis.com"],
      "daily-cloudcode-pa.googleapis.com"
    );
  });

  it("identifies tools correctly from host headers including ports", () => {
    assert.equal(getToolForHost("daily-cloudcode-pa.googleapis.com"), "antigravity");
    assert.equal(getToolForHost("cloudcode-pa.googleapis.com:443"), "antigravity");
    assert.equal(getToolForHost("api.individual.githubcopilot.com"), "copilot");
    assert.equal(getToolForHost("copilot-proxy.githubusercontent.com"), "copilot");
    assert.equal(getToolForHost("runtime.us-east-1.kiro.dev:443"), "kiro");
    assert.equal(getToolForHost("management.us-east-1.kiro.dev"), "kiro");
    assert.equal(getToolForHost("q.us-east-1.amazonaws.com"), "kiro");
    assert.equal(getToolForHost("codewhisperer.us-east-1.amazonaws.com"), "kiro");
    // Subdomain matching via tool-level matchesHost predicate
    assert.equal(getToolForHost("custom-subdomain.cloudcode-pa.googleapis.com"), "antigravity");
    assert.equal(getToolForHost("subdomain.githubcopilot.com"), "copilot");
    assert.equal(getToolForHost("custom.kiro.dev"), "kiro");
    assert.equal(getToolForHost("unknown-domain.example.com"), null);
    assert.equal(getToolForHost(""), null);
    assert.equal(getToolForHost(undefined), null);
  });

  it("correctly evaluates isMitmHost", () => {
    assert.equal(isMitmHost("daily-cloudcode-pa.googleapis.com"), true);
    assert.equal(isMitmHost("management.us-east-1.kiro.dev"), true);
    assert.equal(isMitmHost("api.openai.com"), false);
  });

  it("dynamically resolves user-configured custom hosts from database", () => {
    const customKiroHost = "custom-bedrock.us-west-2.amazonaws.com";
    assert.equal(getToolForHost(customKiroHost), null);
    assert.equal(isMitmHost(customKiroHost), false);

    try {
      const customEntries = `${TOOL_DEFAULT_HOSTS.kiro}\n127.0.0.1 ${customKiroHost}\n127.0.0.1 secondary-kiro.internal # internal custom`;
      MitmRepository.saveToolHosts("kiro", customEntries);

      assert.equal(getToolForHost(customKiroHost), "kiro");
      assert.equal(getToolForHost(`${customKiroHost}:443`), "kiro");
      assert.equal(isMitmHost(customKiroHost), true);
      assert.equal(isMitmHost(`${customKiroHost}:443`), true);
      assert.equal(getToolForHost("secondary-kiro.internal"), "kiro");
      assert.equal(isMitmHost("secondary-kiro.internal"), true);

      MitmRepository.resetToolHosts("kiro");
      assert.equal(getToolForHost(customKiroHost), null);
      assert.equal(isMitmHost(customKiroHost), false);
    } finally {
      MitmRepository.resetToolHosts("kiro");
    }
  });

  it("formats tool default hosts for OS hosts file", () => {
    const agHosts = formatToolDefaultHosts("antigravity");
    assert.ok(agHosts.includes("127.0.0.1 daily-cloudcode-pa.googleapis.com"));
    assert.ok(agHosts.includes("127.0.0.1 cloudcode-pa.googleapis.com"));

    const copilotHosts = formatToolDefaultHosts("copilot");
    assert.equal(
      copilotHosts,
      "127.0.0.1 api.githubcopilot.com\n127.0.0.1 copilot-proxy.githubusercontent.com\n127.0.0.1 api.individual.githubcopilot.com\n127.0.0.1 api.business.githubcopilot.com\n127.0.0.1 api.enterprise.githubcopilot.com"
    );
  });

  it("detects chat requests across different tools", () => {
    assert.equal(
      isChatRequest("antigravity", { url: "/v1internal:streamGenerateContent" }),
      true
    );
    assert.equal(
      isChatRequest("copilot", { url: "/chat/completions" }),
      true
    );
    // Kiro header-based chat request
    assert.equal(
      isChatRequest("kiro", {
        url: "/",
        headers: { "x-amz-target": "KiroRuntimeService.GenerateAssistantResponse" },
      }),
      true
    );
    assert.equal(
      isChatRequest("kiro", {
        url: "/",
        headers: { "x-amz-target": "KiroRuntimeService.CreateResponse" },
      }),
      true
    );
    // Non-chat telemetry / metrics
    assert.equal(
      isChatRequest("antigravity", { url: "/recordCodeAssistMetrics" }),
      false
    );
  });

  it("extracts model accurately from URLs and JSON payloads", () => {
    assert.equal(
      extractModel("/v1/models/gemini-2.5-flash:streamGenerateContent", "{}"),
      "gemini-2.5-flash"
    );

    const openAiBody = JSON.stringify({ model: "claude-sonnet-4-6" });
    assert.equal(extractModel("/v1/chat/completions", openAiBody), "claude-sonnet-4-6");

    const kiroBody = JSON.stringify({
      conversationState: {
        currentMessage: {
          userInputMessage: {
            modelId: "gpt-5.6-sol",
          },
        },
      },
    });
    assert.equal(extractModel("/", kiroBody), "gpt-5.6-sol");

    // Tiered Gemini flash thinking levels
    const tieredBody = JSON.stringify({
      model: "gemini-3.8-flash-tiered",
      generationConfig: { thinkingConfig: { thinkingLevel: "high" } },
    });
    assert.equal(extractModel("/", tieredBody), "gemini-3.8-flash-high");
  });

  it("guards against routing latency-critical inline tab autocomplete models", () => {
    const noMapPatterns = MODEL_NO_MAP.antigravity;
    assert.ok(noMapPatterns.some((re) => re.test("tab_jump_flash_lite_preview")));
    assert.ok(noMapPatterns.some((re) => re.test("tab_flash_lite_preview")));
    assert.ok(!noMapPatterns.some((re) => re.test("gemini-3.8-flash-medium")));
  });

  it("provides comprehensive default model mappings for all tools with empty target models", () => {
    const agDefaults = getDefaultMappings("antigravity");
    assert.ok(agDefaults.length >= 20);
    assert.ok(agDefaults.some((m) => m.sourceModel === "gemini-3.8-flash-high"));
    assert.ok(agDefaults.some((m) => m.sourceModel === "gemini-4-argon"));
    assert.ok(agDefaults.some((m) => m.sourceModel === "gemini-4-argon-high"));
    assert.ok(agDefaults.some((m) => m.sourceModel === "gemini-4-carbon"));
    assert.ok(agDefaults.some((m) => m.sourceModel === "gemini-4-carbon-high"));
    assert.ok(agDefaults.some((m) => m.sourceModel === "gemini-4-hydrogen"));
    assert.ok(agDefaults.some((m) => m.sourceModel === "gemini-4-hydrogen-high"));
    assert.ok(agDefaults.some((m) => m.sourceModel === "claude-sonnet-5.5-thinking"));

    const kiroDefaults = getDefaultMappings("kiro");
    assert.ok(kiroDefaults.some((m) => m.sourceModel === "auto"));
    assert.ok(kiroDefaults.some((m) => m.sourceModel === "simple-task"));
    assert.ok(kiroDefaults.some((m) => m.sourceModel === "permission-classifier"));
    assert.ok(kiroDefaults.some((m) => m.sourceModel === "gpt-5.6-sol"));

    const copilotDefaults = getDefaultMappings("copilot");
    assert.ok(copilotDefaults.some((m) => m.sourceModel === "claude-sonnet-4.6"));

    // Invariant: all default target models must be empty string
    for (const mapping of [...agDefaults, ...kiroDefaults, ...copilotDefaults]) {
      assert.equal(mapping.targetModel, "", `Default mapping for '${mapping.sourceModel}' must have empty targetModel`);
    }
  });

  it("smart resetMappings preserves user selections while resetting standard models", () => {
    // Setup existing mapping with user choice
    MitmRepository.updateMapping("copilot", "claude-sonnet-4.6", "custom/my-model-1");
    MitmRepository.updateMapping("copilot", "non-standard-custom", "custom/random");

    // Before reset, copilot has custom mapping
    const beforeReset = MitmRepository.getMappings("copilot");
    assert.equal(beforeReset.find((m) => m.sourceModel === "claude-sonnet-4.6")?.targetModel, "custom/my-model-1");

    // Execute smart reset
    const afterReset = MitmRepository.resetMappings("copilot");

    // Standard model with user choice was PRESERVED
    const preserved = afterReset.find((m) => m.sourceModel === "claude-sonnet-4.6");
    assert.equal(preserved?.targetModel, "custom/my-model-1");

    // Standard model without user choice was reset to ""
    const unmapped = afterReset.find((m) => m.sourceModel === "claude-haiku-4.5");
    assert.equal(unmapped?.targetModel, "");

    // Non-standard custom model was pruned on reset to defaults
    assert.equal(afterReset.find((m) => m.sourceModel === "non-standard-custom"), undefined);
  });

  it("checks DNS status returning keys for all 3 tools", () => {
    const dnsStatus = checkAllDNSStatus();
    assert.ok("antigravity" in dnsStatus);
    assert.ok("kiro" in dnsStatus);
    assert.ok("copilot" in dnsStatus);
    assert.equal(typeof dnsStatus.antigravity, "boolean");
    assert.equal(typeof dnsStatus.copilot, "boolean");
  });
});
