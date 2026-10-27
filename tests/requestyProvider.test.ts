import test from "node:test";
import assert from "node:assert/strict";

import { PROVIDER_REGISTRY } from "../src/shared/constants/providerRegistry.js";
import { RequestyProvider } from "../src/providers/catalog/requesty/provider.js";
import { COMMUNITY_PROVIDERS_CATALOG } from "../src/providers/catalog/communityCatalog.js";

test("Requesty Provider - Metadata & Provider Configuration", () => {
  const req = PROVIDER_REGISTRY["requesty"];
  assert.ok(req, "requesty must be registered in PROVIDER_REGISTRY");
  assert.equal(req.id, "requesty");
  assert.equal(req.name, "Requesty");
  assert.equal(req.alias, "requesty");
  assert.deepEqual(req.aliases, ["req", "rqty"]);
  assert.equal(req.uiAlias, "req");
  assert.equal(req.color, "#9333EA");
  assert.equal(req.iconBg, "#FFFFFF");
  assert.equal(req.image, "/assets/providers/requesty/icon.svg");
  assert.equal(req.website, "https://requesty.ai");
  assert.equal(req.baseUrl, "https://router.requesty.ai/v1/chat/completions");
  assert.equal(req.validateUrl, "https://router.requesty.ai/v1/models");
  assert.equal(req.format, "openai");
  assert.equal(req.passthroughModels, true);

  const modelIds = req.models.map((m) => m.id);
  assert.ok(modelIds.includes("mistral/leanstral-1.5"));
  assert.ok(modelIds.includes("nemotron/nemotron-3-nano-30b-a3b"));

  const providerInstance = new RequestyProvider();
  assert.equal(providerInstance.id, "requesty");
  assert.equal(providerInstance.name, "Requesty");
  assert.equal(providerInstance.defaultFormat, "openai");
});

test("Community Catalog - Inception, Routeway, Pollinations", () => {
  const inception = COMMUNITY_PROVIDERS_CATALOG.find((p) => p.id === "inception");
  assert.ok(inception, "inception must exist in community catalog");
  assert.equal(inception.name, "Inception Labs");
  assert.ok(inception.models?.some((m) => m.id === "mercury-3"));
  assert.ok(inception.models?.some((m) => m.id === "mercury-2.5"));

  const routeway = COMMUNITY_PROVIDERS_CATALOG.find((p) => p.id === "routeway");
  assert.ok(routeway, "routeway must exist in community catalog");
  assert.ok(routeway.models?.some((m) => m.id === "deepseek-v4-flash:free"));
  assert.ok(routeway.models?.some((m) => m.id === "minimax-m2.7:free"));
  assert.ok(routeway.models?.some((m) => m.id === "muse-glimmer-30b:free"));

  const pollinations = COMMUNITY_PROVIDERS_CATALOG.find((p) => p.id === "pollinations");
  assert.ok(pollinations, "pollinations must exist in community catalog");
  assert.ok(pollinations.models?.some((m) => m.id === "mistral-large-3"));
  assert.ok(pollinations.models?.some((m) => m.id === "glm-5.3-flash"));
});
