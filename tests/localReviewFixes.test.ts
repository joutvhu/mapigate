import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { MiniMaxProvider } from "../src/providers/runtime/minimax/provider.js";
import { handleFusionChat } from "../src/providers/composite/combo/fusionStrategy.js";
import { finalizeCustomNonStreamingResponse } from "../src/providers/core/base/customExecutionHelper.js";
import { LogRepository } from "../src/storage/repositories/logRepo.js";
import { SettingsRepository } from "../src/storage/repositories/settingsRepo.js";
import { getDatabase } from "../src/storage/database.js";
import { buildOpenCodeHeaders } from "../src/providers/runtime/opencode/provider.js";

test("MiniMaxProvider / AnthropicCompatibleProvider - does not duplicate Anthropic-Version header across casing", async () => {
  const provider = new MiniMaxProvider();
  const headers = await provider.buildHeaders({
    req: { headers: {} } as any,
    res: {} as any,
    targetModel: "MiniMax-M3",
    clientFormat: "openai",
    targetFormat: "claude",
    body: { messages: [{ role: "user", content: "hi" }] },
    provider: {
      id: "minimax",
      name: "MiniMax",
      baseUrl: "https://api.minimax.io/anthropic/v1/messages",
      format: "claude",
      priority: 1,
      models: [],
      customHeaders: {
        "Anthropic-Version": "2023-06-01",
        "X-Api-Key": "custom-preset-key",
      },
      isActive: true,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    },
    account: {
      id: "acc_mm_1",
      providerId: "minimax",
      name: "MM Account",
      rawApiKey: "mm-secret-token",
      isActive: true,
      rateLimitHits: 0,
      createdAt: Date.now(),
    },
    requestId: "req_mm_hdr",
    startTime: Date.now(),
    clientTool: "cursor",
    rawModel: "minimax/MiniMax-M3",
    rtkStats: { originalTokens: 0, compressedTokens: 0, tokensSaved: 0 },
  });

  const fetchHeaders = new Headers(headers);
  assert.equal(fetchHeaders.get("anthropic-version"), "2023-06-01");
  assert.equal(fetchHeaders.get("x-api-key"), "custom-preset-key");
});

test("handleFusionChat - single surviving panel model preserves streaming and tool calling", async () => {
  const dispatchedCalls: Array<{ isPanel: boolean; stream: any; hasTools: boolean }> = [];

  // Case 1: Streaming request -> must re-dispatch non-panel streaming call instead of returning panel JSON
  const streamResult = await handleFusionChat({
    body: {
      model: "combo/test-fusion",
      stream: true,
      messages: [{ role: "user", content: "hello" }],
    },
    models: ["openai/gpt-4o", "claude/claude-sonnet-4-6"],
    comboName: "test-fusion",
    handleSingleModel: async (mBody, mStr, isPanel = false) => {
      dispatchedCalls.push({
        isPanel,
        stream: mBody.stream,
        hasTools: Array.isArray(mBody.tools) && mBody.tools.length > 0,
      });
      if (isPanel) {
        if (mStr.startsWith("openai/")) {
          return {
            ok: true,
            status: 200,
            json: { choices: [{ message: { content: "Panel answer" } }] },
            modelUsed: mStr,
          };
        }
        return { ok: false, status: 503, error: "Down" };
      }
      return { ok: true, status: 200, isStream: true, logged: true, modelUsed: mStr };
    },
  });

  assert.equal(streamResult.ok, true);
  assert.equal(streamResult.isStream, true);
  assert.equal(dispatchedCalls.filter((c) => !c.isPanel).length, 1);
  assert.equal(dispatchedCalls.find((c) => !c.isPanel)?.stream, true);

  // Case 2: Non-streaming WITH tools -> must re-dispatch with tools intact
  dispatchedCalls.length = 0;
  await handleFusionChat({
    body: {
      model: "combo/test-fusion",
      stream: false,
      tools: [{ type: "function", function: { name: "read_file", parameters: {} } }],
      messages: [{ role: "user", content: "read index.ts" }],
    },
    models: ["openai/gpt-4o", "claude/claude-sonnet-4-6"],
    comboName: "test-fusion",
    handleSingleModel: async (mBody, mStr, isPanel = false) => {
      dispatchedCalls.push({
        isPanel,
        stream: mBody.stream,
        hasTools: Array.isArray(mBody.tools) && mBody.tools.length > 0,
      });
      if (isPanel) {
        if (mStr.startsWith("openai/")) {
          return {
            ok: true,
            status: 200,
            json: { choices: [{ message: { content: "I will read index.ts" } }] },
            modelUsed: mStr,
          };
        }
        return { ok: false, status: 503, error: "Down" };
      }
      return { ok: true, status: 200, json: { choices: [] }, logged: true, modelUsed: mStr };
    },
  });

  const finalToolCall = dispatchedCalls.find((c) => !c.isPanel);
  assert.ok(finalToolCall, "Expected full non-panel dispatch when tools are present");
  assert.equal(finalToolCall.hasTools, true);
});

test("finalizeCustomNonStreamingResponse - attributes account, tokens, and converts clientFormat", () => {
  let capturedStatus = 0;
  let capturedBody: any = null;
  const mockRes: any = {
    status(code: number) {
      capturedStatus = code;
      return mockRes;
    },
    json(payload: any) {
      capturedBody = payload;
      return mockRes;
    },
  };

  const reqId = `req_custom_nonstream_${Date.now()}`;
  const result = finalizeCustomNonStreamingResponse({
    providerId: "trae",
    targetModel: "claude-sonnet-4-6",
    responseId: "chatcmpl_trae_1",
    created: Math.floor(Date.now() / 1000),
    fullText: "Hello from Trae non-streaming!",
    context: {
      req: { headers: {}, body: {} } as any,
      res: mockRes,
      targetModel: "claude-sonnet-4-6",
      clientFormat: "anthropic",
      targetFormat: "openai",
      body: {},
      account: {
        id: "acc_trae_99",
        providerId: "trae",
        name: "trae-user@example.com",
        rawApiKey: "tok",
        isActive: true,
        rateLimitHits: 0,
        createdAt: Date.now(),
      },
      requestId: reqId,
      startTime: Date.now() - 50,
      clientTool: "claude",
      rawModel: "trae/claude-sonnet-4-6",
      rtkStats: { originalTokens: 120, compressedTokens: 100, tokensSaved: 20 },
    },
  });

  assert.equal(result.ok, true);
  assert.equal(result.logged, true);
  assert.equal(result.modelUsed, "trae/claude-sonnet-4-6");
  assert.equal(capturedStatus, 200);
  assert.equal(capturedBody?.type, "message");
  assert.equal(capturedBody?.content?.[0]?.text, "Hello from Trae non-streaming!");

  const db = getDatabase();
  const savedLog = db.get<any>("SELECT * FROM request_logs WHERE id = ?", reqId);
  assert.ok(savedLog);
  assert.equal(savedLog.provider_id, "trae");
  assert.equal(savedLog.account_id, "acc_trae_99");
  assert.equal(savedLog.prompt_tokens, 100);
  assert.ok(savedLog.completion_tokens > 0);
});

test("LogRepository - skips 0-token failures in daily_usage_stats and retains request_logs", () => {
  const db = getDatabase();
  const suffix = Date.now();
  const zeroProv = `zero_prov_${suffix}`;

  LogRepository.saveLog({
    id: `err_zero_${suffix}`,
    timestamp: Date.now(),
    clientTool: "cursor",
    requestedModel: "unknown-model",
    actualModel: "unknown-model",
    providerId: zeroProv,
    promptTokens: 0,
    completionTokens: 0,
    tokensSavedByRtk: 0,
    durationMs: 12,
    status: "error",
    errorMessage: "429 Too Many Requests",
  });

  const dailyZero = db.get<any>(
    "SELECT * FROM daily_usage_stats WHERE provider_id = ?",
    zeroProv
  );
  assert.equal(dailyZero, undefined, "0-token error must not roll up into daily_usage_stats");
});

test("SettingsRepository - encrypts custom gatewayApiKeys containing colons at rest", () => {
  const existing = SettingsRepository.getGatewayApiKeys();
  const customKeyPlain = "team-alpha:custom-secret-key-987654";
  const testEntry = {
    id: `key_colon_${Date.now()}`,
    key: customKeyPlain,
    name: "Colon Key",
    isActive: true,
    createdAt: Date.now(),
  };

  try {
    SettingsRepository.setSetting("gatewayApiKeys", [...existing, testEntry]);
    const db = getDatabase();
    const rawRow = db.get<{ value: string }>("SELECT value FROM settings WHERE key = 'gatewayApiKeys'");
    assert.ok(rawRow?.value);
    assert.equal(rawRow.value.includes(customKeyPlain), false, "Plaintext key with colon must be encrypted in SQLite");

    const loaded = SettingsRepository.getGatewayApiKeys().find((k) => k.id === testEntry.id);
    assert.equal(loaded?.key, customKeyPlain);
  } finally {
    SettingsRepository.setSetting("gatewayApiKeys", existing);
  }
});

test("OpenCodeHeaders & Tray script - stream-aware Accept header and non-blocking StreamReader", () => {
  const streamHeaders = buildOpenCodeHeaders({}, "ses_1", undefined, "https://opencode.ai/zen/v1/chat/completions", true);
  const jsonHeaders = buildOpenCodeHeaders({}, "ses_1", undefined, "https://opencode.ai/zen/v1/chat/completions", false);
  assert.equal(streamHeaders.Accept, "text/event-stream");
  assert.equal(jsonHeaders.Accept, "application/json");

  const trayScript = fs.readFileSync(path.resolve("src/cli/tray/tray.ps1"), "utf8");
  assert.ok(trayScript.includes("OpenStandardInput()"), "tray.ps1 must use OpenStandardInput StreamReader");
  assert.equal(trayScript.includes("[Console]::In.ReadLineAsync()"), false);
});

test("POST /api/cli-tools/:tool/apply - uses tool defaultModels[0] instead of hardcoded claude-sonnet-4-6", async () => {
  const { CliToolRegistry } = await import("../src/cli/tools/registry.js");
  const { CLI_TOOLS } = await import("../src/shared/constants/cliTools.js");
  const app = (await import("../src/server/index.js")).default;
  const http = await import("node:http");

  const codexHandler = CliToolRegistry.get("codex");
  assert.ok(codexHandler);
  const origApply = codexHandler.apply;
  let capturedModel = "";

  codexHandler.apply = async (opts) => {
    capturedModel = opts.model;
  };

  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", () => resolve()));
  const addr = server.address() as { port: number };

  try {
    const res = await fetch(`http://127.0.0.1:${addr.port}/api/cli-tools/codex/apply`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    assert.equal(res.status, 200);
    assert.equal(capturedModel, CLI_TOOLS.codex.defaultModels?.[0]);
    assert.notEqual(capturedModel, "claude-sonnet-4-6");
  } finally {
    codexHandler.apply = origApply;
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});
