process.env.NODE_ENV = "test";

import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import app from "../src/server/index.js";
import { ComboRepository } from "../src/storage/repositories/comboRepo.js";
import { ProviderRepository } from "../src/storage/repositories/providerRepo.js";
import { RequestDetailsRepository, flushRequestDetailsBuffer } from "../src/storage/repositories/requestDetailsRepo.js";
import { UsageRepository } from "../src/storage/repositories/usageRepo.js";
import { getDatabase } from "../src/storage/database.js";

test("Combo Usage & Analytics - records actual target provider and model on failure", async () => {
  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", () => resolve()));
  const address = server.address() as { port: number };
  const baseUrl = `http://127.0.0.1:${address.port}`;

  const suffix = Date.now();
  const testComboName = `combo-analytics-${suffix}`;
  const mockTargetProv = `mock_prov_${suffix}`;
  const mockTargetModel = `smart-model-${suffix}`;

  try {
    // 1. Setup Combo with a mock provider
    ComboRepository.saveCombo({
      name: testComboName,
      models: [`${mockTargetProv}/${mockTargetModel}`],
      strategy: "fallback",
      isActive: true,
    });

    ProviderRepository.saveProvider({
      id: mockTargetProv,
      name: "Mock Provider for Combo",
      baseUrl: "https://api.mock.test/v1",
      format: "openai",
      isActive: true,
    });

    // 2. Call the combo - will fail upstream because URL is fake, but must record target provider & model
    const res = await fetch(`${baseUrl}/v1/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: testComboName,
        messages: [{ role: "user", content: "Test combo analytics" }],
      }),
    });

    assert.ok([500, 502, 503].includes(res.status));

    // 3. Verify request_logs
    const db = getDatabase();
    const rows = db.all<{
      provider_id: string;
      requested_model: string;
      actual_model: string;
      status: string;
    }>(
      "SELECT provider_id, requested_model, actual_model, status FROM request_logs WHERE requested_model = ? ORDER BY timestamp DESC LIMIT 1",
      testComboName
    );

    assert.equal(rows.length, 1, "Should have saved log entry for combo request");
    assert.equal(rows[0].provider_id, mockTargetProv, "provider_id must be the actual target provider, not 'combo'");
    assert.equal(rows[0].actual_model, mockTargetModel, "actual_model must be the actual target model");
    assert.equal(rows[0].requested_model, testComboName, "requested_model must preserve the requested combo name");

    // 4. Verify request_details
    flushRequestDetailsBuffer();
    const details = RequestDetailsRepository.getRequestDetails({
      provider: mockTargetProv,
      pageSize: 10,
    });
    assert.ok(details.details.length >= 1, "Request details must record actual target provider");
    const matchedDetail = details.details.find((d) => d.model === mockTargetModel);
    assert.ok(matchedDetail, "Request details must record actual target model");
    assert.equal(matchedDetail.provider, mockTargetProv);

    // 5. Verify UsageRepository.getUsageStats breakdown
    const stats = UsageRepository.getUsageStats("24h");
    assert.ok(stats.byProvider[mockTargetProv], "Usage stats byProvider must attribute to actual target provider");
    assert.ok(
      stats.byModel[`${mockTargetModel} (${mockTargetProv})`],
      "Usage stats byModel must attribute to actual target model and provider"
    );

    const recent = stats.recentRequests.find((r) => r.requestedModel === testComboName);
    assert.ok(recent, "Recent requests must list the request");
    assert.equal(recent.model, mockTargetModel);
    assert.equal(recent.provider, mockTargetProv);
  } finally {
    ComboRepository.deleteCombo(testComboName);
    ProviderRepository.deleteProvider(mockTargetProv);
    server.close();
  }
});

test("Combo Usage & Analytics - records actual target provider and model on success", async () => {
  // Create an upstream mock server that answers 200 OK
  const upstreamServer = http.createServer((req, res) => {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(
      JSON.stringify({
        id: "chatcmpl-mock-success",
        object: "chat.completion",
        created: Math.floor(Date.now() / 1000),
        model: "upstream-model",
        choices: [
          {
            index: 0,
            message: { role: "assistant", content: "Hello from mock upstream!" },
            finish_reason: "stop",
          },
        ],
        usage: {
          prompt_tokens: 15,
          completion_tokens: 25,
          total_tokens: 40,
        },
      })
    );
  });

  await new Promise<void>((resolve) => upstreamServer.listen(0, "127.0.0.1", () => resolve()));
  const upstreamAddress = upstreamServer.address() as { port: number };
  const upstreamBaseUrl = `http://127.0.0.1:${upstreamAddress.port}`;

  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", () => resolve()));
  const address = server.address() as { port: number };
  const baseUrl = `http://127.0.0.1:${address.port}`;

  const suffix = Date.now();
  const testComboName = `combo-succ-${suffix}`;
  const mockTargetProv = `prov_succ_${suffix}`;
  const mockTargetModel = `model_succ_${suffix}`;
  const testAccId = `acc_succ_${suffix}`;

  try {
    ProviderRepository.saveProvider({
      id: mockTargetProv,
      name: "Mock Success Provider",
      baseUrl: upstreamBaseUrl,
      format: "openai",
      isActive: true,
    });

    ProviderRepository.addAccount({
      id: testAccId,
      providerId: mockTargetProv,
      name: "Mock Success Account",
      rawApiKey: "sk-mock-key-12345",
    });

    ComboRepository.saveCombo({
      name: testComboName,
      models: [`${mockTargetProv}/${mockTargetModel}`],
      strategy: "fallback",
      isActive: true,
    });

    const res = await fetch(`${baseUrl}/v1/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: testComboName,
        messages: [{ role: "user", content: "Hello success combo" }],
        stream: false,
      }),
    });

    assert.equal(res.status, 200);
    const resJson = (await res.json()) as any;
    assert.equal(resJson.choices[0].message.content, "Hello from mock upstream!");

    // Verify request_logs has target provider and target model
    const db = getDatabase();
    const rows = db.all<{
      provider_id: string;
      requested_model: string;
      actual_model: string;
      status: string;
      prompt_tokens: number;
      completion_tokens: number;
    }>(
      "SELECT provider_id, requested_model, actual_model, status, prompt_tokens, completion_tokens FROM request_logs WHERE requested_model = ? ORDER BY timestamp DESC LIMIT 1",
      testComboName
    );

    assert.equal(rows.length, 1);
    assert.equal(rows[0].provider_id, mockTargetProv, "Must record actual target provider on success");
    assert.equal(rows[0].actual_model, mockTargetModel, "Must record actual target model on success");
    assert.equal(rows[0].requested_model, testComboName, "Must preserve combo requested model");
    assert.equal(rows[0].status, "success");
    assert.equal(rows[0].prompt_tokens, 15);
    assert.equal(rows[0].completion_tokens, 25);

    // Verify stats
    const stats = UsageRepository.getUsageStats("24h");
    assert.ok(stats.byProvider[mockTargetProv]);
    assert.equal(stats.byProvider[mockTargetProv].requests, 1);
    assert.equal(stats.byProvider[mockTargetProv].promptTokens, 15);
    assert.equal(stats.byProvider[mockTargetProv].completionTokens, 25);

    assert.ok(stats.byModel[`${mockTargetModel} (${mockTargetProv})`]);
    assert.equal(stats.byModel[`${mockTargetModel} (${mockTargetProv})`].requests, 1);
  } finally {
    ComboRepository.deleteCombo(testComboName);
    ProviderRepository.deleteProvider(mockTargetProv);
    server.close();
    upstreamServer.close();
  }
});
