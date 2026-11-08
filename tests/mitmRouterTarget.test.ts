import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { MitmRepository } from "../src/storage/repositories/mitmRepo.js";
import { getRouterTarget, getRouterBaseUrl } from "../src/mitm/handlers/base.js";

describe("MITM Router Target Configuration", () => {
  beforeEach(() => {
    delete process.env.MAPIGATE_BASE_URL;
    delete process.env.ROUTER_API_KEY;
    MitmRepository.setRouterTarget({ baseUrl: "", apiKey: "" });
  });

  it("defaults to local gateway when unconfigured", () => {
    const target = MitmRepository.getRouterTarget();
    assert.equal(target.baseUrl, "");
    assert.equal(target.isRemote, false);
    assert.equal(target.apiKey, undefined);

    const runtimeTarget = getRouterTarget();
    assert.equal(runtimeTarget.isRemote, false);
    assert.match(runtimeTarget.baseUrl, /^http:\/\/(127\.0\.0\.1|localhost):\d+$/);
  });

  it("saves and retrieves remote router base URL and encrypted API key", () => {
    const remoteUrl = "http://192.168.1.150:20128";
    const secretKey = "sk-rt-secret123456";

    MitmRepository.setRouterTarget({
      baseUrl: remoteUrl,
      apiKey: secretKey,
    });

    const target = MitmRepository.getRouterTarget();
    assert.equal(target.baseUrl, remoteUrl);
    assert.equal(target.isRemote, true);
    assert.equal(target.apiKey, secretKey);

    const runtimeTarget = getRouterTarget();
    assert.equal(runtimeTarget.baseUrl, remoteUrl);
    assert.equal(runtimeTarget.isRemote, true);
    assert.equal(runtimeTarget.authHeader, `Bearer ${secretKey}`);
    assert.equal(getRouterBaseUrl(), remoteUrl);
  });

  it("allows setting dedicated API key for local gateway without remote flag", () => {
    const dedicatedLocalKey = "sk-rt-localmitm";
    MitmRepository.setRouterTarget({
      baseUrl: "http://127.0.0.1:20128",
      apiKey: dedicatedLocalKey,
    });

    const target = MitmRepository.getRouterTarget();
    assert.equal(target.isRemote, false);
    assert.equal(target.apiKey, dedicatedLocalKey);

    const runtimeTarget = getRouterTarget();
    assert.equal(runtimeTarget.isRemote, false);
    assert.equal(runtimeTarget.authHeader, `Bearer ${dedicatedLocalKey}`);
  });

  it("respects process.env.MAPIGATE_BASE_URL override above database settings", () => {
    MitmRepository.setRouterTarget({
      baseUrl: "http://192.168.1.150:20128",
      apiKey: "db-key",
    });

    process.env.MAPIGATE_BASE_URL = "http://10.0.0.2:20128";
    process.env.ROUTER_API_KEY = "env-key";

    const runtimeTarget = getRouterTarget();
    assert.equal(runtimeTarget.baseUrl, "http://10.0.0.2:20128");
    assert.equal(runtimeTarget.authHeader, "Bearer env-key");
    assert.equal(runtimeTarget.isRemote, true);
  });
});
