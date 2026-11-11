import { EventEmitter } from "node:events";
import { getDatabase } from "../database.js";
import type {
  UsageStatsResult,
  ChartDataPoint,
  ActiveRequestItem,
  RecentRequestItem,
  CounterBucket,
  ModelCounterBucket,
  AccountCounterBucket,
  ApiKeyCounterBucket,
} from "../../shared/types/index.js";

export const usageEventEmitter = new EventEmitter();
usageEventEmitter.setMaxListeners(100);

let updateTimer: NodeJS.Timeout | null = null;
let pendingTimer: NodeJS.Timeout | null = null;

function scheduleStatsEvent(event: "update" | "pending", delayMs: number = 100): void {
  if (event === "update") {
    if (updateTimer) return;
    updateTimer = setTimeout(() => {
      updateTimer = null;
      usageEventEmitter.emit("update");
    }, delayMs);
    updateTimer.unref?.();
  } else {
    if (pendingTimer) return;
    pendingTimer = setTimeout(() => {
      pendingTimer = null;
      usageEventEmitter.emit("pending");
    }, delayMs);
    pendingTimer.unref?.();
  }
}

interface PendingRecord {
  id: string;
  model: string;
  provider: string;
  account?: string;
  startTime: number;
}

const pendingMap = new Map<string, PendingRecord>();
let lastErrorProvider = { provider: "", ts: 0 };

export const PENDING_TIMEOUT_MS = Number(process.env.MAPIGATE_PENDING_TIMEOUT_MS || 600_000); // 10 minutes default for extended reasoning/thinking models

function purgeStalePending(): void {
  const cutoff = Date.now() - PENDING_TIMEOUT_MS;
  for (const [id, rec] of pendingMap.entries()) {
    if (rec.startTime < cutoff) {
      pendingMap.delete(id);
    }
  }
}

export class UsageRepository {
  /**
   * Backfills existing request_logs into daily_usage_stats if not already rolled up.
   * Safe to call on boot or lazily.
   */
  public static backfillDailyStats(): void {
    const db = getDatabase();
    try {
      // Clean up any zero-token entries in daily_usage_stats from previous runs
      db.run("DELETE FROM daily_usage_stats WHERE (prompt_tokens + completion_tokens) <= 0");

      db.run(`
        INSERT INTO daily_usage_stats (
          date, provider_id, actual_model, account_id, account_name,
          api_key_id, api_key_name, requests, prompt_tokens,
          completion_tokens, cached_tokens, tokens_saved_by_rtk, cost, last_used
        )
        SELECT 
          strftime('%Y-%m-%d', datetime(timestamp / 1000, 'unixepoch', 'localtime')) as date,
          COALESCE(NULLIF(provider_id, ''), 'unknown') as provider_id,
          COALESCE(NULLIF(actual_model, ''), NULLIF(requested_model, ''), 'unknown') as actual_model,
          COALESCE(account_id, '') as account_id,
          MAX(COALESCE(account_name, '')) as account_name,
          COALESCE(api_key_id, '') as api_key_id,
          MAX(COALESCE(api_key_name, '')) as api_key_name,
          COUNT(*) as requests,
          SUM(prompt_tokens) as prompt_tokens,
          SUM(completion_tokens) as completion_tokens,
          SUM(cached_tokens) as cached_tokens,
          SUM(tokens_saved_by_rtk) as tokens_saved_by_rtk,
          SUM(cost) as cost,
          MAX(timestamp) as last_used
        FROM request_logs
        WHERE (prompt_tokens + completion_tokens) > 0
        GROUP BY 
          strftime('%Y-%m-%d', datetime(timestamp / 1000, 'unixepoch', 'localtime')),
          COALESCE(NULLIF(provider_id, ''), 'unknown'),
          COALESCE(NULLIF(actual_model, ''), NULLIF(requested_model, ''), 'unknown'),
          COALESCE(account_id, ''),
          COALESCE(api_key_id, '')
        ON CONFLICT(date, provider_id, actual_model, account_id, api_key_id) DO UPDATE SET
          requests = MAX(daily_usage_stats.requests, excluded.requests),
          prompt_tokens = MAX(daily_usage_stats.prompt_tokens, excluded.prompt_tokens),
          completion_tokens = MAX(daily_usage_stats.completion_tokens, excluded.completion_tokens),
          cached_tokens = MAX(daily_usage_stats.cached_tokens, excluded.cached_tokens),
          tokens_saved_by_rtk = MAX(daily_usage_stats.tokens_saved_by_rtk, excluded.tokens_saved_by_rtk),
          cost = MAX(daily_usage_stats.cost, excluded.cost),
          account_name = CASE WHEN excluded.account_name != '' THEN excluded.account_name ELSE daily_usage_stats.account_name END,
          api_key_name = CASE WHEN excluded.api_key_name != '' THEN excluded.api_key_name ELSE daily_usage_stats.api_key_name END,
          last_used = MAX(daily_usage_stats.last_used, excluded.last_used)
      `);
    } catch {
      // Best effort backfill
    }
  }

  public static startPendingRequest(info: {
    id: string;
    model: string;
    provider: string;
    account?: string;
  }): void {
    purgeStalePending();
    pendingMap.set(info.id, {
      ...info,
      startTime: Date.now(),
    });
    scheduleStatsEvent("pending");
  }

  public static updatePendingRequest(info: {
    id: string;
    model?: string;
    provider?: string;
    account?: string;
  }): void {
    purgeStalePending();
    const existing = pendingMap.get(info.id);
    if (existing) {
      if (info.model) existing.model = info.model;
      if (info.provider) existing.provider = info.provider;
      if (info.account !== undefined) existing.account = info.account;
      scheduleStatsEvent("pending");
    }
  }

  public static endPendingRequest(id: string, isError: boolean = false, errorProvider?: string): void {
    pendingMap.delete(id);
    if (isError && errorProvider) {
      lastErrorProvider = { provider: errorProvider, ts: Date.now() };
    }
    scheduleStatsEvent("pending");
    scheduleStatsEvent("update", 250);
  }

  public static getActiveRequests(): ActiveRequestItem[] {
    purgeStalePending();
    const grouped = new Map<string, { model: string; provider: string; account?: string; count: number }>();

    for (const rec of pendingMap.values()) {
      const key = `${rec.provider}|${rec.model}|${rec.account || ""}`;
      const existing = grouped.get(key);
      if (existing) {
        existing.count += 1;
      } else {
        grouped.set(key, {
          model: rec.model,
          provider: rec.provider,
          account: rec.account,
          count: 1,
        });
      }
    }

    return Array.from(grouped.values());
  }

  public static getPeriodStartTimestamp(period: string): number {
    const now = Date.now();
    const getDaysAgoMidnight = (days: number): number => {
      const d = new Date();
      d.setHours(0, 0, 0, 0);
      d.setDate(d.getDate() - (days - 1));
      return d.getTime();
    };
    switch (period) {
      case "today":
        return getDaysAgoMidnight(1);
      case "24h":
        return now - 24 * 60 * 60 * 1000;
      case "7d":
        return getDaysAgoMidnight(7);
      case "30d":
        return getDaysAgoMidnight(30);
      case "60d":
        return getDaysAgoMidnight(60);
      case "90d":
        return getDaysAgoMidnight(90);
      case "all":
      default:
        return 0;
    }
  }

  public static getPeriodStartDateString(period: string): string {
    if (period === "all") return "";
    const ts = this.getPeriodStartTimestamp(period);
    const d = new Date(ts);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  }

  public static getUsageStats(period: string = "7d"): UsageStatsResult {
    const db = getDatabase();
    const startTs = this.getPeriodStartTimestamp(period);
    const startDateStr = this.getPeriodStartDateString(period);

    // If period is beyond recent retention (e.g. 30d, 60d, 90d, all), aggregate from daily_usage_stats if it has data
    const hasDailyData = Boolean(db.get<{ c: number }>("SELECT 1 as c FROM daily_usage_stats LIMIT 1"));
    const useDailyRollup = hasDailyData && (period === "30d" || period === "60d" || period === "90d" || period === "all");

    // 1. Overall Aggregation
    const sumRow = useDailyRollup
      ? db.get<{
          count: number;
          prompt: number;
          completion: number;
          cached: number;
          cost: number;
          saved: number;
        }>(
          `SELECT 
            COALESCE(SUM(requests), 0) as count,
            COALESCE(SUM(prompt_tokens), 0) as prompt,
            COALESCE(SUM(completion_tokens), 0) as completion,
            COALESCE(SUM(cached_tokens), 0) as cached,
            COALESCE(SUM(cost), 0) as cost,
            COALESCE(SUM(tokens_saved_by_rtk), 0) as saved
          FROM daily_usage_stats
          ${startDateStr ? "WHERE date >= ?" : ""}`,
          ...(startDateStr ? [startDateStr] : [])
        )
      : db.get<{
          count: number;
          prompt: number;
          completion: number;
          cached: number;
          cost: number;
          saved: number;
        }>(
          `SELECT 
            COUNT(*) as count,
            COALESCE(SUM(prompt_tokens), 0) as prompt,
            COALESCE(SUM(completion_tokens), 0) as completion,
            COALESCE(SUM(cached_tokens), 0) as cached,
            COALESCE(SUM(cost), 0) as cost,
            COALESCE(SUM(tokens_saved_by_rtk), 0) as saved
          FROM request_logs
          WHERE timestamp >= ?`,
          startTs
        );

    const totalRequests = Number(sumRow?.count || 0);
    const totalPromptTokens = Number(sumRow?.prompt || 0);
    const totalCompletionTokens = Number(sumRow?.completion || 0);
    const totalCachedTokens = Number(sumRow?.cached || 0);
    const totalCost = Number((sumRow?.cost || 0).toFixed(4));
    const totalTokensSaved = Number(sumRow?.saved || 0);
    const estimatedCostSavedUsd = Number(((totalTokensSaved / 1_000_000) * 3.0).toFixed(4));

    // 2. Breakdown by Provider
    const provRows = useDailyRollup
      ? db.all<{
          provider_id: string;
          count: number;
          prompt: number;
          completion: number;
          cached: number;
          cost: number;
        }>(
          `SELECT 
            provider_id,
            COALESCE(SUM(requests), 0) as count,
            COALESCE(SUM(prompt_tokens), 0) as prompt,
            COALESCE(SUM(completion_tokens), 0) as completion,
            COALESCE(SUM(cached_tokens), 0) as cached,
            COALESCE(SUM(cost), 0) as cost
          FROM daily_usage_stats
          ${startDateStr ? "WHERE date >= ?" : ""}
          GROUP BY provider_id`,
          ...(startDateStr ? [startDateStr] : [])
        )
      : db.all<{
          provider_id: string;
          count: number;
          prompt: number;
          completion: number;
          cached: number;
          cost: number;
        }>(
          `SELECT 
            provider_id,
            COUNT(*) as count,
            COALESCE(SUM(prompt_tokens), 0) as prompt,
            COALESCE(SUM(completion_tokens), 0) as completion,
            COALESCE(SUM(cached_tokens), 0) as cached,
            COALESCE(SUM(cost), 0) as cost
          FROM request_logs
          WHERE timestamp >= ?
          GROUP BY provider_id`,
          startTs
        );

    const byProvider: Record<string, CounterBucket> = {};
    for (const r of provRows) {
      const pid = r.provider_id || "unknown";
      const existing = byProvider[pid];
      if (existing) {
        existing.requests += Number(r.count || 0);
        existing.promptTokens += Number(r.prompt || 0);
        existing.completionTokens += Number(r.completion || 0);
        existing.cachedTokens += Number(r.cached || 0);
        existing.cost = Number((existing.cost + Number(r.cost || 0)).toFixed(4));
      } else {
        byProvider[pid] = {
          requests: Number(r.count || 0),
          promptTokens: Number(r.prompt || 0),
          completionTokens: Number(r.completion || 0),
          cachedTokens: Number(r.cached || 0),
          cost: Number((r.cost || 0).toFixed(4)),
        };
      }
    }

    // 3. Breakdown by Model
    const modelRows = useDailyRollup
      ? db.all<{
          actual_model: string;
          provider_id: string;
          count: number;
          prompt: number;
          completion: number;
          cached: number;
          cost: number;
          last_used: number;
        }>(
          `SELECT 
            actual_model,
            provider_id,
            COALESCE(SUM(requests), 0) as count,
            COALESCE(SUM(prompt_tokens), 0) as prompt,
            COALESCE(SUM(completion_tokens), 0) as completion,
            COALESCE(SUM(cached_tokens), 0) as cached,
            COALESCE(SUM(cost), 0) as cost,
            MAX(last_used) as last_used
          FROM daily_usage_stats
          ${startDateStr ? "WHERE date >= ?" : ""}
          GROUP BY actual_model, provider_id`,
          ...(startDateStr ? [startDateStr] : [])
        )
      : db.all<{
          actual_model: string;
          provider_id: string;
          count: number;
          prompt: number;
          completion: number;
          cached: number;
          cost: number;
          last_used: number;
        }>(
          `SELECT 
            actual_model,
            provider_id,
            COUNT(*) as count,
            COALESCE(SUM(prompt_tokens), 0) as prompt,
            COALESCE(SUM(completion_tokens), 0) as completion,
            COALESCE(SUM(cached_tokens), 0) as cached,
            COALESCE(SUM(cost), 0) as cost,
            MAX(timestamp) as last_used
          FROM request_logs
          WHERE timestamp >= ?
          GROUP BY actual_model, provider_id`,
          startTs
        );

    const byModel: Record<string, ModelCounterBucket> = {};
    for (const r of modelRows) {
      const modelName = r.actual_model || "unknown";
      const key = r.provider_id ? `${modelName} (${r.provider_id})` : modelName;
      const isoLastUsed = r.last_used ? new Date(r.last_used).toISOString() : undefined;
      const existing = byModel[key];
      if (existing) {
        existing.requests += Number(r.count || 0);
        existing.promptTokens += Number(r.prompt || 0);
        existing.completionTokens += Number(r.completion || 0);
        existing.cachedTokens += Number(r.cached || 0);
        existing.cost = Number((existing.cost + Number(r.cost || 0)).toFixed(4));
        if (isoLastUsed && (!existing.lastUsed || isoLastUsed > existing.lastUsed)) {
          existing.lastUsed = isoLastUsed;
        }
      } else {
        byModel[key] = {
          requests: Number(r.count || 0),
          promptTokens: Number(r.prompt || 0),
          completionTokens: Number(r.completion || 0),
          cachedTokens: Number(r.cached || 0),
          cost: Number((r.cost || 0).toFixed(4)),
          rawModel: modelName,
          provider: r.provider_id || undefined,
          lastUsed: isoLastUsed,
        };
      }
    }

    // 4. Breakdown by Account
    const acctRows = useDailyRollup
      ? db.all<{
          account_id: string;
          account_name: string;
          actual_model: string;
          provider_id: string;
          count: number;
          prompt: number;
          completion: number;
          cached: number;
          cost: number;
          last_used: number;
        }>(
          `SELECT 
            account_id,
            MAX(NULLIF(account_name, '')) as account_name,
            actual_model,
            provider_id,
            COALESCE(SUM(requests), 0) as count,
            COALESCE(SUM(prompt_tokens), 0) as prompt,
            COALESCE(SUM(completion_tokens), 0) as completion,
            COALESCE(SUM(cached_tokens), 0) as cached,
            COALESCE(SUM(cost), 0) as cost,
            MAX(last_used) as last_used
          FROM daily_usage_stats
          ${startDateStr ? "WHERE date >= ?" : ""}
          GROUP BY account_id, actual_model, provider_id`,
          ...(startDateStr ? [startDateStr] : [])
        )
      : db.all<{
          account_id: string;
          account_name: string;
          actual_model: string;
          provider_id: string;
          count: number;
          prompt: number;
          completion: number;
          cached: number;
          cost: number;
          last_used: number;
        }>(
          `SELECT 
            account_id,
            MAX(NULLIF(account_name, '')) as account_name,
            actual_model,
            provider_id,
            COUNT(*) as count,
            COALESCE(SUM(prompt_tokens), 0) as prompt,
            COALESCE(SUM(completion_tokens), 0) as completion,
            COALESCE(SUM(cached_tokens), 0) as cached,
            COALESCE(SUM(cost), 0) as cost,
            MAX(timestamp) as last_used
          FROM request_logs
          WHERE timestamp >= ?
          GROUP BY account_id, actual_model, provider_id`,
          startTs
        );

    const byAccount: Record<string, AccountCounterBucket> = {};
    for (const r of acctRows) {
      const aid = r.account_id || "default";
      const aname = r.account_name || `Account ${aid.slice(0, 8)}`;
      const modelName = r.actual_model || "unknown";
      const key = r.account_id
        ? `${modelName} (${r.provider_id || "unknown"} - ${aname} [${aid}])`
        : `${modelName} (${r.provider_id || "unknown"} - ${aname})`;
      const isoLastUsed = r.last_used ? new Date(r.last_used).toISOString() : undefined;
      const existing = byAccount[key];
      if (existing) {
        existing.requests += Number(r.count || 0);
        existing.promptTokens += Number(r.prompt || 0);
        existing.completionTokens += Number(r.completion || 0);
        existing.cachedTokens += Number(r.cached || 0);
        existing.cost = Number((existing.cost + Number(r.cost || 0)).toFixed(4));
        if (isoLastUsed && (!existing.lastUsed || isoLastUsed > existing.lastUsed)) {
          existing.lastUsed = isoLastUsed;
        }
      } else {
        byAccount[key] = {
          requests: Number(r.count || 0),
          promptTokens: Number(r.prompt || 0),
          completionTokens: Number(r.completion || 0),
          cachedTokens: Number(r.cached || 0),
          cost: Number((r.cost || 0).toFixed(4)),
          rawModel: modelName,
          provider: r.provider_id || undefined,
          accountId: r.account_id || undefined,
          accountName: aname,
          lastUsed: isoLastUsed,
        };
      }
    }

    // 5. Breakdown by API Key
    const apiKeyRows = useDailyRollup
      ? db.all<{
          api_key_id: string;
          api_key_name: string;
          count: number;
          prompt: number;
          completion: number;
          cached: number;
          cost: number;
          last_used: number;
        }>(
          `SELECT 
            COALESCE(NULLIF(api_key_id, ''), 'no_key') as api_key_id,
            COALESCE(MAX(NULLIF(api_key_name, '')), 'Direct / Public') as api_key_name,
            COALESCE(SUM(requests), 0) as count,
            COALESCE(SUM(prompt_tokens), 0) as prompt,
            COALESCE(SUM(completion_tokens), 0) as completion,
            COALESCE(SUM(cached_tokens), 0) as cached,
            COALESCE(SUM(cost), 0) as cost,
            MAX(last_used) as last_used
          FROM daily_usage_stats
          ${startDateStr ? "WHERE date >= ?" : ""}
          GROUP BY COALESCE(NULLIF(api_key_id, ''), 'no_key')`,
          ...(startDateStr ? [startDateStr] : [])
        )
      : db.all<{
          api_key_id: string;
          api_key_name: string;
          count: number;
          prompt: number;
          completion: number;
          cached: number;
          cost: number;
          last_used: number;
        }>(
          `SELECT 
            COALESCE(NULLIF(api_key_id, ''), 'no_key') as api_key_id,
            COALESCE(MAX(NULLIF(api_key_name, '')), 'Direct / Public') as api_key_name,
            COUNT(*) as count,
            COALESCE(SUM(prompt_tokens), 0) as prompt,
            COALESCE(SUM(completion_tokens), 0) as completion,
            COALESCE(SUM(cached_tokens), 0) as cached,
            COALESCE(SUM(cost), 0) as cost,
            MAX(timestamp) as last_used
          FROM request_logs
          WHERE timestamp >= ?
          GROUP BY COALESCE(NULLIF(api_key_id, ''), 'no_key')`,
          startTs
        );

    const byApiKey: Record<string, ApiKeyCounterBucket> = {};
    for (const r of apiKeyRows) {
      const kid = r.api_key_id || "no_key";
      const kname = r.api_key_name || (kid === "no_key" ? "Direct / Public" : `Key ${kid.slice(0, 8)}`);
      const isoLastUsed = r.last_used ? new Date(r.last_used).toISOString() : undefined;
      const existing = byApiKey[kid];
      if (existing) {
        existing.requests += Number(r.count || 0);
        existing.promptTokens += Number(r.prompt || 0);
        existing.completionTokens += Number(r.completion || 0);
        existing.cachedTokens += Number(r.cached || 0);
        existing.cost = Number((existing.cost + Number(r.cost || 0)).toFixed(4));
        if (kname && existing.apiKeyName === "Direct / Public") {
          existing.apiKeyName = kname;
        }
        if (isoLastUsed && (!existing.lastUsed || isoLastUsed > existing.lastUsed)) {
          existing.lastUsed = isoLastUsed;
        }
      } else {
        byApiKey[kid] = {
          requests: Number(r.count || 0),
          promptTokens: Number(r.prompt || 0),
          completionTokens: Number(r.completion || 0),
          cachedTokens: Number(r.cached || 0),
          cost: Number((r.cost || 0).toFixed(4)),
          apiKeyId: kid,
          apiKeyName: kname,
          lastUsed: isoLastUsed,
        };
      }
    }

    // 6. Recent Requests (20 entries)
    const recentRows = db.all<{
      id: string;
      timestamp: number;
      actual_model: string;
      requested_model: string;
      provider_id: string;
      prompt_tokens: number;
      completion_tokens: number;
      cached_tokens: number;
      cost: number;
      duration_ms: number;
      status: string;
    }>(
      `SELECT 
        id, timestamp, actual_model, requested_model, provider_id,
        prompt_tokens, completion_tokens, cached_tokens, cost, duration_ms, status
      FROM request_logs
      ORDER BY timestamp DESC
      LIMIT 20`
    );

    const recentRequests: RecentRequestItem[] = recentRows.map((r) => ({
      id: r.id,
      timestamp: r.timestamp,
      model: r.actual_model || r.requested_model,
      requestedModel: r.requested_model,
      provider: r.provider_id,
      promptTokens: r.prompt_tokens || 0,
      completionTokens: r.completion_tokens || 0,
      cachedTokens: r.cached_tokens || 0,
      cost: Number((r.cost || 0).toFixed(4)),
      durationMs: r.duration_ms || 0,
      status: r.status as any,
    }));

    const activeRequests = this.getActiveRequests();
    const isErrRecent = Date.now() - lastErrorProvider.ts < 10000;

    return {
      totalRequests,
      totalPromptTokens,
      totalCompletionTokens,
      totalCachedTokens,
      totalCost,
      totalTokensSaved,
      estimatedCostSavedUsd,
      byProvider,
      byModel,
      byAccount,
      byApiKey,
      activeRequests,
      recentRequests,
      errorProvider: isErrRecent ? lastErrorProvider.provider : undefined,
    };
  }

  public static getChartData(period: string = "7d"): ChartDataPoint[] {
    const db = getDatabase();
    const now = Date.now();

    if (period === "today") {
      const bucketCount = 24;
      const bucketMs = 3600000;
      const startOfDay = new Date();
      startOfDay.setHours(0, 0, 0, 0);
      const startTime = startOfDay.getTime();
      const endTime = startTime + bucketCount * bucketMs;

      const buckets: ChartDataPoint[] = Array.from({ length: bucketCount }, (_, i) => {
        const hour = String(i).padStart(2, "0") + ":00";
        return {
          label: hour,
          time: hour,
          tokens: 0,
          requests: 0,
          cost: 0,
        };
      });

      const rows = db.all<{
        timestamp: number;
        prompt: number;
        completion: number;
        cost: number;
      }>(
        `SELECT timestamp, prompt_tokens as prompt, completion_tokens as completion, cost
        FROM request_logs
        WHERE timestamp >= ? AND timestamp <= ?`,
        startTime,
        endTime
      );

      for (const r of rows) {
        const t = Number(r.timestamp);
        if (t < startTime || t >= endTime) continue;
        const idx = Math.floor((t - startTime) / bucketMs);
        if (idx >= 0 && idx < bucketCount) {
          buckets[idx].tokens += Number(r.prompt || 0) + Number(r.completion || 0);
          buckets[idx].requests += 1;
          buckets[idx].cost += Number(r.cost || 0);
        }
      }

      for (const b of buckets) {
        b.cost = Number(b.cost.toFixed(4));
      }
      return buckets;
    }

    if (period === "24h") {
      const bucketCount = 24;
      const bucketMs = 3600000;
      const startTime = now - bucketCount * bucketMs;

      const buckets: ChartDataPoint[] = Array.from({ length: bucketCount }, (_, i) => {
        const t = startTime + (i + 1) * bucketMs;
        const label = new Date(t).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: false });
        return {
          label,
          time: label,
          tokens: 0,
          requests: 0,
          cost: 0,
        };
      });

      const rows = db.all<{
        timestamp: number;
        prompt: number;
        completion: number;
        cost: number;
      }>(
        `SELECT timestamp, prompt_tokens as prompt, completion_tokens as completion, cost
        FROM request_logs
        WHERE timestamp >= ? AND timestamp <= ?`,
        startTime,
        now
      );

      for (const r of rows) {
        const t = Number(r.timestamp);
        if (t < startTime || t > now) continue;
        const idx = Math.min(Math.floor((t - startTime) / bucketMs), bucketCount - 1);
        if (idx >= 0 && idx < bucketCount) {
          buckets[idx].tokens += Number(r.prompt || 0) + Number(r.completion || 0);
          buckets[idx].requests += 1;
          buckets[idx].cost += Number(r.cost || 0);
        }
      }

      for (const b of buckets) {
        b.cost = Number(b.cost.toFixed(4));
      }
      return buckets;
    }

    // Daily buckets for 7d, 30d, 60d, 90d, all
    const bucketDays =
      period === "7d" ? 7 :
      period === "30d" ? 30 :
      period === "60d" ? 60 :
      period === "90d" ? 90 : 30;

    let startTime = now - (bucketDays - 1) * 86400000;
    if (period === "all") {
      const minRow = db.get<{ min_ts: number }>("SELECT MIN(timestamp) as min_ts FROM request_logs");
      const minDaily = db.get<{ min_date: string }>("SELECT MIN(date) as min_date FROM daily_usage_stats");
      if (minDaily?.min_date) {
        const [y, m, d] = minDaily.min_date.split("-").map(Number);
        const dMin = y && m && d ? new Date(y, m - 1, d).getTime() : new Date(minDaily.min_date).getTime();
        startTime = minRow?.min_ts ? Math.min(Number(minRow.min_ts), dMin) : dMin;
      } else if (minRow?.min_ts) {
        startTime = Number(minRow.min_ts);
      }
    }

    const startDay = new Date(startTime);
    startDay.setHours(0, 0, 0, 0);

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const dayDiff = Math.max(1, Math.round((today.getTime() - startDay.getTime()) / 86400000) + 1);
    const count = period === "all" ? dayDiff : bucketDays;

    const buckets: ChartDataPoint[] = [];
    const dateKeyMap = new Map<string, number>();

    for (let i = count - 1; i >= 0; i--) {
      const d = new Date(today.getFullYear(), today.getMonth(), today.getDate() - i);
      const dateKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
      const label = d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
      const idx = buckets.length;
      buckets.push({
        label,
        time: dateKey,
        tokens: 0,
        requests: 0,
        cost: 0,
      });
      dateKeyMap.set(dateKey, idx);
    }

    const minDay = new Date(today.getFullYear(), today.getMonth(), today.getDate() - (count - 1));
    const minTs = minDay.getTime();
    const minDateStr = `${minDay.getFullYear()}-${String(minDay.getMonth() + 1).padStart(2, "0")}-${String(minDay.getDate()).padStart(2, "0")}`;

    // Prefer aggregating from daily_usage_stats when available, fallback/merge from request_logs
    const hasDaily = Boolean(db.get<{ c: number }>("SELECT 1 as c FROM daily_usage_stats LIMIT 1"));
    if (hasDaily && (period === "30d" || period === "60d" || period === "90d" || period === "all")) {
      const dailyRows = db.all<{
        date: string;
        prompt_tokens: number;
        completion_tokens: number;
        requests: number;
        cost: number;
      }>(
        `SELECT date, SUM(prompt_tokens) as prompt_tokens, SUM(completion_tokens) as completion_tokens, SUM(requests) as requests, SUM(cost) as cost
        FROM daily_usage_stats
        WHERE date >= ?
        GROUP BY date`,
        minDateStr
      );

      for (const r of dailyRows) {
        const idx = dateKeyMap.get(r.date);
        if (idx !== undefined && idx >= 0 && idx < buckets.length) {
          buckets[idx].tokens += Number(r.prompt_tokens || 0) + Number(r.completion_tokens || 0);
          buckets[idx].requests += Number(r.requests || 0);
          buckets[idx].cost += Number(r.cost || 0);
        }
      }
    } else {
      const rows = db.all<{
        timestamp: number;
        prompt: number;
        completion: number;
        cost: number;
      }>(
        `SELECT timestamp, prompt_tokens as prompt, completion_tokens as completion, cost
        FROM request_logs
        WHERE timestamp >= ?`,
        minTs
      );

      for (const r of rows) {
        const d = new Date(Number(r.timestamp));
        const dateKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
        const idx = dateKeyMap.get(dateKey);
        if (idx !== undefined && idx >= 0 && idx < buckets.length) {
          buckets[idx].tokens += Number(r.prompt || 0) + Number(r.completion || 0);
          buckets[idx].requests += 1;
          buckets[idx].cost += Number(r.cost || 0);
        }
      }
    }

    for (const b of buckets) {
      b.cost = Number(b.cost.toFixed(4));
    }
    return buckets;
  }
}
