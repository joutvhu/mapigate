process.env.NODE_ENV = "test";

import test from "node:test";
import assert from "node:assert/strict";
import { pollGlmToken } from "../src/providers/runtime/glm/routes.js";
import { ProviderRepository } from "../src/storage/repositories/providerRepo.js";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

const POLL_PARAMS = { deviceCode: "flow-1", extraData: { _zcodePollToken: "poll-token" } };

async function withFetch(handler: (url: string, init?: any) => Response | Promise<Response>, fn: () => Promise<void>) {
  const orig = globalThis.fetch;
  globalThis.fetch = (async (input: any, init?: any) => handler(String(input), init)) as typeof fetch;
  try {
    await fn();
  } finally {
    globalThis.fetch = orig;
  }
}

test("GLM poll - reads status from the wrapped data object (pending)", () =>
  withFetch(
    () => json({ code: 0, data: { status: "pending" } }),
    async () => {
      const res = await pollGlmToken(POLL_PARAMS);
      assert.equal(res.ok, false);
      assert.equal(res.error, "authorization_pending");
    }
  ));

test("GLM poll - failed flow is reported instead of waiting forever", () =>
  withFetch(
    () => json({ code: 0, data: { status: "failed" } }),
    async () => {
      const res = await pollGlmToken(POLL_PARAMS);
      assert.equal(res.error, "access_denied");
    }
  ));

test("GLM poll - ready flow is converted to a coding-plan API key and saved", () =>
  withFetch(
    (url) => {
      if (url.includes("/oauth/cli/poll/flow-1")) {
        return json({
          code: 0,
          data: { status: "ready", token: "zcode-jwt", user: { name: "Dev", email: "dev@z.ai" }, zai: { access_token: "zai-oauth" } },
        });
      }
      if (url.endsWith("/api/auth/z/login")) return json({ code: 0, data: { access_token: "biz-jwt" } });
      if (url.endsWith("/getCustomerInfo")) {
        return json({
          code: 0,
          data: {
            organizations: [
              {
                organizationId: "org-1",
                organizationName: "默认机构",
                projects: [
                  { projectId: "team-proj", projectName: "team", projectType: "2" },
                  { projectId: "proj-1", projectName: "默认项目", projectType: "1" },
                ],
              },
            ],
          },
        });
      }
      if (url.endsWith("/organization/org-1/projects/proj-1/api_keys")) {
        return json({ code: 0, data: [{ name: "zcode-api-key", apiKey: "ak123" }] });
      }
      if (url.includes("/api_keys/copy/ak123")) return json({ code: 0, data: { secretKey: "sk456" } });
      return new Response("unexpected " + url, { status: 500 });
    },
    async () => {
      const res = await pollGlmToken(POLL_PARAMS);
      assert.equal(res.ok, true);
      assert.equal(res.success, true);
      assert.equal(res.account?.name, "Dev");

      const saved = ProviderRepository.getAccountById(res.account!.id);
      assert.equal(saved?.rawApiKey, "ak123.sk456", "must store the coding-plan key, not the OAuth token");
    }
  ));

test("GLM poll - reports a coding-plan setup failure to the user", () =>
  withFetch(
    (url) => {
      if (url.includes("/oauth/cli/poll/")) {
        return json({ code: 0, data: { status: "ready", zai: { access_token: "zai-oauth" } } });
      }
      return json({ code: 1001, msg: "business login rejected" });
    },
    async () => {
      const res = await pollGlmToken(POLL_PARAMS);
      assert.equal(res.ok, false);
      assert.equal(res.error, "access_denied");
      assert.ok(res.error_description?.includes("business login rejected"));
    }
  ));

test("GLM poll - a dropped network request keeps polling", () =>
  withFetch(
    () => {
      throw new Error("socket hang up");
    },
    async () => {
      const res = await pollGlmToken(POLL_PARAMS);
      assert.equal(res.error, "authorization_pending");
    }
  ));
