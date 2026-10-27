import test from "node:test";
import assert from "node:assert/strict";

import { COMMUNITY_PROVIDERS_CATALOG } from "../src/providers/catalog/communityCatalog.js";

test("Community Catalog - Requesty, Inception, Routeway, Pollinations", () => {
  const requesty = COMMUNITY_PROVIDERS_CATALOG.find((p) => p.id === "requesty");
  assert.ok(requesty, "requesty must exist in community catalog");
  assert.equal(requesty.name, "Requesty");
  assert.equal(requesty.baseUrl, "https://router.requesty.ai/v1/chat/completions");
  assert.ok(requesty.models?.some((m) => m.id === "mistral/leanstral-1.5"));
  assert.ok(requesty.models?.some((m) => m.id === "nemotron/nemotron-3-nano-30b-a3b"));
  assert.ok(requesty.models?.some((m) => m.id === "ling/ling-3.0-tiny"));

  const inception = COMMUNITY_PROVIDERS_CATALOG.find((p) => p.id === "inception");
  assert.ok(inception, "inception must exist in community catalog");
  assert.equal(inception.name, "Inception Labs");
  assert.ok(inception.models?.some((m) => m.id === "mercury-3"));
  assert.ok(inception.models?.some((m) => m.id === "mercury-2.5"));
  assert.ok(inception.models?.some((m) => m.id === "mercury-2"));

  const routeway = COMMUNITY_PROVIDERS_CATALOG.find((p) => p.id === "routeway");
  assert.ok(routeway, "routeway must exist in community catalog");
  assert.ok(routeway.models?.some((m) => m.id === "deepseek-v4-flash:free"));
  assert.ok(routeway.models?.some((m) => m.id === "minimax-m2.7:free"));
  assert.ok(routeway.models?.some((m) => m.id === "muse-glimmer-30b:free"));

  const pollinations = COMMUNITY_PROVIDERS_CATALOG.find((p) => p.id === "pollinations");
  assert.ok(pollinations, "pollinations must exist in community catalog");
  assert.ok(pollinations.models?.some((m) => m.id === "mistral-large-3"));
  assert.ok(pollinations.models?.some((m) => m.id === "glm-5.3-flash"));
  assert.ok(pollinations.models?.some((m) => m.id === "gpt-oss-20b"));
  assert.ok(pollinations.models?.some((m) => m.id === "kimi-k2.6"));
});
