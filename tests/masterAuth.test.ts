process.env.NODE_ENV = "test";

import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import app from "../src/server/index.js";
import { SettingsRepository } from "../src/storage/repositories/settingsRepo.js";
import { MasterAuth } from "../src/server/auth/masterAuth.js";

test("Unit - MasterAuth hashing, verification, tokens, and invalidation", () => {
  // Ensure clean state
  SettingsRepository.clearMasterPassword();
  assert.equal(MasterAuth.isPasswordSet(), false);

  // Hash password
  const { hash, salt, algorithm } = MasterAuth.hashPassword("my-secret-master-pwd");
  assert.equal(algorithm, "scrypt");
  assert.ok(hash.length > 0);
  assert.ok(salt.length > 0);

  // Set password
  MasterAuth.setPassword("my-secret-master-pwd");
  assert.equal(MasterAuth.isPasswordSet(), true);

  // Password verification
  assert.equal(MasterAuth.verifyPassword("my-secret-master-pwd"), true);
  assert.equal(MasterAuth.verifyPassword("wrong-password"), false);
  assert.equal(MasterAuth.verifyPassword(""), false);

  // Token creation & verification
  const token = MasterAuth.createSessionToken();
  assert.ok(typeof token === "string" && token.length > 0);
  assert.equal(MasterAuth.verifySessionToken(token), true);
  assert.equal(MasterAuth.verifySessionToken("invalid:token:format"), false);

  // Token invalidation on password change
  const successChange = MasterAuth.changePassword("my-secret-master-pwd", "new-secret-master-pwd-2");
  assert.equal(successChange, true);
  assert.equal(MasterAuth.verifyPassword("new-secret-master-pwd-2"), true);
  assert.equal(MasterAuth.verifyPassword("my-secret-master-pwd"), false);

  // Old token is now invalid because updatedAt changed!
  assert.equal(MasterAuth.verifySessionToken(token), false);

  // New token is valid
  const newToken = MasterAuth.createSessionToken();
  assert.equal(MasterAuth.verifySessionToken(newToken), true);

  // Token invalidation on password removal
  const successRemove = MasterAuth.removePassword("new-secret-master-pwd-2");
  assert.equal(successRemove, true);
  assert.equal(MasterAuth.isPasswordSet(), false);
});

test("Integration - Master Password API and Route Protection Lifecycle", async () => {
  // Clean initial state
  SettingsRepository.clearMasterPassword();

  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", () => resolve()));
  const address = server.address() as { port: number };
  const baseUrl = `http://127.0.0.1:${address.port}`;

  try {
    // 1. Initial State: No master password configured
    const initialStatusRes = await fetch(`${baseUrl}/api/auth/status`);
    assert.equal(initialStatusRes.status, 200);
    const initialStatus = (await initialStatusRes.json()) as any;
    assert.equal(initialStatus.enabled, false);
    assert.equal(initialStatus.authenticated, true);

    // Unauthenticated access to /api/models passes freely when no password set
    const modelsResNoAuth = await fetch(`${baseUrl}/api/models`);
    assert.equal(modelsResNoAuth.status, 200);

    // 2. Setup Master Password
    const setupRes = await fetch(`${baseUrl}/api/auth/setup`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password: "pass" }), // min 4 chars
    });
    assert.equal(setupRes.status, 200);
    const setupData = (await setupRes.json()) as any;
    assert.equal(setupData.success, true);
    assert.ok(setupData.token);
    const initialSessionToken = setupData.token;

    // Subsequent setup attempt rejected
    const dupSetupRes = await fetch(`${baseUrl}/api/auth/setup`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password: "pass2" }),
    });
    assert.equal(dupSetupRes.status, 400);

    // 3. Status checks
    const statusNoTokenRes = await fetch(`${baseUrl}/api/auth/status`);
    assert.equal(statusNoTokenRes.status, 200);
    const statusNoToken = (await statusNoTokenRes.json()) as any;
    assert.equal(statusNoToken.enabled, true);
    assert.equal(statusNoToken.authenticated, false);

    const statusWithTokenRes = await fetch(`${baseUrl}/api/auth/status`, {
      headers: { Authorization: `Bearer ${initialSessionToken}` },
    });
    assert.equal(statusWithTokenRes.status, 200);
    const statusWithToken = (await statusWithTokenRes.json()) as any;
    assert.equal(statusWithToken.enabled, true);
    assert.equal(statusWithToken.authenticated, true);

    // 4. Invariant: Proxy routes (/v1/*) are NEVER blocked by master password!
    const v1ModelsRes = await fetch(`${baseUrl}/v1/models`);
    assert.equal(v1ModelsRes.status, 200);

    // 5. Management API routes (/api/*) are guarded
    // Without token -> 401 AUTH_REQUIRED
    const modelsBlockedRes = await fetch(`${baseUrl}/api/models`);
    assert.equal(modelsBlockedRes.status, 401);
    const blockedData = (await modelsBlockedRes.json()) as any;
    assert.equal(blockedData.code, "AUTH_REQUIRED");

    // With invalid token -> 401
    const modelsBadTokenRes = await fetch(`${baseUrl}/api/models`, {
      headers: { Authorization: "Bearer bad-token-1234" },
    });
    assert.equal(modelsBadTokenRes.status, 401);

    // With valid token -> 200
    const modelsAuthRes = await fetch(`${baseUrl}/api/models`, {
      headers: { Authorization: `Bearer ${initialSessionToken}` },
    });
    assert.equal(modelsAuthRes.status, 200);

    // 6. Login endpoint
    // Bad password
    const loginFailRes = await fetch(`${baseUrl}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password: "wrong-password" }),
    });
    assert.equal(loginFailRes.status, 401);

    // Correct password
    const loginOkRes = await fetch(`${baseUrl}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password: "pass" }),
    });
    assert.equal(loginOkRes.status, 200);
    const loginData = (await loginOkRes.json()) as any;
    assert.equal(loginData.success, true);
    assert.ok(loginData.token);
    const loginToken = loginData.token;

    // 7. Change Password
    const changeFailRes = await fetch(`${baseUrl}/api/auth/change-password`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${loginToken}`,
      },
      body: JSON.stringify({ currentPassword: "wrong", newPassword: "new-super-password" }),
    });
    assert.equal(changeFailRes.status, 401);

    const changeOkRes = await fetch(`${baseUrl}/api/auth/change-password`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${loginToken}`,
      },
      body: JSON.stringify({ currentPassword: "pass", newPassword: "new-super-password" }),
    });
    assert.equal(changeOkRes.status, 200);
    const changeData = (await changeOkRes.json()) as any;
    assert.equal(changeData.success, true);
    assert.ok(changeData.token);
    const newSessionToken = changeData.token;

    // Verify older tokens are now INVALIDATED
    const oldTokenBlockedRes = await fetch(`${baseUrl}/api/models`, {
      headers: { Authorization: `Bearer ${loginToken}` },
    });
    assert.equal(oldTokenBlockedRes.status, 401);

    // New token works
    const newTokenOkRes = await fetch(`${baseUrl}/api/models`, {
      headers: { Authorization: `Bearer ${newSessionToken}` },
    });
    assert.equal(newTokenOkRes.status, 200);

    // 8. Remove Password
    const removeFailRes = await fetch(`${baseUrl}/api/auth/remove-password`, {
      method: "DELETE",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${newSessionToken}`,
      },
      body: JSON.stringify({ currentPassword: "wrong-password" }),
    });
    assert.equal(removeFailRes.status, 401);

    const removeOkRes = await fetch(`${baseUrl}/api/auth/remove-password`, {
      method: "DELETE",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${newSessionToken}`,
      },
      body: JSON.stringify({ currentPassword: "new-super-password" }),
    });
    assert.equal(removeOkRes.status, 200);

    // 9. Verify restored to zero barrier
    const finalStatusRes = await fetch(`${baseUrl}/api/auth/status`);
    const finalStatus = (await finalStatusRes.json()) as any;
    assert.equal(finalStatus.enabled, false);
    assert.equal(finalStatus.authenticated, true);

    const finalModelsRes = await fetch(`${baseUrl}/api/models`);
    assert.equal(finalModelsRes.status, 200);
  } finally {
    SettingsRepository.clearMasterPassword();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});
