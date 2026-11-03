import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import app from "../src/server/index.js";
import { ProviderRepository } from "../src/storage/repositories/providerRepo.js";
import { SettingsRepository } from "../src/storage/repositories/settingsRepo.js";
import { isHostPatternMatch, DEFAULT_ALLOWED_HOSTS } from "../src/shared/utils/security.js";

function rawHttpRequest(options: {
  port: number;
  path: string;
  method?: string;
  headers?: Record<string, string>;
  body?: string;
}): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        hostname: "127.0.0.1",
        port: options.port,
        path: options.path,
        method: options.method || "GET",
        headers: options.headers,
      },
      (res) => {
        let data = "";
        res.on("data", (chunk) => {
          data += chunk;
        });
        res.on("end", () => {
          resolve({ status: res.statusCode || 0, body: data });
        });
      }
    );
    req.on("error", reject);
    if (options.body) {
      req.write(options.body);
    }
    req.end();
  });
}

test("Security - Host header validation rejects DNS rebinding attacks", async () => {
  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", () => resolve()));
  const port = (server.address() as any).port;

  try {
    // 1. Untrusted foreign Host header -> HTTP 403
    const rebindingRes = await rawHttpRequest({
      port,
      path: "/health",
      headers: {
        host: "evil.attacker.com",
      },
    });
    assert.equal(rebindingRes.status, 403);
    const body = JSON.parse(rebindingRes.body);
    assert.equal(body.error?.code, "untrusted_host");

    // 2. Valid loopback Host header -> HTTP 200
    const validRes = await rawHttpRequest({
      port,
      path: "/health",
      headers: {
        host: `127.0.0.1:${port}`,
      },
    });
    assert.equal(validRes.status, 200);
  } finally {
    server.close();
  }
});

test("Security - Host header pattern matching verifies LAN and custom patterns", () => {
  assert.equal(typeof DEFAULT_ALLOWED_HOSTS, "string");
  assert.ok(isHostPatternMatch("192.168.*", "192.168.1.100"));
  assert.ok(isHostPatternMatch("10.*", "10.0.0.1"));
  assert.ok(isHostPatternMatch("172.16-31.*", "172.20.0.50"));
  assert.ok(isHostPatternMatch("*.local", "my-macbook.local"));
  assert.ok(isHostPatternMatch("my-pc.internal", "my-pc.internal"));
  assert.equal(isHostPatternMatch("192.168.*", "evil.attacker.com"), false);
  assert.equal(isHostPatternMatch("10.*", "8.8.8.8"), false);
});

test("Security - Sensitive OAuth and custom tokens are masked in apiProviders", async () => {
  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", () => resolve()));
  const port = (server.address() as any).port;

  const testProvId = `test-mask-prov-${Date.now()}`;
  ProviderRepository.saveProvider({
    id: testProvId,
    name: "Test Mask Provider",
    baseUrl: "https://api.test.com/v1",
    format: "openai",
    priority: 1,
    models: ["test-m1"],
    isActive: true,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  });

  const testAccId = `test-mask-acc-${Date.now()}`;
  ProviderRepository.addAccount({
    id: testAccId,
    providerId: testProvId,
    name: "OAuth Tokens Account",
    rawApiKey: "sk-plain-test-key",
    providerSpecificData: {
      email: "engineer@example.com",
      refreshToken: "secret-refresh-987",
      accessToken: "secret-access-654",
      copilotToken: "secret-copilot-321",
      githubAccessToken: "gho_secret123",
      zcodeJwtToken: "jwt.secret.token",
      clientSecret: "client-secret-xyz",
      expiresAt: 9999999999,
    },
  });

  try {
    const res = await fetch(`http://127.0.0.1:${port}/api/providers/${testProvId}`);
    assert.equal(res.status, 200);
    const data = (await res.json()) as any;
    const acc = data.accounts.find((a: any) => a.id === testAccId);
    assert.ok(acc, "Account must be present in response");

    const psd = acc.providerSpecificData;
    assert.equal(psd.email, "engineer@example.com");
    assert.equal(psd.expiresAt, 9999999999);
    assert.equal(psd.refreshToken, "••••••••");
    assert.equal(psd.accessToken, "••••••••");
    assert.equal(psd.copilotToken, "••••••••");
    assert.equal(psd.githubAccessToken, "••••••••");
    assert.equal(psd.zcodeJwtToken, "••••••••");
    assert.equal(psd.clientSecret, "••••••••");
  } finally {
    server.close();
  }
});

test("Security - MITM hosts endpoint rejects non-loopback IPs and unauthorized domains", async () => {
  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", () => resolve()));
  const port = (server.address() as any).port;

  try {
    // 1. Non-loopback IP injection -> HTTP 400
    const nonLoopbackRes = await fetch(`http://127.0.0.1:${port}/api/mitm/hosts/kiro`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ entries: "1.2.3.4 api.kiro.ai" }),
    });
    assert.equal(nonLoopbackRes.status, 400);
    const err1 = (await nonLoopbackRes.json()) as any;
    assert.match(err1.error, /loopback IP/i);

    // 2. Unauthorized domain for kiro -> HTTP 400
    const foreignDomainRes = await fetch(`http://127.0.0.1:${port}/api/mitm/hosts/kiro`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ entries: "127.0.0.1 evil-bank.com" }),
    });
    assert.equal(foreignDomainRes.status, 400);
    const err2 = (await foreignDomainRes.json()) as any;
    assert.match(err2.error, /Unauthorized host/i);

    // 3. Valid loopback + authorized tool domain -> HTTP 200
    const validRes = await fetch(`http://127.0.0.1:${port}/api/mitm/hosts/kiro`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ entries: "127.0.0.1 q.us-east-1.amazonaws.com" }),
    });
    assert.equal(validRes.status, 200);
    const okData = (await validRes.json()) as any;
    assert.equal(okData.success, true);
  } finally {
    server.close();
  }
});

test("Security - Generic PATCH /api/settings cannot tamper with master password", async () => {
  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", () => resolve()));
  const port = (server.address() as any).port;

  // Set an initial setting
  SettingsRepository.setMasterPasswordConfig({
    enabled: true,
    hash: "initial-hash",
    salt: "initial-salt",
    algorithm: "scrypt",
    updatedAt: Date.now(),
  });

  try {
    // Attempt to disable master password via generic PATCH
    await fetch(`http://127.0.0.1:${port}/api/settings`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        masterPassword: { enabled: false, hash: undefined },
      }),
    });

    const cfg = SettingsRepository.getMasterPasswordConfig();
    assert.equal(cfg.enabled, true, "masterPassword must not be modified via generic settings PATCH");
    assert.equal(cfg.hash, "initial-hash");
  } finally {
    SettingsRepository.clearMasterPassword();
    server.close();
  }
});
