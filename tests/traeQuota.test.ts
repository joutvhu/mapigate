process.env.NODE_ENV = "test";

import test from "node:test";
import assert from "node:assert/strict";
import { parseTraeEntitlementResponse, getTraeUsage } from "../src/providers/runtime/trae/quota.js";
import { TraeProvider } from "../src/providers/runtime/trae/provider.js";

const SAMPLE_ENTITLEMENT_RESPONSE = {
  billing_version: 3,
  is_dollar_usage_billing: true,
  is_pay_freshman: true,
  trial_status: {
    is_eligible_for_trial: false,
    is_in_trial: false,
    trial_end_time: 1793566430,
  },
  user_entitlement_pack_list: [
    {
      display_desc: "Free plan",
      entitlement_base_info: {
        charge_amount: 0,
        currency: 0,
        end_time: 1796083199,
        ent_status: 0,
        entitlement_id: "free_utc202611_7702566887825261589",
        product_extra: {
          subscription_extra: {
            period_type: 0,
            quota: {
              advanced_model_request_limit: 1000,
              auto_completion_limit: 5000,
              basic_usage_limit: 1,
              bonus_usage_limit: 0,
              credits_limit: 0,
              enable_solo_agent: true,
              enable_solo_builder: true,
              enable_solo_coder: true,
              enable_solo_lite: true,
              enable_solo_web: true,
              no_bonus_quota: true,
              premium_model_fast_request_limit: 10,
              premium_model_slow_request_limit: 50,
              solo_agent_parallel_limit: 2,
            },
          },
        },
        product_id: 0,
        product_type: 0,
        quota: {
          advanced_model_request_limit: 1000,
          auto_completion_limit: 5000,
          basic_usage_limit: 1,
          bonus_usage_limit: 0,
          credits_limit: 0,
          enable_solo_agent: true,
          enable_solo_builder: true,
          enable_solo_coder: true,
          enable_solo_lite: true,
          enable_solo_web: true,
          no_bonus_quota: true,
          premium_model_fast_request_limit: 10,
          premium_model_slow_request_limit: 50,
          solo_agent_parallel_limit: 2,
        },
        start_time: 1793491200,
        user_id: "7702566887825261589",
      },
      expire_time: 0,
      is_hide: false,
      is_last_period: false,
      next_billing_time: 0,
      source_id: "",
      status: 1,
      usage: {
        basic_usage_amount: 0,
        bonus_usage_amount: 0,
        credits_amount: 0,
        is_flash_consuming: true,
      },
      yearly_expire_time: 0,
    },
  ],
};

test("parseTraeEntitlementResponse - correctly extracts Dollar Usage and Autocomplete quotas", () => {
  const result = parseTraeEntitlementResponse(SAMPLE_ENTITLEMENT_RESPONSE);
  assert.equal(result.plan, "Free plan");
  assert.ok(result.quotas);

  // Dollar Usage
  const dollarQuota = result.quotas["Dollar Usage"];
  assert.ok(dollarQuota);
  assert.equal(dollarQuota.total, 1);
  assert.equal(dollarQuota.used, 0);
  assert.equal(dollarQuota.remaining, 1);
  assert.equal(dollarQuota.displayName, "Dollar Usage ($)");
  assert.equal(dollarQuota.resetAt, 1796083199 * 1000);

  // Autocomplete
  const autoQuota = result.quotas["Autocomplete"];
  assert.ok(autoQuota);
  assert.equal(autoQuota.total, 5000);
  assert.equal(autoQuota.used, 0);
  assert.equal(autoQuota.remaining, 5000);
  assert.equal(autoQuota.displayName, "Autocomplete");

  // Fast requests
  const fastQuota = result.quotas["Fast Requests"];
  assert.ok(fastQuota);
  assert.equal(fastQuota.total, 10);
  assert.equal(fastQuota.used, 0);
  assert.equal(fastQuota.remaining, 10);
});

test("TraeProvider - supportsQuota is true and fetchQuota calls getTraeUsage", async () => {
  const provider = new TraeProvider();
  assert.equal(provider.supportsQuota(), true);

  const origFetch = globalThis.fetch;
  try {
    let capturedBody = "";
    let capturedAuth = "";
    globalThis.fetch = async (input: any, init?: any) => {
      const url = String(input);
      if (url.includes("/user_current_entitlement_list")) {
        capturedBody = init?.body;
        capturedAuth = init?.headers?.Authorization;
        return new Response(JSON.stringify(SAMPLE_ENTITLEMENT_RESPONSE), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      return new Response("Not found", { status: 404 });
    };

    const quotaResult = await provider.fetchQuota({
      providerId: "trae",
      account: {
        id: "acc_trae_1",
        providerId: "trae",
        name: "Trae Test",
        rawApiKey: "jwt_token_sample",
        isActive: true,
      } as any,
    });

    assert.equal(quotaResult.plan, "Free plan");
    assert.ok(quotaResult.quotas?.["Dollar Usage"]);
    assert.equal(capturedAuth, "Cloud-IDE-JWT jwt_token_sample");
    assert.equal(capturedBody, JSON.stringify({ require_usage: true }));
  } finally {
    globalThis.fetch = origFetch;
  }
});
