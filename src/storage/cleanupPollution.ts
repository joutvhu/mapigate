import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { DatabaseSync } from "node:sqlite";

export function scrubDatabase(dbPath?: string) {
  const targetPath = dbPath || path.join(os.homedir(), ".mapigate", "mapigate.sqlite");
  if (!fs.existsSync(targetPath)) {
    console.log(`Database file not found at ${targetPath}, nothing to scrub.`);
    return { accountsDeleted: 0, providersDeleted: 0, combosDeleted: 0 };
  }

  const db = new DatabaseSync(targetPath);
  try {
    // 1. Delete test accounts
    const delAccounts = db.prepare(`
      DELETE FROM provider_accounts
      WHERE id LIKE 'acc_%'
         OR id LIKE 'test_%'
         OR id LIKE 'conn-%'
    `).run();

    // 2. Delete test providers
    const delProviders = db.prepare(`
      DELETE FROM providers
      WHERE id LIKE 'lb_test_prov_%'
         OR id LIKE 'test_prov_%'
    `).run();

    // 3. Delete all combos (so user starts with 0 combos)
    const delCombos = db.prepare(`
      DELETE FROM combos
    `).run();

    // Also reset mitm_mappings target_model to "" if needed
    db.prepare(`
      UPDATE mitm_mappings SET target_model = ''
    `).run();

    console.log(`Scrubbed ${targetPath}:`);
    console.log(`  - Accounts deleted: ${delAccounts.changes}`);
    console.log(`  - Providers deleted: ${delProviders.changes}`);
    console.log(`  - Combos deleted: ${delCombos.changes}`);

    return {
      accountsDeleted: Number(delAccounts.changes),
      providersDeleted: Number(delProviders.changes),
      combosDeleted: Number(delCombos.changes),
    };
  } finally {
    db.close();
  }
}

// If executed directly
if (import.meta.url.endsWith(process.argv[1]?.replace(/\\/g, "/") || "")) {
  scrubDatabase();
}
