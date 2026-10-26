import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { ProviderRepository } from "../src/storage/repositories/providerRepo.js";
import { importAccessToken, importAccount } from "../src/providers/runtime/kiro/routes.js";
import { normalizeKiroExternalIdpAuth, importExternalIdpAccount } from "../src/providers/runtime/kiro/externalIdp.js";
import { KiroProvider } from "../src/providers/runtime/kiro/provider.js";
import { pollKiroDeviceToken } from "../src/providers/runtime/kiro/deviceFlow.js";
import { getDatabase } from "../src/storage/database.js";

describe("Kiro Education & Direct Access Token Connections", () => {
  beforeEach(() => {
    const db = getDatabase();
    db.run("DELETE FROM provider_accounts WHERE provider_id = 'kiro'");
  });

  it("successfully imports a direct Access Token (aoa...)", () => {
    const token = "aoaAAAAAGrff2cpMba_sample_test_access_token";
    const res = importAccessToken({
      accessToken: token,
      name: "My Student Kiro",
      region: "us-east-1",
      expiresIn: 3600,
    });

    assert.equal(res.success, true);
    assert.ok(res.id);

    const accounts = ProviderRepository.getAccountsByProvider("kiro");
    assert.equal(accounts.length, 1);
    assert.equal(accounts[0].name, "My Student Kiro");
    assert.equal(accounts[0].rawApiKey, token);
    assert.equal(accounts[0].providerSpecificData?.authMethod, "builder-id");
    assert.equal(accounts[0].providerSpecificData?.region, "us-east-1");
  });

  it("normalizes and imports External IDP (CLIProxyAPI JSON / Microsoft) auth", () => {
    const mockJson = {
      auth_method: "external_idp",
      access_token: "aoaAAAAAG_edu_token_xyz",
      refresh_token: "mock_refresh_token_abc",
      client_id: "client-id-12345",
      token_endpoint: "https://login.microsoftonline.com/tenant-id/oauth2/v2.0/token",
      profile_arn: "arn:aws:codewhisperer:us-east-1:123456789012:profile/PROFILENAMEXYZ",
      scopes: "https://service.codewhisperer.amazonaws.com/.default offline_access",
      region: "us-east-1",
      email: "student@university.edu",
    };

    const norm = normalizeKiroExternalIdpAuth(mockJson);
    assert.equal(norm.accessToken, "aoaAAAAAG_edu_token_xyz");
    assert.equal(norm.refreshToken, "mock_refresh_token_abc");
    assert.equal(norm.authMethod, "external_idp");
    assert.equal(norm.email, "student@university.edu");

    const res = importExternalIdpAccount(mockJson);
    assert.equal(res.success, true);

    const accounts = ProviderRepository.getAccountsByProvider("kiro");
    assert.equal(accounts.length, 1);
    assert.equal(accounts[0].providerSpecificData?.authMethod, "external_idp");
    assert.equal(accounts[0].providerSpecificData?.profileArn, mockJson.profile_arn);
    assert.equal(accounts[0].providerSpecificData?.tokenEndpoint, mockJson.token_endpoint);
  });

  it("KiroProvider injects correct headers and target URL for external_idp accounts", async () => {
    const kiro = new KiroProvider();
    const account = {
      id: "acc_test_edu",
      providerId: "kiro",
      name: "Student Account",
      rawApiKey: "aoaAAAAAG_edu_token",
      providerSpecificData: {
        authMethod: "external_idp",
        profileArn: "arn:aws:codewhisperer:us-east-1:123456789012:profile/PROFILE_1",
        region: "us-east-1",
      },
    };

    const url = kiro.buildUrl({
      account,
      targetModel: "claude-sonnet-4.5",
    } as any);

    assert.equal(url, "https://codewhisperer.us-east-1.amazonaws.com/generateAssistantResponse");

    const headers = await kiro.buildHeaders({
      account,
      targetModel: "claude-sonnet-4.5",
    } as any);

    assert.equal(headers["TokenType"], "EXTERNAL_IDP");
    assert.equal(headers["x-amzn-codewhisperer-profile-arn"], "arn:aws:codewhisperer:us-east-1:123456789012:profile/PROFILE_1");
    assert.equal(headers["Authorization"], "Bearer aoaAAAAAG_edu_token");
    assert.equal(headers["x-amz-sso-bearer"], "aoaAAAAAG_edu_token");
    assert.equal(headers["x-amzn-kiro-agent-mode"], "spec");
  });

  it("importAccount automatically falls back to importAccessToken when only accessToken is passed", () => {
    const res = importAccount({
      accessToken: "aoaAAAAAG_single_access_token",
      name: "Direct Token Fallback",
      region: "us-east-1",
    });

    assert.equal(res.success, true);
    const accounts = ProviderRepository.getAccountsByProvider("kiro");
    assert.equal(accounts.length, 1);
    assert.equal(accounts[0].rawApiKey, "aoaAAAAAG_single_access_token");
  });

  it("preserves custom Account Label in Device Code flow", async () => {
    const fakeTokenResponse = {
      accessToken: "aoaAAAAAG_mock_access",
      refreshToken: "aorAAAAAG_mock_refresh",
      expiresIn: 3600,
    };

    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async () => ({
      ok: true,
      json: async () => fakeTokenResponse,
    })) as any;

    try {
      const res = await pollKiroDeviceToken({
        deviceCode: "mock-code",
        extraData: {
          _clientId: "mock-client",
          _clientSecret: "mock-secret",
          _region: "us-east-1",
          _authMethod: "builder-id",
          _startUrl: "https://view.awsapps.com/start",
          _name: "My Custom Builder Account",
        },
      });

      assert.equal(res.ok, true);
      assert.equal(res.account?.name, "My Custom Builder Account");

      const accounts = ProviderRepository.getAccountsByProvider("kiro");
      assert.equal(accounts.length, 1);
      assert.equal(accounts[0].name, "My Custom Builder Account");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
