import { getDatabase } from "../database.js";
import type { RequestUsageLog, TokenStatsSummary } from "../../shared/types/index.js";

export class LogRepository {
  public static saveLog(log: RequestUsageLog): void {
    const db = getDatabase();
    const insertResult = db.run(
      `INSERT OR IGNORE INTO request_logs (
        id, timestamp, client_tool, requested_model, actual_model,
        provider_id, prompt_tokens, completion_tokens, tokens_saved_by_rtk,
        cached_tokens, cache_creation_tokens, cost, account_id, account_name,
        api_key_id, api_key_name, duration_ms, status, error_message
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      log.id,
      log.timestamp,
      log.clientTool,
      log.requestedModel,
      log.actualModel,
      log.providerId,
      log.promptTokens || 0,
      log.completionTokens || 0,
      log.tokensSavedByRtk || 0,
      log.cachedTokens || 0,
      log.cacheCreationTokens || 0,
      log.cost || 0,
      log.accountId || null,
      log.accountName || null,
      log.apiKeyId || null,
      log.apiKeyName || null,
      log.durationMs || 0,
      log.status,
      log.errorMessage || null
    );

    // Roll up into daily_usage_stats only when this log ID was newly inserted (prevents double-counting on duplicate calls)
    const hasTokens = (log.promptTokens || 0) + (log.completionTokens || 0) > 0;
    if (insertResult.changes > 0 && hasTokens) {
      try {
        const d = new Date(log.timestamp);
        const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
        const providerId = log.providerId || "unknown";
        const actualModel = log.actualModel || log.requestedModel || "unknown";
        const accountId = log.accountId || "";
        const accountName = log.accountName || "";
        const apiKeyId = log.apiKeyId || "";
        const apiKeyName = log.apiKeyName || "";

        db.run(
          `INSERT INTO daily_usage_stats (
            date, provider_id, actual_model, account_id, account_name,
            api_key_id, api_key_name, requests, prompt_tokens,
            completion_tokens, cached_tokens, tokens_saved_by_rtk, cost, last_used
          ) VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(date, provider_id, actual_model, account_id, api_key_id) DO UPDATE SET
            requests = requests + 1,
            prompt_tokens = prompt_tokens + excluded.prompt_tokens,
            completion_tokens = completion_tokens + excluded.completion_tokens,
            cached_tokens = cached_tokens + excluded.cached_tokens,
            tokens_saved_by_rtk = tokens_saved_by_rtk + excluded.tokens_saved_by_rtk,
            cost = cost + excluded.cost,
            account_name = CASE WHEN excluded.account_name != '' THEN excluded.account_name ELSE daily_usage_stats.account_name END,
            api_key_name = CASE WHEN excluded.api_key_name != '' THEN excluded.api_key_name ELSE daily_usage_stats.api_key_name END,
            last_used = MAX(last_used, excluded.last_used)`,
          dateStr,
          providerId,
          actualModel,
          accountId,
          accountName,
          apiKeyId,
          apiKeyName,
          log.promptTokens || 0,
          log.completionTokens || 0,
          log.cachedTokens || 0,
          log.tokensSavedByRtk || 0,
          log.cost || 0,
          log.timestamp
        );
      } catch {
        // Best effort rollup
      }
    }
  }

  public static getRecentLogs(limit: number = 100): RequestUsageLog[] {
    const db = getDatabase();
    const rows = db.all<any>(
      "SELECT * FROM request_logs ORDER BY timestamp DESC LIMIT ?",
      limit
    );

    return rows.map((r) => ({
      id: r.id,
      timestamp: r.timestamp,
      clientTool: r.client_tool,
      requestedModel: r.requested_model,
      actualModel: r.actual_model,
      providerId: r.provider_id,
      promptTokens: r.prompt_tokens,
      completionTokens: r.completion_tokens,
      tokensSavedByRtk: r.tokens_saved_by_rtk,
      cachedTokens: r.cached_tokens || 0,
      cacheCreationTokens: r.cache_creation_tokens || 0,
      cost: r.cost || 0,
      accountId: r.account_id || undefined,
      accountName: r.account_name || undefined,
      apiKeyId: r.api_key_id || undefined,
      apiKeyName: r.api_key_name || undefined,
      durationMs: r.duration_ms,
      status: r.status,
      errorMessage: r.error_message,
    }));
  }

  public static getTokenStats(): TokenStatsSummary {
    const db = getDatabase();
    const hasDaily = Boolean(db.get<{ c: number }>("SELECT 1 as c FROM daily_usage_stats LIMIT 1"));

    const row = hasDaily
      ? db.get<any>(`
          SELECT 
            COALESCE(SUM(requests), 0) as total_requests,
            COALESCE(SUM(prompt_tokens), 0) as total_prompt,
            COALESCE(SUM(completion_tokens), 0) as total_completion,
            COALESCE(SUM(tokens_saved_by_rtk), 0) as total_saved,
            COALESCE(SUM(cached_tokens), 0) as total_cached,
            COALESCE(SUM(cost), 0) as total_cost
          FROM daily_usage_stats
        `)
      : db.get<any>(`
          SELECT 
            COUNT(*) as total_requests,
            COALESCE(SUM(prompt_tokens), 0) as total_prompt,
            COALESCE(SUM(completion_tokens), 0) as total_completion,
            COALESCE(SUM(tokens_saved_by_rtk), 0) as total_saved,
            COALESCE(SUM(cached_tokens), 0) as total_cached,
            COALESCE(SUM(cost), 0) as total_cost
          FROM request_logs
        `);

    const totalSaved = Number(row?.total_saved || 0);
    // Estimated average cost per 1M tokens saved: ~$3.00 USD
    const estimatedCostSavedUsd = Number(((totalSaved / 1_000_000) * 3.0).toFixed(4));

    return {
      totalRequests: Number(row?.total_requests || 0),
      totalPromptTokens: Number(row?.total_prompt || 0),
      totalCompletionTokens: Number(row?.total_completion || 0),
      totalTokensSaved: totalSaved,
      estimatedCostSavedUsd,
      totalCachedTokens: Number(row?.total_cached || 0),
      totalCost: Number(row?.total_cost || 0),
    };
  }

  /**
   * Calculates total routed tokens for an account in the current UTC month.
   * Matches OmniRoute's getMonthlyProviderTokensForConnection pattern.
   */
  public static getMonthlyTokensForAccount(
    accountId: string,
    providerId?: string
  ): number {
    if (!accountId && !providerId) return 0;
    const db = getDatabase();
    const now = new Date();
    const monthStartMs = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1);
    const monthStartStr = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}-01`;

    const hasDaily = Boolean(db.get<{ c: number }>("SELECT 1 as c FROM daily_usage_stats LIMIT 1"));
    if (hasDaily) {
      const row = db.get<any>(
        `SELECT COALESCE(SUM(prompt_tokens), 0)
              + COALESCE(SUM(completion_tokens), 0)
              + COALESCE(SUM(cached_tokens), 0) AS total
         FROM daily_usage_stats
         WHERE (account_id = ? OR (account_id = '' AND provider_id = ?))
           AND date >= ?`,
        accountId,
        providerId || "",
        monthStartStr
      );
      return Math.max(0, Number(row?.total || 0));
    }

    const row = db.get<any>(
      `SELECT COALESCE(SUM(prompt_tokens), 0)
            + COALESCE(SUM(completion_tokens), 0)
            + COALESCE(SUM(cached_tokens), 0)
            + COALESCE(SUM(cache_creation_tokens), 0) AS total
       FROM request_logs
       WHERE (account_id = ? OR (account_id IS NULL AND provider_id = ?))
         AND timestamp >= ?`,
      accountId,
      providerId || "",
      monthStartMs
    );

    return Math.max(0, Number(row?.total || 0));
  }
}
