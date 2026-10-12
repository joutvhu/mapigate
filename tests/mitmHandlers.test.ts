import { describe, it } from "node:test";
import assert from "node:assert/strict";

// Tool modular imports
import { CursorMitmHandler, interceptCursor } from "../src/mitm/handlers/cursor/index.js";
import { CopilotMitmHandler, interceptCopilot, resolveRouterPath } from "../src/mitm/handlers/copilot/index.js";
import { AntigravityMitmHandler, interceptAntigravity } from "../src/mitm/handlers/antigravity/index.js";
import {
  KiroMitmHandler,
  interceptKiro,
  crc32,
  initKiroState,
  encodeHeader,
  buildEventStreamFrame,
  isBinaryEventStream,
  convertOpenAIToKiro,
} from "../src/mitm/handlers/kiro/index.js";

// Generated registry and tool modular imports
import { registerAllMitmHandlers } from "../src/mitm/handlers/generated/handlersRegistry.js";
import * as handlersIndex from "../src/mitm/handlers/index.js";

// Central barrel and root imports
import {
  MitmHandlerRegistry,
  DefaultPassthroughMitmHandler,
  fetchRouter,
  passthroughHttps,
  pipeSSE,
} from "../src/mitm/index.js";

describe("MITM Modular Tool Handlers", () => {
  describe("Handler Registration and Identification", () => {
    it("instantiates handlers with expected IDs", () => {
      assert.equal(new CursorMitmHandler().id, "cursor");
      assert.equal(new CopilotMitmHandler().id, "copilot");
      assert.equal(new AntigravityMitmHandler().id, "antigravity");
      assert.equal(new KiroMitmHandler().id, "kiro");
      assert.equal(new DefaultPassthroughMitmHandler().id, "passthrough");
    });

    it("registers and retrieves all tool handlers in MitmHandlerRegistry", () => {
      const cursor = new CursorMitmHandler();
      const copilot = new CopilotMitmHandler();
      const antigravity = new AntigravityMitmHandler();
      const kiro = new KiroMitmHandler();

      MitmHandlerRegistry.register(cursor);
      MitmHandlerRegistry.register(copilot);
      MitmHandlerRegistry.register(antigravity);
      MitmHandlerRegistry.register(kiro);

      assert.equal(MitmHandlerRegistry.get("cursor"), cursor);
      assert.equal(MitmHandlerRegistry.get("copilot"), copilot);
      assert.equal(MitmHandlerRegistry.get("antigravity"), antigravity);
      assert.equal(MitmHandlerRegistry.get("kiro"), kiro);
    });
  });

  describe("Hostname Matchers (canHandle)", () => {
    it("CursorMitmHandler matches cursor and anysphere domains", () => {
      const handler = new CursorMitmHandler();
      assert.equal(handler.canHandle("api2.cursor.sh:443", ""), true);
      assert.equal(handler.canHandle("api.anysphere.com", ""), true);
      assert.equal(handler.canHandle("api.openai.com", ""), false);
    });

    it("CopilotMitmHandler matches githubcopilot and copilot domains", () => {
      const handler = new CopilotMitmHandler();
      assert.equal(handler.canHandle("api.individual.githubcopilot.com:443", ""), true);
      assert.equal(handler.canHandle("copilot-telemetry.github.com", ""), true);
      assert.equal(handler.canHandle("api.anthropic.com", ""), false);
    });

    it("AntigravityMitmHandler matches cloudcode-pa.googleapis.com", () => {
      const handler = new AntigravityMitmHandler();
      assert.equal(handler.canHandle("cloudcode-pa.googleapis.com:443", ""), true);
      assert.equal(handler.canHandle("daily-cloudcode-pa.googleapis.com", ""), true);
      assert.equal(handler.canHandle("generativelanguage.googleapis.com", ""), false);
    });

    it("KiroMitmHandler matches kiro, codewhisperer, and q.us-east-1.amazonaws.com", () => {
      const handler = new KiroMitmHandler();
      assert.equal(handler.canHandle("runtime.us-east-1.kiro.dev:443", ""), true);
      assert.equal(handler.canHandle("codewhisperer.us-east-1.amazonaws.com", ""), true);
      assert.equal(handler.canHandle("q.us-east-1.amazonaws.com", ""), true);
      assert.equal(handler.canHandle("api.github.com", ""), false);
    });

    it("DefaultPassthroughMitmHandler handles any hostname", () => {
      const handler = new DefaultPassthroughMitmHandler();
      assert.equal(handler.canHandle("any-host.com", ""), true);
      assert.equal(handler.canHandle("random.domain.org", ""), true);
    });
  });

  describe("Copilot URL Router Path Resolution", () => {
    it("maps recognized patterns to internal router paths", () => {
      assert.equal(resolveRouterPath("/chat/completions"), "/v1/chat/completions");
      assert.equal(resolveRouterPath("/v1/messages"), "/v1/messages");
      assert.equal(resolveRouterPath("/responses"), "/v1/responses");
      assert.equal(resolveRouterPath("/unknown/path"), "/v1/chat/completions");
    });
  });

  describe("Kiro Binary EventStream Framing", () => {
    it("computes standard CRC32 checksums", () => {
      const testBuf = Buffer.from("test");
      assert.equal(crc32(testBuf), 3632233996);
      assert.equal(crc32(Buffer.from("123456789")), 0xcbf43926);
    });

    it("encodes EventStream headers correctly", () => {
      const header = encodeHeader(":event-type", "assistantResponseEvent");
      assert.ok(header.length > 0);
      assert.equal(header[0], 11); // Length of ":event-type"
    });

    it("builds valid EventStream binary frames with matching prelude & message CRC", () => {
      const payload = { content: "Hello Kiro" };
      const frame = buildEventStreamFrame("assistantResponseEvent", payload);

      assert.ok(frame.length > 16);
      const totalLen = frame.readUInt32BE(0);
      const headersLen = frame.readUInt32BE(4);
      const preludeCrc = frame.readUInt32BE(8);

      assert.equal(totalLen, frame.length);
      assert.equal(preludeCrc, crc32(frame.subarray(0, 8)));

      const messageCrc = frame.readUInt32BE(totalLen - 4);
      assert.equal(messageCrc, crc32(frame.subarray(0, totalLen - 4)));

      assert.equal(isBinaryEventStream(frame), true);
    });

    it("isBinaryEventStream correctly rejects non-EventStream buffers", () => {
      assert.equal(isBinaryEventStream(Buffer.from("short")), false);
      assert.equal(isBinaryEventStream(Buffer.alloc(0)), false);
      const invalid = Buffer.alloc(20);
      invalid.writeUInt32BE(5, 0); // invalid total length
      assert.equal(isBinaryEventStream(invalid), false);
    });
  });

  describe("Kiro Stream Conversion (convertOpenAIToKiro)", () => {
    it("converts standard assistant content chunk into EventStream frame", () => {
      const state = initKiroState("gpt-4o");
      const chunk = {
        model: "gpt-4o",
        choices: [{ delta: { content: "Hello world" } }],
      };

      const result = convertOpenAIToKiro(chunk, state);
      assert.ok(result);
      // First frame includes initial-response + assistantResponseEvent
      const frames = Array.isArray(result) ? result : [result];
      assert.ok(frames.length >= 1);
    });

    it("extracts <think> tags into reasoningContentEvent", () => {
      const state = initKiroState("deepseek-r1");
      const chunk = {
        model: "deepseek-r1",
        choices: [{ delta: { content: "<think>Let me ponder</think>Final answer" } }],
      };

      const result = convertOpenAIToKiro(chunk, state);
      assert.ok(result);
      const frames = Array.isArray(result) ? result : [result];
      assert.ok(frames.length >= 2);
    });

    it("handles tool_calls delta and stop reason", () => {
      const state = initKiroState("claude-3-5-sonnet");
      const toolCallChunk = {
        model: "claude-3-5-sonnet",
        choices: [
          {
            delta: {
              tool_calls: [
                {
                  index: 0,
                  id: "call_123",
                  function: { name: "readFile", arguments: '{"path":"main.ts"}' },
                },
              ],
            },
          },
        ],
      };

      const result = convertOpenAIToKiro(toolCallChunk, state);
      assert.ok(result);

      const finishChunk = {
        choices: [{ finish_reason: "tool_calls" }],
      };
      const finishResult = convertOpenAIToKiro(finishChunk, state);
      assert.ok(finishResult);
    });
  });

  describe("Generated Registry and Central Handlers Exports", () => {
    it("registerAllMitmHandlers populates registry with all handlers", () => {
      MitmHandlerRegistry.clear();
      registerAllMitmHandlers(MitmHandlerRegistry);
      assert.ok(MitmHandlerRegistry.get("cursor"));
      assert.ok(MitmHandlerRegistry.get("copilot"));
      assert.ok(MitmHandlerRegistry.get("antigravity"));
      assert.ok(MitmHandlerRegistry.get("kiro"));
      assert.ok(MitmHandlerRegistry.get("passthrough"));
    });

    it("re-exports tool symbols from central handlers index", () => {
      assert.equal(handlersIndex.interceptCursor, interceptCursor);
      assert.equal(handlersIndex.CursorMitmHandler, CursorMitmHandler);
      assert.equal(handlersIndex.interceptCopilot, interceptCopilot);
      assert.equal(handlersIndex.resolveRouterPath, resolveRouterPath);
      assert.equal(handlersIndex.CopilotMitmHandler, CopilotMitmHandler);
      assert.equal(handlersIndex.interceptAntigravity, interceptAntigravity);
      assert.equal(handlersIndex.AntigravityMitmHandler, AntigravityMitmHandler);
      assert.equal(handlersIndex.interceptKiro, interceptKiro);
      assert.equal(handlersIndex.crc32, crc32);
      assert.equal(handlersIndex.buildEventStreamFrame, buildEventStreamFrame);
      assert.equal(handlersIndex.KiroMitmHandler, KiroMitmHandler);
    });

    it("re-exports base utilities from root mitm index", () => {
      assert.equal(typeof fetchRouter, "function");
      assert.equal(typeof passthroughHttps, "function");
      assert.equal(typeof pipeSSE, "function");
    });
  });
});
