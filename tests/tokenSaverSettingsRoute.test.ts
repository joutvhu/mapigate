process.env.NODE_ENV = "test";

import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import app from "../src/server/index.js";
import { SettingsRepository } from "../src/storage/repositories/settingsRepo.js";

test("Token Saver Settings API - GET, PUT, and PATCH /api/settings/token-saver", async () => {
  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", () => resolve()));
  const address = server.address() as { port: number };
  const baseUrl = `http://127.0.0.1:${address.port}`;

  try {
    // 1. GET initial settings
    const resGet = await fetch(`${baseUrl}/api/settings/token-saver`);
    assert.equal(resGet.status, 200);
    const initial = await resGet.json();
    assert.ok(typeof initial.rtkEnabled === "boolean");
    assert.ok(typeof initial.cavemanEnabled === "boolean");
    assert.ok(typeof initial.cavemanLevel === "string");
    assert.ok(typeof initial.ponytailEnabled === "boolean");
    assert.ok(typeof initial.ponytailLevel === "string");

    // 2. PUT full settings update
    const putPayload = {
      rtkEnabled: true,
      cavemanEnabled: true,
      cavemanLevel: "full",
      ponytailEnabled: true,
      ponytailLevel: "ultra",
    };
    const resPut = await fetch(`${baseUrl}/api/settings/token-saver`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(putPayload),
    });
    assert.equal(resPut.status, 200);
    const putUpdated = await resPut.json();
    assert.equal(putUpdated.rtkEnabled, true);
    assert.equal(putUpdated.cavemanEnabled, true);
    assert.equal(putUpdated.cavemanLevel, "full");
    assert.equal(putUpdated.ponytailEnabled, true);
    assert.equal(putUpdated.ponytailLevel, "ultra");

    // Verify stored in repository
    const storedAfterPut = SettingsRepository.getTokenSaverSettings();
    assert.equal(storedAfterPut.cavemanLevel, "full");
    assert.equal(storedAfterPut.ponytailLevel, "ultra");
    assert.equal(storedAfterPut.cavemanEnabled, true);

    // 3. PATCH partial settings update (only cavemanLevel and ponytailEnabled)
    const patchPayload = {
      cavemanLevel: "ultra",
      ponytailEnabled: false,
    };
    const resPatch = await fetch(`${baseUrl}/api/settings/token-saver`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patchPayload),
    });
    assert.equal(resPatch.status, 200);
    const patchUpdated = await resPatch.json();
    assert.equal(patchUpdated.cavemanLevel, "ultra");
    assert.equal(patchUpdated.ponytailEnabled, false);
    // Preserved fields
    assert.equal(patchUpdated.rtkEnabled, true);
    assert.equal(patchUpdated.cavemanEnabled, true);
    assert.equal(patchUpdated.ponytailLevel, "ultra");

    // 4. Verify all valid levels (lite, full, ultra)
    for (const lvl of ["lite", "full", "ultra"]) {
      const resLvl = await fetch(`${baseUrl}/api/settings/token-saver`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cavemanLevel: lvl, ponytailLevel: lvl }),
      });
      assert.equal(resLvl.status, 200);
      const data = await resLvl.json();
      assert.equal(data.cavemanLevel, lvl);
      assert.equal(data.ponytailLevel, lvl);
    }
  } finally {
    server.close();
  }
});
