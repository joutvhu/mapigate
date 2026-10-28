import { describe, it } from "node:test";
import assert from "node:assert/strict";
import zlib from "node:zlib";
import { isModelDiscoveryRequest } from "../src/mitm/toolsHelper.js";
import {
  augmentKiroModelsPayload,
  decompressBuffer,
} from "../src/mitm/handlers/kiro/modelInjector.js";
import {
  augmentCopilotModelsPayload,
  guessCopilotVendor,
} from "../src/mitm/handlers/copilot/modelInjector.js";
import {
  augmentAntigravityModelsPayload,
} from "../src/mitm/handlers/antigravity/modelInjector.js";
import { KiroMitmHandler } from "../src/mitm/handlers/kiro/handler.js";
import { CopilotMitmHandler } from "../src/mitm/handlers/copilot/handler.js";
import { AntigravityMitmHandler } from "../src/mitm/handlers/antigravity/handler.js";
import { MitmRepository } from "../src/storage/repositories/mitmRepo.js";
import { getDatabase } from "../src/storage/database.js";

describe("MITM Model Augmentation & Discovery Interception", () => {
  describe("Model Discovery Request Predicate", () => {
    it("identifies GET /ListAvailableModels requests", () => {
      assert.equal(
        isModelDiscoveryRequest("kiro", { url: "/List-Available-Models?origin=AI_EDITOR" }),
        true
      );
      assert.equal(
        isModelDiscoveryRequest("kiro", { url: "/list-available-models" }),
        true
      );
      assert.equal(
        isModelDiscoveryRequest("kiro", { url: "/ListAvailableModels?origin=AI_EDITOR" }),
        true
      );
      assert.equal(
        isModelDiscoveryRequest("kiro", { url: "/listAvailableModels" }),
        true
      );
      assert.equal(
        isModelDiscoveryRequest("kiro", { url: "https://management.us-east-1.kiro.dev/List-Available-Models?origin=AI_EDITOR" }),
        true
      );
      assert.equal(
        isModelDiscoveryRequest("kiro", { url: "https://q.us-east-1.amazonaws.com/ListAvailableModels?origin=AI_EDITOR" }),
        true
      );
    });

    it("identifies POST requests with x-amz-target ListAvailableModels", () => {
      assert.equal(
        isModelDiscoveryRequest("kiro", {
          url: "/",
          headers: { "x-amz-target": "AmazonCodeWhispererService.ListAvailableModels" },
        }),
        true
      );
      assert.equal(
        isModelDiscoveryRequest("kiro", {
          url: "",
          headers: { "x-amz-target": ["AmazonCodeWhispererService.ListAvailableModels"] },
        }),
        true
      );
    });

    it("returns false for standard chat requests and unknown tools", () => {
      assert.equal(
        isModelDiscoveryRequest("kiro", { url: "/generateAssistantResponse", headers: { "x-amz-target": "AmazonCodeWhispererService.GenerateAssistantResponse" } }),
        false
      );
      assert.equal(
        isModelDiscoveryRequest("copilot", { url: "/models" }),
        true
      );
      assert.equal(
        isModelDiscoveryRequest("copilot", { url: "/models?client-id=vscode" }),
        true
      );
      assert.equal(
        isModelDiscoveryRequest("copilot", { url: "/chat/completions" }),
        false
      );
      assert.equal(
        isModelDiscoveryRequest("antigravity", { url: "/v1internal:fetchAvailableModels" }),
        true
      );
      assert.equal(
        isModelDiscoveryRequest("antigravity", { url: "https://daily-cloudcode-pa.googleapis.com/v1internal:fetchAvailableModels" }),
        true
      );
      assert.equal(
        isModelDiscoveryRequest("antigravity", { url: "/v1internal:streamGenerateContent" }),
        false
      );
      assert.equal(
        isModelDiscoveryRequest("cursor", { url: "/ListAvailableModels" }),
        false
      );
    });
  });

  describe("Kiro Model Payload Augmentation", () => {
    it("augments genuine account models with catalog models without duplicates", () => {
      const genuineUpstream = {
        models: [
          {
            modelId: "claude-haiku-4.5",
            modelName: "Claude 3.5 Haiku",
            status: "ACTIVE",
            origin: "AI_EDITOR",
            capabilities: { chat: true, codeGeneration: true },
          },
        ],
      };

      const augmented = augmentKiroModelsPayload(genuineUpstream);
      assert.ok(Array.isArray(augmented.models), "Must have models array");
      assert.ok(augmented.models.length > 5, "Must have added catalog models");

      // Check genuine model is preserved
      const haiku = augmented.models.find((m: any) => m.modelId === "claude-haiku-4.5");
      assert.ok(haiku, "claude-haiku-4.5 must be present");
      assert.equal(haiku.modelName, "Claude 3.5 Haiku", "Original name should be preserved");

      // Verify no duplicate IDs
      const ids = augmented.models.map((m: any) => m.modelId.toLowerCase());
      const uniqueIds = new Set(ids);
      assert.equal(ids.length, uniqueIds.size, "No duplicate model IDs allowed");

      // Check injected models are ACTIVE and capable
      const sonnet = augmented.models.find((m: any) => m.modelId === "claude-sonnet-4.5");
      assert.ok(sonnet, "claude-sonnet-4.5 must be injected");
      assert.equal(sonnet.status, "ACTIVE");
      assert.equal(sonnet.origin, "AI_EDITOR");
      assert.equal(sonnet.capabilities.chat, true);

      const deepseek = augmented.models.find((m: any) => m.modelId === "deepseek-3.2");
      assert.ok(deepseek, "deepseek-3.2 must be injected");
      assert.equal(deepseek.status, "ACTIVE");
    });

    it("handles modelSummaries payload shape", () => {
      const summaryPayload = {
        modelSummaries: [
          {
            modelId: "auto",
            modelName: "Auto",
            status: "ACTIVE",
          },
        ],
      };

      const augmented = augmentKiroModelsPayload(summaryPayload);
      assert.ok(augmented.modelSummaries.length > 5);
      const opus = augmented.modelSummaries.find((m: any) => m.modelId === "claude-opus-5");
      assert.ok(opus, "claude-opus-5 must be injected into modelSummaries");
    });

    it("fails-open on exceptions or non-object payloads", () => {
      const exceptionPayload = {
        __type: "ValidationException",
        message: "Invalid token or origin parameter",
      };
      const res = augmentKiroModelsPayload(exceptionPayload);
      assert.equal(res.__type, "ValidationException");
      assert.equal(res.models, undefined);

      assert.equal(augmentKiroModelsPayload(null), null);
      assert.equal(augmentKiroModelsPayload("bad payload"), "bad payload");
    });

    it("includes custom candidates when provided", () => {
      const payload = { models: [] };
      const augmented = augmentKiroModelsPayload(payload, [
        { id: "custom-special-model", name: "Custom Special Model" },
      ]);
      const found = augmented.models.find((m: any) => m.modelId === "custom-special-model");
      assert.ok(found, "Custom candidate must be present in augmented models");
      assert.equal(found.modelName, "Custom Special Model");
      assert.equal(found.status, "ACTIVE");
    });
  });

  describe("Decompression Helper", () => {
    it("decompresses gzip buffers correctly", () => {
      const text = JSON.stringify({ models: [{ modelId: "test-model" }] });
      const gzipped = zlib.gzipSync(Buffer.from(text, "utf-8"));
      const decompressed = decompressBuffer(gzipped, "gzip");
      assert.equal(decompressed.toString("utf-8"), text);
    });

    it("passes uncompressed buffer through untouched", () => {
      const text = "plain uncompressed text";
      const buf = Buffer.from(text, "utf-8");
      const out = decompressBuffer(buf);
      assert.equal(out.toString("utf-8"), text);
    });
  });

  describe("Repository Toggle & Handler Routing", () => {
    it("persists and reads augment models status per tool", () => {
      // Ensure database is initialized
      getDatabase();

      // Default state
      MitmRepository.setToolAugmentModels("kiro", false);
      assert.equal(MitmRepository.getToolAugmentModels("kiro"), false);

      // Toggle ON
      MitmRepository.setToolAugmentModels("kiro", true);
      assert.equal(MitmRepository.getToolAugmentModels("kiro"), true);

      // getAllToolAugmentModels contains kiro
      const all = MitmRepository.getAllToolAugmentModels();
      assert.equal(all.kiro, true);

      // Toggle OFF
      MitmRepository.setToolAugmentModels("kiro", false);
      assert.equal(MitmRepository.getToolAugmentModels("kiro"), false);
    });

    it("routes to interceptKiroModels when isModelDiscovery is set on context", async () => {
      const handler = new KiroMitmHandler();
      let interceptedDiscovery = false;

      const mockReq = { url: "/ListAvailableModels", headers: {} } as any;
      const mockRes = {
        writeHead: () => mockRes,
        end: () => mockRes,
      } as any;
      const mockPassthrough = async () => {
        interceptedDiscovery = true;
      };

      // Since interceptKiroModels falls back to passthrough when fetchUpstreamDirect fails in test env,
      // calling handle with isModelDiscovery=true should trigger model discovery path
      await handler.handle({
        req: mockReq,
        res: mockRes,
        bodyBuffer: Buffer.from(""),
        isModelDiscovery: true,
        passthrough: mockPassthrough,
      });

      assert.equal(interceptedDiscovery, true, "Must have executed model discovery path");
    });

    it("routes CopilotMitmHandler to interceptCopilotModels when isModelDiscovery is set", async () => {
      const handler = new CopilotMitmHandler();
      let interceptedDiscovery = false;

      const mockReq = { url: "/models", headers: {} } as any;
      const mockRes = {
        writeHead: () => mockRes,
        end: () => mockRes,
      } as any;
      const mockPassthrough = async () => {
        interceptedDiscovery = true;
      };

      await handler.handle({
        req: mockReq,
        res: mockRes,
        bodyBuffer: Buffer.from(""),
        isModelDiscovery: true,
        passthrough: mockPassthrough,
      });

      assert.equal(interceptedDiscovery, true, "Must have executed Copilot model discovery path");
    });

    it("routes AntigravityMitmHandler to interceptAntigravityModels when isModelDiscovery is set", async () => {
      const handler = new AntigravityMitmHandler();
      let interceptedDiscovery = false;

      const mockReq = { url: "/v1internal:fetchAvailableModels", headers: {} } as any;
      const mockRes = {
        writeHead: () => mockRes,
        end: () => mockRes,
      } as any;
      const mockPassthrough = async () => {
        interceptedDiscovery = true;
      };

      await handler.handle({
        req: mockReq,
        res: mockRes,
        bodyBuffer: Buffer.from("{}"),
        isModelDiscovery: true,
        passthrough: mockPassthrough,
      });

      assert.equal(interceptedDiscovery, true, "Must have executed Antigravity model discovery path");
    });
  });

  describe("Copilot Model Payload Augmentation", () => {
    it("augments Copilot models payload with catalog without duplicates", () => {
      const genuineUpstream = {
        data: [
          {
            id: "gpt-4o",
            name: "GPT-4o",
            version: "gpt-4o-2024-05-13",
            vendor: "openai",
            capabilities: {
              family: "gpt-4o",
              type: "chat",
              limits: { max_prompt_tokens: 128000, max_output_tokens: 4096 },
            },
          },
        ],
      };

      const augmented = augmentCopilotModelsPayload(genuineUpstream);
      assert.ok(Array.isArray(augmented.data), "Must have data array");
      assert.ok(augmented.data.length > 5, "Must have added catalog models");

      // Verify gpt-4o preserved
      const gpt4o = augmented.data.find((m: any) => m.id === "gpt-4o");
      assert.ok(gpt4o);
      assert.equal(gpt4o.vendor, "openai");

      // Verify claude and deepseek injected
      const claudeSonnet = augmented.data.find((m: any) => m.id === "claude-3.7-sonnet");
      assert.ok(claudeSonnet, "claude-3.7-sonnet must be present");
      assert.equal(claudeSonnet.vendor, "anthropic");

      const deepseek = augmented.data.find((m: any) => m.id === "deepseek-chat");
      assert.ok(deepseek, "deepseek-chat must be present");
      assert.equal(deepseek.vendor, "deepseek");

      // No duplicate ids
      const ids = augmented.data.map((m: any) => m.id.toLowerCase());
      const uniqueIds = new Set(ids);
      assert.equal(ids.length, uniqueIds.size);
    });

    it("guesses vendors correctly", () => {
      assert.equal(guessCopilotVendor("claude-3.7-sonnet"), "anthropic");
      assert.equal(guessCopilotVendor("claude-haiku-4.5"), "anthropic");
      assert.equal(guessCopilotVendor("deepseek-reasoner"), "deepseek");
      assert.equal(guessCopilotVendor("gemini-2.5-pro"), "google");
      assert.equal(guessCopilotVendor("gemini-3.7-flash"), "google");
      assert.equal(guessCopilotVendor("qwen-2.5-coder"), "alibaba");
      assert.equal(guessCopilotVendor("minimax-m2.5"), "minimax");
      assert.equal(guessCopilotVendor("glm-4"), "zhipu");
      assert.equal(guessCopilotVendor("grok-4.5"), "xai");
      assert.equal(guessCopilotVendor("kimi-k3"), "moonshot");
      assert.equal(guessCopilotVendor("mai-code-1.1-flash"), "microsoft");
      assert.equal(guessCopilotVendor("gpt-5.6-terra"), "openai");
      assert.equal(guessCopilotVendor("o3-mini"), "openai");
    });

    it("fails open on upstream error responses", () => {
      const errPayload = { error: { message: "Unauthorized", code: "401" } };
      const res = augmentCopilotModelsPayload(errPayload);
      assert.deepEqual(res, errPayload);
    });
  });

  describe("Antigravity Model Payload Augmentation", () => {
    it("augments Antigravity models and agentModelSorts without duplicates", () => {
      const genuineUpstream = {
        models: {
          "gemini-2.0-flash": {
            preview: false,
            thinkingLevel: "medium",
          },
        },
        defaultAgentModelId: "gemini-2.0-flash",
        agentModelSorts: [
          {
            displayName: "Recommended",
            groups: [
              {
                displayName: "Gemini",
                modelIds: ["gemini-2.0-flash"],
              },
            ],
          },
        ],
      };

      const augmented = augmentAntigravityModelsPayload(genuineUpstream);
      assert.ok(typeof augmented.models === "object", "models must be an object");
      assert.ok(Object.keys(augmented.models).length > 5, "models must have added catalog models");

      // Verify original preserved
      assert.ok(augmented.models["gemini-2.0-flash"]);

      // Verify catalog injected into models map
      assert.ok(augmented.models["claude-sonnet-5.5-thinking"]);
      assert.ok(augmented.models["gemini-3.8-flash-high"]);

      // Verify agentModelSorts updated with model IDs
      const groups = augmented.agentModelSorts[0].groups;
      assert.ok(groups.length >= 2, "Must have organized groups");

      const allSortModelIds = groups.flatMap((g: any) => g.modelIds || []);
      assert.ok(allSortModelIds.includes("gemini-2.0-flash"));
      assert.ok(allSortModelIds.includes("claude-sonnet-5.5-thinking"));
      assert.ok(allSortModelIds.includes("gemini-3.8-flash-high"));

      // Verify no duplicate IDs in any group
      for (const group of groups) {
        const ids = (group.modelIds || []).map((id: string) => id.toLowerCase());
        const unique = new Set(ids);
        assert.equal(ids.length, unique.size, `Duplicate found in group ${group.displayName}`);
      }
    });

    it("fails open on error responses", () => {
      const errPayload = { error: { code: 403, message: "Permission Denied" } };
      const res = augmentAntigravityModelsPayload(errPayload);
      assert.deepEqual(res, errPayload);
    });
  });
});
