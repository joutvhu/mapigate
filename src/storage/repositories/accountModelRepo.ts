import { getDatabase } from "../database.js";

export interface AccountModelClassification {
  supported: Set<string>;
  unscanned: Set<string>;
  unsupported: Set<string>;
}

export class AccountModelRepository {
  /**
   * Replaces all supported models for a specific account.
   */
  public static setAccountModels(accountId: string, modelIds: string[]): void {
    if (!accountId || accountId.startsWith("acc_virtual") || accountId === "explicit") return;
    const db = getDatabase();
    const now = Date.now();

    try {
      db.exec("BEGIN TRANSACTION;");
      db.run("DELETE FROM account_supported_models WHERE account_id = ?", accountId);
      for (const mId of modelIds) {
        if (!mId) continue;
        db.run(
          "INSERT OR IGNORE INTO account_supported_models (account_id, model_id, scanned_at) VALUES (?, ?, ?)",
          accountId,
          mId.trim(),
          now
        );
      }
      db.exec("COMMIT;");
    } catch {
      try {
        db.exec("ROLLBACK;");
      } catch {}
    }
  }

  /**
   * Adds a single model to an account's supported models (auto-learning on success).
   */
  public static addAccountModel(accountId: string, modelId: string): void {
    if (!accountId || !modelId || accountId.startsWith("acc_virtual") || accountId === "explicit") return;
    try {
      const db = getDatabase();
      db.run(
        "INSERT OR IGNORE INTO account_supported_models (account_id, model_id, scanned_at) VALUES (?, ?, ?)",
        accountId,
        modelId.trim(),
        Date.now()
      );
    } catch {}
  }

  /**
   * Clears all models for an account (e.g. when API key / credentials are changed).
   */
  public static clearAccountModels(accountId: string): void {
    if (!accountId) return;
    try {
      const db = getDatabase();
      db.run("DELETE FROM account_supported_models WHERE account_id = ?", accountId);
    } catch {}
  }

  /**
   * Gets all supported models for an account. Returns null if account has never been scanned.
   */
  public static getAccountModels(accountId: string): Set<string> | null {
    if (!accountId) return null;
    const db = getDatabase();
    const rows = db.all<{ model_id: string }>(
      "SELECT model_id FROM account_supported_models WHERE account_id = ?",
      accountId
    );
    if (!rows || rows.length === 0) {
      return null;
    }
    return new Set(rows.map((r) => r.model_id));
  }

  /**
   * Classifies a list of candidate account IDs for a given target model:
   * - supported: account explicitly has this model
   * - unscanned: account has no records in account_supported_models
   * - unsupported: account has records but does NOT include this model
   */
  public static classifyAccounts(
    accountIds: string[],
    targetModel: string
  ): AccountModelClassification {
    const supported = new Set<string>();
    const unscanned = new Set<string>();
    const unsupported = new Set<string>();

    if (!accountIds || accountIds.length === 0 || !targetModel) {
      for (const id of accountIds || []) unscanned.add(id);
      return { supported, unscanned, unsupported };
    }

    const db = getDatabase();
    const cleanTarget = targetModel.toLowerCase().trim();

    // Query distinct models for given account IDs in one batch
    const placeholders = accountIds.map(() => "?").join(",");
    const rows = db.all<{ account_id: string; model_id: string }>(
      `SELECT account_id, model_id FROM account_supported_models WHERE account_id IN (${placeholders})`,
      ...accountIds
    );

    const accountModelsMap = new Map<string, Set<string>>();
    for (const r of rows) {
      let set = accountModelsMap.get(r.account_id);
      if (!set) {
        set = new Set();
        accountModelsMap.set(r.account_id, set);
      }
      set.add(r.model_id.toLowerCase());
    }

    for (const id of accountIds) {
      const set = accountModelsMap.get(id);
      if (!set || set.size === 0) {
        unscanned.add(id);
      } else if (set.has(cleanTarget)) {
        supported.add(id);
      } else {
        unsupported.add(id);
      }
    }

    return { supported, unscanned, unsupported };
  }
}
