process.env.NODE_ENV = "test";

import test from "node:test";
import assert from "node:assert/strict";
import { collapseDoubledV1Prefix } from "../src/server/middlewares/doubledV1Middleware.js";

test("Doubled V1 Middleware - rewrites doubled /v1 prefixes", () => {
  const cases = [
    { input: "/v1/v1/messages", expected: "/v1/messages" },
    { input: "/v1/v1/chat/completions", expected: "/v1/chat/completions" },
    { input: "/v1/v1/models?limit=10", expected: "/v1/models?limit=10" },
    { input: "/v1/v1/v1/models", expected: "/v1/models" },
    { input: "/v1/models", expected: "/v1/models" },
    { input: "/v1/v1beta/models", expected: "/v1/v1beta/models" },
    { input: "/api/providers", expected: "/api/providers" },
    { input: "/health", expected: "/health" },
  ];

  for (const { input, expected } of cases) {
    const req: any = { url: input };
    const res: any = {};
    let nextCalled = false;

    collapseDoubledV1Prefix(req, res, () => {
      nextCalled = true;
    });

    assert.equal(nextCalled, true, `next() must be called for ${input}`);
    assert.equal(req.url, expected, `Failed to correctly handle ${input}`);
  }
});
