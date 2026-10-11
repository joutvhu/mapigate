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
  DEFAULT_CURSOR_MAPPINGS,
  TOOL_DEFAULT_HOSTS,
} from "../src/storage/repositories/mitmRepo.js";
import { checkAllDNSStatus } from "../src/mitm/dns/dnsConfig.js";

describe("MITM Tool Hosts and Routing Alignment", () => {
  it("defines exact verified domains for all 4 tools", () => {
    assert.deepEqual(TOOL_HOSTS.antigravity, [
      "daily-cloudcode-pa.googleapis.com",
      "cloudcode-pa.googleapis.com",
    ]);
    assert.deepEqual(TOOL_HOSTS.copilot, [
      "api.individual.githubcopilot.com",
    ]);
    assert.deepEqual(TOOL_HOSTS.kiro, [
      "runtime.us-east-1.kiro.dev",
      "q.us-east-1.amazonaws.com",
      "codewhisperer.us-east-1.amazonaws.com",
    ]);
    assert.deepEqual(TOOL_HOSTS.cursor, [
      "api2.cursor.sh",
    ]);
    assert.equal(ALL_MITM_HOSTS.length, 7);
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
    assert.equal(getToolForHost("runtime.us-east-1.kiro.dev:443"), "kiro");
    assert.equal(getToolForHost("q.us-east-1.amazonaws.com"), "kiro");
    assert.equal(getToolForHost("codewhisperer.us-east-1.amazonaws.com"), "kiro");
    assert.equal(getToolForHost("api2.cursor.sh:443"), "cursor");
    assert.equal(getToolForHost("api2.cursor.sh"), "cursor");
    assert.equal(getToolForHost("unknown-domain.example.com"), null);
    assert.equal(getToolForHost(""), null);
    assert.equal(getToolForHost(undefined), null);
  });

  it("correctly evaluates isMitmHost", () => {
    assert.equal(isMitmHost("daily-cloudcode-pa.googleapis.com"), true);
    assert.equal(isMitmHost("api2.cursor.sh"), true);
    assert.equal(isMitmHost("api.openai.com"), false);
  });

  it("formats tool default hosts for OS hosts file", () => {
    const agHosts = formatToolDefaultHosts("antigravity");
    assert.ok(agHosts.includes("127.0.0.1 daily-cloudcode-pa.googleapis.com"));
    assert.ok(agHosts.includes("127.0.0.1 cloudcode-pa.googleapis.com"));

    const cursorHosts = formatToolDefaultHosts("cursor");
    assert.equal(cursorHosts, "127.0.0.1 api2.cursor.sh");
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
    assert.equal(
      isChatRequest("cursor", { url: "/RunSSE" }),
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

  it("provides comprehensive default model mappings for all tools", () => {
    const agDefaults = getDefaultMappings("antigravity");
    assert.ok(agDefaults.length >= 20);
    assert.ok(agDefaults.some((m) => m.sourceModel === "Gemini 3.8 Flash (High)"));
    assert.ok(agDefaults.some((m) => m.sourceModel === "Claude Sonnet 5.5 (Thinking)"));

    const kiroDefaults = getDefaultMappings("kiro");
    assert.ok(kiroDefaults.some((m) => m.sourceModel === "auto"));
    assert.ok(kiroDefaults.some((m) => m.sourceModel === "simple-task"));
    assert.ok(kiroDefaults.some((m) => m.sourceModel === "gpt-5.6-sol"));

    const copilotDefaults = getDefaultMappings("copilot");
    assert.ok(copilotDefaults.some((m) => m.sourceModel === "gpt-4o"));

    const cursorDefaults = getDefaultMappings("cursor");
    assert.ok(cursorDefaults.some((m) => m.sourceModel === "claude-sonnet-4-5"));
  });

  it("checks DNS status returning keys for all 4 tools", () => {
    const dnsStatus = checkAllDNSStatus();
    assert.ok("antigravity" in dnsStatus);
    assert.ok("kiro" in dnsStatus);
    assert.ok("copilot" in dnsStatus);
    assert.ok("cursor" in dnsStatus);
    assert.equal(typeof dnsStatus.antigravity, "boolean");
    assert.equal(typeof dnsStatus.cursor, "boolean");
  });
});
