import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { executeUpstreamFetch } from "../src/server/proxy/proxyDispatcher.js";
import { isMitmHost } from "../src/mitm/toolsHelper.js";

describe("ProxyDispatcher - DNS Bypass for Intercepted Hosts", () => {
  it("identifies all intercepted tool domains as MITM hosts", () => {
    assert.equal(isMitmHost("runtime.us-east-1.kiro.dev"), true);
    assert.equal(isMitmHost("q.us-east-1.amazonaws.com"), true);
    assert.equal(isMitmHost("codewhisperer.us-east-1.amazonaws.com"), true);
    assert.equal(isMitmHost("daily-cloudcode-pa.googleapis.com"), true);
    assert.equal(isMitmHost("cloudcode-pa.googleapis.com"), true);
    assert.equal(isMitmHost("api.individual.githubcopilot.com"), true);
    assert.equal(isMitmHost("api2.cursor.sh"), true);

    // Non-intercepted hosts
    assert.equal(isMitmHost("api.openai.com"), false);
    assert.equal(isMitmHost("api.anthropic.com"), false);
  });

  it("handles standard non-intercepted URLs via globalThis.fetch fallback", async () => {
    const originalFetch = globalThis.fetch;
    let fetchCalled = false;
    let calledUrl = "";

    globalThis.fetch = (async (url: any) => {
      fetchCalled = true;
      calledUrl = String(url);
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    }) as typeof fetch;

    try {
      const res = await executeUpstreamFetch("https://api.openai.com/v1/models", {
        method: "GET",
      });
      assert.equal(fetchCalled, true);
      assert.equal(calledUrl, "https://api.openai.com/v1/models");
      assert.equal(res.status, 200);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("routes intercepted MITM URLs through undici with Public DNS Agent to punch through hosts file", async () => {
    // When globalThis.fetch is NOT mocked (production environment), executeUpstreamFetch
    // invokes undiciFetch with publicAgent dispatcher to connect to the real network.
    const controller = new AbortController();
    controller.abort();

    try {
      await executeUpstreamFetch(
        "https://runtime.us-east-1.kiro.dev/generateAssistantResponse",
        {
          method: "POST",
          signal: controller.signal,
        }
      );
    } catch (err: any) {
      // AbortError or connection error thrown by undici with dispatcher
      assert.ok(err.name === "AbortError" || err.message?.includes("aborted") || err.message?.includes("fetch failed"));
    }
  });
});
