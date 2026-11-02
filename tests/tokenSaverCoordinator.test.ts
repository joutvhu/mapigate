process.env.NODE_ENV = "test";

import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import app from "../src/server/index.js";
import {
  TokenSaverCoordinator,
  TokenSaverRegistry,
  DEFAULT_TOKEN_SAVER_SETTINGS,
  type ITokenSaverMethod,
} from "../src/core/tokenSaver/index.js";
import { SettingsRepository } from "../src/storage/repositories/settingsRepo.js";

test("TokenSaverCoordinator - execution with RTK and Prompt Injectors", () => {
  const body = {
    messages: [
      { role: "system", content: "You are a helpful assistant." },
      { role: "user", content: "Check status" },
      {
        role: "tool",
        content: `On branch main
Changes not staged for commit:
  modified:   src/core/tokenSaver/index.ts
  modified:   src/core/tokenSaver/coordinator.ts
  modified:   src/core/tokenSaver/registry.ts
  modified:   src/core/tokenSaver/types.ts
Untracked files:
  src/core/tokenSaver/methods/rtk/filters/gitStatus.ts
  src/core/tokenSaver/methods/rtk/filters/gitDiff.ts
`,
      },
    ],
  };

  const summary = TokenSaverCoordinator.process(body, { clientFormat: "openai" }, {
    rtkEnabled: true,
    cavemanEnabled: true,
    cavemanLevel: "lite",
    ponytailEnabled: false,
    ponytailLevel: "lite",
  });

  assert.ok(summary.results.length >= 2);
  const rtkRes = summary.results.find((r) => r.methodId === "rtk");
  assert.ok(rtkRes?.applied);
  assert.ok(summary.tokensSaved > 0);

  const cavemanRes = summary.results.find((r) => r.methodId === "caveman");
  assert.ok(cavemanRes?.applied);

  // Check that tool content was compressed
  const toolMsg = body.messages.find((m) => m.role === "tool");
  assert.ok(toolMsg?.content.includes("* main"));
  assert.ok(toolMsg?.content.includes("~ Modified: 4 files"));

  // Check that caveman prompt was injected into system message
  const sysMsg = body.messages.find((m) => m.role === "system");
  assert.ok(sysMsg?.content.includes("Respond tersely"));
});

test("TokenSaverCoordinator - preserves error traces (Fail-Open & Safety)", () => {
  // Claude message with is_error: true
  const claudeBody = {
    messages: [
      { role: "user", content: "Run tests" },
      {
        role: "user",
        content: [
          {
            type: "tool_result",
            is_error: true,
            content: `Error: Process terminated with exit code 1
Stack trace:
  at Object.run (src/index.ts:42:15)
  at main (src/main.ts:10:5)
Fatal error in execution.`,
          },
        ],
      },
    ],
  };

  const origContent = claudeBody.messages[1].content[0].content;
  TokenSaverCoordinator.process(claudeBody, { clientFormat: "anthropic" }, { rtkEnabled: true });
  // Must NOT compress error blocks
  assert.equal(claudeBody.messages[1].content[0].content, origContent);

  // Kiro message with status: "error"
  const kiroBody = {
    conversationState: {
      currentMessage: {
        userInputMessage: {
          userInputMessageContext: {
            toolResults: [
              {
                status: "error",
                content: [{ text: "Command failed: exit code 127\nDetailed error message." }],
              },
            ],
          },
        },
      },
    },
  };

  const origKiroText = kiroBody.conversationState.currentMessage.userInputMessage.userInputMessageContext.toolResults[0].content[0].text;
  TokenSaverCoordinator.process(kiroBody, { clientFormat: "kiro" }, { rtkEnabled: true });
  assert.equal(
    kiroBody.conversationState.currentMessage.userInputMessage.userInputMessageContext.toolResults[0].content[0].text,
    origKiroText
  );
});

test("TokenSaverCoordinator - execution for Kiro and Antigravity tool results", () => {
  const kiroBody = {
    model: "antigravity/gemini-3.8-flash",
    messages: [
      { role: "user", content: "git diff" },
      {
        role: "tool",
        tool_call_id: "call_abc",
        content: `diff --git a/a.ts b/a.ts\nindex 000..111 100644\n--- a/a.ts\n+++ b/a.ts\n@@ -1,5 +1,5 @@\n-a\n+b\n` + " context line\n".repeat(25),
      },
    ],
  };

  const summary = TokenSaverCoordinator.process(kiroBody, {
    clientFormat: "openai",
    model: "antigravity/gemini-3.8-flash",
    clientTool: "kiro",
  }, { rtkEnabled: true });

  assert.ok(summary.tokensSaved > 0, "RTK must save tokens for Kiro client");
});

test("TokenSaverCoordinator - fail-open when method throws", () => {
  const faultyMethod: ITokenSaverMethod = {
    id: "faulty_method",
    name: "Faulty Method",
    type: "compressor",
    description: "Method designed to throw",
    process: () => {
      throw new Error("Deliberate method explosion");
    },
  };

  TokenSaverRegistry.register(faultyMethod);

  const testBody = { messages: [{ role: "user", content: "test" }] };
  const summary = TokenSaverCoordinator.process(testBody, {}, {
    faulty_methodEnabled: true,
  } as any);

  assert.ok(summary);
  const faultyRes = summary.results.find((r) => r.methodId === "faulty_method");
  assert.equal(faultyRes?.applied, false);
  assert.ok(faultyRes?.details?.error.includes("Deliberate method explosion"));

  // Clean up
  TokenSaverRegistry.unregister("faulty_method");
});

test("SettingsRepository - tokenSaver settings persistence", () => {
  // 1. Initial defaults
  SettingsRepository.setSetting("tokenSaver", DEFAULT_TOKEN_SAVER_SETTINGS);
  const initial = SettingsRepository.getTokenSaverSettings();
  assert.equal(initial.rtkEnabled, true);
  assert.equal(initial.cavemanEnabled, false);
  assert.equal(initial.cavemanLevel, "lite");
  assert.equal(initial.ponytailEnabled, false);
  assert.equal(initial.ponytailLevel, "lite");

  // 2. Update settings
  const updated = SettingsRepository.setTokenSaverSettings({
    rtkEnabled: true,
    cavemanEnabled: true,
    cavemanLevel: "ultra",
    ponytailEnabled: true,
    ponytailLevel: "full",
  });
  assert.equal(updated.cavemanEnabled, true);
  assert.equal(updated.cavemanLevel, "ultra");
  assert.equal(updated.ponytailEnabled, true);
  assert.equal(updated.ponytailLevel, "full");

  // Verify persistence
  const reloaded = SettingsRepository.getTokenSaverSettings();
  assert.equal(reloaded.cavemanEnabled, true);
  assert.equal(reloaded.cavemanLevel, "ultra");
  assert.equal(reloaded.ponytailEnabled, true);
  assert.equal(reloaded.ponytailLevel, "full");

  // Reset back to defaults
  SettingsRepository.setTokenSaverSettings(DEFAULT_TOKEN_SAVER_SETTINGS);
  assert.equal(SettingsRepository.getTokenSaverSettings().cavemanEnabled, false);
});

test("REST API - /api/settings/token-saver endpoints", async () => {
  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const port = (server.address() as any).port;

  try {
    // 1. GET /api/settings/token-saver
    const getRes = await fetch(`http://127.0.0.1:${port}/api/settings/token-saver`);
    assert.equal(getRes.status, 200);
    const getBody: any = await getRes.json();
    assert.equal(typeof getBody.rtkEnabled, "boolean");

    // 2. PUT /api/settings/token-saver
    const putRes = await fetch(`http://127.0.0.1:${port}/api/settings/token-saver`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        rtkEnabled: true,
        cavemanEnabled: true,
        cavemanLevel: "full",
        ponytailEnabled: false,
        ponytailLevel: "lite",
      }),
    });
    assert.equal(putRes.status, 200);
    const putBody: any = await putRes.json();
    assert.equal(putBody.cavemanEnabled, true);
    assert.equal(putBody.cavemanLevel, "full");

    // 3. GET /api/settings root includes tokenSaver
    const rootRes = await fetch(`http://127.0.0.1:${port}/api/settings`);
    assert.equal(rootRes.status, 200);
    const rootBody: any = await rootRes.json();
    assert.ok(rootBody.tokenSaver);
    assert.equal(rootBody.tokenSaver.cavemanEnabled, true);

    // Reset settings
    SettingsRepository.setTokenSaverSettings(DEFAULT_TOKEN_SAVER_SETTINGS);
  } finally {
    server.close();
  }
});
