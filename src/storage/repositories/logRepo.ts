import { getDatabase } from "../database.js";
import type { RequestUsageLog, TokenStatsSummary } from "../../shared/types/index.js";

export class LogRepository {
  public static saveLog(log: RequestUsageLog): void {
    const db = getDatabase();
    db.run(
      `INSERT INTO request_logs (
        id, timestamp, client_tool, requested_model, actual_model,
        provider_id, prompt_tokens, completion_tokens, tokens_saved_by_rtk,
        duration_ms, status, error_message
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      log.id,
      log.timestamp,
      log.clientTool,
      log.requestedModel,
      log.actualModel,
      log.providerId,
      log.promptTokens,
      log.completionTokens,
      log.tokensSavedByRtk,
      log.durationMs,
      log.status,
      log.errorMessage || null
    );
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
        COALESCE(SUM(tokens_saved_by_rtk), 0) as total_saved
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
    };
  }
}
