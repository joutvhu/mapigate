process.env.NODE_ENV = "test";

import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import {
  zedOAuthHandler,
  parseZedCallbackPayload,
  decryptZedAccessToken,
  decodeZedPrivateKeyVerifier,
} from "../src/providers/runtime/zed/routes.js";

test("Zed OAuth Handler - authorize generates valid RSA keypair and native app url", async () => {
  const res = await zedOAuthHandler.authorize?.({
    provider: "zed",
    redirectUri: "http://localhost:20127/callback",
    appPort: "20127",
  });

  assert.ok(res);
  assert.ok(res.authUrl.includes("https://zed.dev/native_app_signin"));
  assert.ok(res.authUrl.includes("native_app_port=20127"));
  assert.ok(res.authUrl.includes("native_app_public_key="));
  assert.ok(res.codeVerifier);
  assert.ok(res.state);
});

test("Zed OAuth Handler - parseZedCallbackPayload parses root redirect URL", () => {
  const url = "http://127.0.0.1:20127/?user_id=usr_456&access_token=enc_tok_789";
  const parsed = parseZedCallbackPayload(url);
  assert.equal(parsed.userId, "usr_456");
  assert.equal(parsed.encryptedAccessToken, "enc_tok_789");
});

test("Zed OAuth Handler - RSA encryption and decryption round-trip", () => {
  const { publicKey, privateKey } = crypto.generateKeyPairSync("rsa", {
    modulusLength: 2048,
    publicKeyEncoding: { type: "pkcs1", format: "der" },
    privateKeyEncoding: { type: "pkcs1", format: "pem" },
  });

  const rawSecret = "zed_secret_token_abcdef123456";
  const encryptedBuf = crypto.publicEncrypt(
    { key: crypto.createPublicKey({ key: publicKey, format: "der", type: "pkcs1" }), padding: crypto.constants.RSA_PKCS1_OAEP_PADDING, oaepHash: "sha256" },
    Buffer.from(rawSecret, "utf8")
  );
  const encryptedB64 = encryptedBuf.toString("base64url");

  const verifier = `zed-rsa-pkcs1:${Buffer.from(privateKey).toString("base64url")}`;
  const decrypted = decryptZedAccessToken(encryptedB64, verifier);
  assert.equal(decrypted, rawSecret);
});

test("Zed OAuth Handler - exchange decrypts and adds account", async () => {
  const { publicKey, privateKey } = crypto.generateKeyPairSync("rsa", {
    modulusLength: 2048,
    publicKeyEncoding: { type: "pkcs1", format: "der" },
    privateKeyEncoding: { type: "pkcs1", format: "pem" },
  });

  const rawSecret = "zed_live_access_token_123";
  const encryptedBuf = crypto.publicEncrypt(
    { key: crypto.createPublicKey({ key: publicKey, format: "der", type: "pkcs1" }), padding: crypto.constants.RSA_PKCS1_OAEP_PADDING, oaepHash: "sha256" },
    Buffer.from(rawSecret, "utf8")
  );
  const encryptedB64 = encryptedBuf.toString("base64url");
  const verifier = `zed-rsa-pkcs1:${Buffer.from(privateKey).toString("base64url")}`;

  const origFetch = globalThis.fetch;
  try {
    globalThis.fetch = async (input: any) => {
      const url = String(input);
      if (url.includes("/client/users/me")) {
        return new Response(
          JSON.stringify({
            name: "Zed Tester",
            email: "tester@zed.dev",
            organizations: [{ id: "org_1", is_personal: true }],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      }
      return new Response("Not found", { status: 404 });
    };

    const callbackUrl = `http://127.0.0.1:20127/?user_id=12345&access_token=${encryptedB64}`;
    const result = await zedOAuthHandler.exchange?.({
      provider: "zed",
      code: callbackUrl,
      codeVerifier: verifier,
      redirectUri: "http://localhost:20127/callback",
    });

    assert.ok(result);
    assert.equal(result.success, true);
    assert.ok(result.account?.id);
    assert.equal(result.account?.name, "Zed Tester");
  } finally {
    globalThis.fetch = origFetch;
  }
});

test("ZedProvider - probeModels verifies credentials via /client/users/me", async () => {
  const { ZedProvider } = await import("../src/providers/runtime/zed/provider.js");
  const provider = new ZedProvider();

  // 1. Missing token
  const noToken = await provider.probeModels({} as any);
  assert.equal(noToken?.success, false);
  assert.ok(noToken?.error?.includes("required"));

  // 2. Valid token mock
  const origFetch = globalThis.fetch;
  let sentAuthHeader = "";
  try {
    globalThis.fetch = async (input: any, init?: any) => {
      const url = String(input);
      sentAuthHeader = init?.headers?.Authorization || "";
      if (url.includes("/client/users/me")) {
        return new Response(
          JSON.stringify({ name: "Active Zed User", email: "user@zed.dev" }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      }
      return new Response("Not found", { status: 404 });
    };

    const res = await provider.probeModels({
      apiKey: "decrypted_token_xyz",
      providerSpecificData: {
        userId: "user_789",
        systemId: "sys_123",
      },
    } as any);

    assert.equal(res?.success, true);
    assert.equal(sentAuthHeader, "user_789 decrypted_token_xyz");
    assert.ok((res?.count || 0) > 0);
  } finally {
    globalThis.fetch = origFetch;
  }
});
