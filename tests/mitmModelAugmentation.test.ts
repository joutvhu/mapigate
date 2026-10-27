import { describe, it } from "node:test";
import assert from "node:assert/strict";
import zlib from "node:zlib";
import { isModelDiscoveryRequest } from "../src/mitm/toolsHelper.js";
import {
  augmentKiroModelsPayload,
  decompressBuffer,
} from "../src/mitm/handlers/kiro/modelInjector.js";
import { KiroMitmHandler } from "../src/mitm/handlers/kiro/handler.js";
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
        isModelDiscoveryRequest("kiro", {
          url: "/generateAssistantResponse",
          headers: { "x-amz-target": "AmazonCodeWhispererService.GenerateAssistantResponse" },
        }),
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
  });
});
