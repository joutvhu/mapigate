import { getDatabase } from "../database.js";
import type { RequestUsageLog, TokenStatsSummary } from "../../shared/types/index.js";

export class LogRepository {
  public static saveLog(log: RequestUsageLog): void {
    const db = getDatabase();
    db.run(
      `INSERT INTO request_logs (
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

    // Periodic retention prune (1 in 50 writes) to keep database lean and prevent unbounded table growth
    if (Math.random() < 0.02) {
      try {
        const maxLogs = Number(process.env.MAPIGATE_MAX_LOGS) || 20000;
        const countRow = db.get<{ count: number }>("SELECT COUNT(*) as count FROM request_logs");
        if (countRow && countRow.count > maxLogs) {
          const excess = countRow.count - maxLogs;
          db.run(
            "DELETE FROM request_logs WHERE id IN (SELECT id FROM request_logs ORDER BY timestamp ASC LIMIT ?)",
            excess
          );
        }
      } catch {
        // Best effort
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
    const row = db.get<any>(`
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
