import { getDatabase } from "../database.js";
import { SettingsRepository } from "./settingsRepo.js";
import type {
  RequestDetail,
  RequestDetailFilter,
  RequestDetailsListResponse,
} from "../../shared/types/index.js";

export function getMaxRecords(): number {
  const fromEnv = Number(process.env.MAPIGATE_MAX_REQUEST_DETAILS);
  if (!isNaN(fromEnv) && fromEnv > 0) return fromEnv;
  try {
    const fromSettings = SettingsRepository.getSetting<number>("maxRequestDetails");
    if (typeof fromSettings === "number" && fromSettings > 0) return fromSettings;
  } catch {}
  return 1000;
}

const DEFAULT_BATCH_SIZE = 10;
const DEFAULT_FLUSH_INTERVAL_MS = 3000;
const MAX_JSON_SIZE = 1024 * 1024; // 1MB max per json payload to preserve full coding assistant payloads

let writeBuffer: RequestDetail[] = [];
let flushTimer: NodeJS.Timeout | null = null;
let isFlushing = false;

function sanitizeHeaders(headers?: Record<string, string>): Record<string, string> {
  if (!headers || typeof headers !== "object") return {};
  const sensitiveKeys = ["authorization", "x-api-key", "cookie", "token", "api-key"];
  const sanitized: Record<string, string> = {};

  for (const [key, value] of Object.entries(headers)) {
    if (sensitiveKeys.some((s) => key.toLowerCase().includes(s))) {
      sanitized[key] = "[REDACTED]";
    } else {
      sanitized[key] = value;
    }
  }
  return sanitized;
}

function truncatePayload<T = any>(obj: T, maxSize: number = MAX_JSON_SIZE): T {
  if (!obj) return obj;
  try {
    const str = JSON.stringify(obj);
    if (str.length > maxSize) {
      return {
        _truncated: true,
        _originalSize: str.length,
        _preview: str.substring(0, 500) + "... [truncated]",
      } as any;
    }
    return obj;
  } catch {
    return obj;
  }
}

export function flushRequestDetailsBuffer(): void {
  if (isFlushing || writeBuffer.length === 0) return;
  isFlushing = true;

  try {
    const items = writeBuffer.splice(0, writeBuffer.length);
    const db = getDatabase();

    for (const item of items) {
      const sanitizedItem: RequestDetail = {
        ...item,
        request: item.request
          ? {
              ...item.request,
              headers: sanitizeHeaders(item.request.headers),
              body: truncatePayload(item.request.body),
            }
          : undefined,
        providerRequest: item.providerRequest
          ? {
              ...item.providerRequest,
              headers: sanitizeHeaders(item.providerRequest.headers),
              body: truncatePayload(item.providerRequest.body),
            }
          : undefined,
        providerResponse: item.providerResponse
          ? {
              ...item.providerResponse,
              headers: sanitizeHeaders(item.providerResponse.headers),
              body: truncatePayload(item.providerResponse.body),
            }
          : undefined,
        response: item.response
          ? {
              ...item.response,
              headers: sanitizeHeaders(item.response.headers),
              body: truncatePayload(item.response.body),
            }
          : undefined,
      };

      const tsString =
        typeof sanitizedItem.timestamp === "number"
          ? new Date(sanitizedItem.timestamp).toISOString()
          : String(sanitizedItem.timestamp || new Date().toISOString());

      db.run(
        `INSERT OR REPLACE INTO request_details (
          id, timestamp, provider, model, connection_id, status, data
        ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
        sanitizedItem.id,
        tsString,
        sanitizedItem.provider || null,
        sanitizedItem.model || null,
        sanitizedItem.connectionId || null,
        String(sanitizedItem.status || "ok"),
        JSON.stringify(sanitizedItem)
      );
    }

    // Retention prune if table count exceeds limit
    const maxRecords = getMaxRecords();
    const countRow = db.get<{ count: number }>("SELECT COUNT(*) as count FROM request_details");
    const totalCount = countRow?.count || 0;
    if (totalCount > maxRecords) {
      const excess = totalCount - maxRecords;
      db.run(
        `DELETE FROM request_details WHERE id IN (
          SELECT id FROM request_details ORDER BY timestamp ASC LIMIT ?
        )`,
        excess
      );
    }
  } catch (err) {
    console.warn("[requestDetailsRepo] Batch flush error:", err);
  } finally {
    isFlushing = false;
  }
}

function scheduleFlush(): void {
  if (!flushTimer) {
    flushTimer = setTimeout(() => {
      flushTimer = null;
      flushRequestDetailsBuffer();
    }, DEFAULT_FLUSH_INTERVAL_MS);
    flushTimer.unref?.();
  }
}

// Hook process exit to flush remaining writes
process.once("exit", () => flushRequestDetailsBuffer());
process.once("SIGINT", () => flushRequestDetailsBuffer());
process.once("SIGTERM", () => flushRequestDetailsBuffer());

export class RequestDetailsRepository {
  public static saveRequestDetail(detail: RequestDetail): void {
    const mode = SettingsRepository.getObservabilityMode();
    if (mode === "off") {
      return;
    }

    const isError =
      (typeof detail.status === "number" && detail.status >= 400) ||
      detail.status === "error" ||
      detail.status === "rate_limited" ||
      Boolean(detail.errorMessage);

    // In 'errors_only' mode, for successful (200 OK) requests,
    // do not store heavy JSON body payloads (prompt/response) to save 99% disk space,
    // while keeping headers, token metrics, latencies, and tool identifiers intact.
    let itemToSave = detail;
    if (mode === "errors_only" && !isError) {
      itemToSave = {
        ...detail,
        request: detail.request ? { headers: detail.request.headers } : undefined,
        providerRequest: detail.providerRequest
          ? { url: detail.providerRequest.url, headers: detail.providerRequest.headers }
          : undefined,
        providerResponse: detail.providerResponse
          ? { status: detail.providerResponse.status, headers: detail.providerResponse.headers }
          : undefined,
        response: detail.response
          ? { status: detail.response.status, headers: detail.response.headers }
          : undefined,
      };
    }

    writeBuffer.push(itemToSave);
    if (writeBuffer.length >= DEFAULT_BATCH_SIZE) {
      if (flushTimer) {
        clearTimeout(flushTimer);
        flushTimer = null;
      }
      flushRequestDetailsBuffer();
    } else {
      scheduleFlush();
    }
  }

  public static getRequestDetails(filter: RequestDetailFilter = {}): RequestDetailsListResponse {
    // Flush pending memory items first to ensure immediate consistency
    if (writeBuffer.length > 0) {
      flushRequestDetailsBuffer();
    }

    const db = getDatabase();
    const conds: string[] = [];
    const params: any[] = [];

    if (filter.provider && filter.provider !== "all") {
      conds.push("provider = ?");
      params.push(filter.provider);
    }
    if (filter.model && filter.model !== "all") {
      conds.push("model LIKE ?");
      params.push(`%${filter.model}%`);
    }
    if (filter.status && filter.status !== "all") {
      conds.push("status = ?");
      params.push(filter.status);
    }
    if (filter.search) {
      conds.push("(model LIKE ? OR provider LIKE ? OR id LIKE ? OR connection_id LIKE ?)");
      const term = `%${filter.search}%`;
      params.push(term, term, term, term);
    }
    if (filter.startDate) {
      conds.push("timestamp >= ?");
      params.push(filter.startDate);
    }
    if (filter.endDate) {
      conds.push("timestamp <= ?");
      params.push(filter.endDate);
    }

    const whereClause = conds.length ? `WHERE ${conds.join(" AND ")}` : "";

    const countRow = db.get<{ count: number }>(
      `SELECT COUNT(*) as count FROM request_details ${whereClause}`,
      ...params
    );
    const totalItems = countRow?.count || 0;

    const page = Math.max(1, Number(filter.page) || 1);
    const pageSize = Math.min(100, Math.max(1, Number(filter.pageSize) || 20));
    const totalPages = Math.ceil(totalItems / pageSize) || 1;
    const offset = (page - 1) * pageSize;

    const rows = db.all<{ data: string }>(
      `SELECT data FROM request_details ${whereClause} ORDER BY timestamp DESC LIMIT ? OFFSET ?`,
      ...params,
      pageSize,
      offset
    );

    const details: RequestDetail[] = rows
      .map((r) => {
        try {
          return JSON.parse(r.data);
        } catch {
          return null;
        }
      })
      .filter(Boolean) as RequestDetail[];

    return {
      details,
      pagination: {
        page,
        pageSize,
        totalItems,
        totalPages,
        hasNext: page < totalPages,
        hasPrev: page > 1,
      },
    };
  }

  public static getRequestDetailById(id: string): RequestDetail | null {
    if (writeBuffer.length > 0) {
      flushRequestDetailsBuffer();
    }

    const db = getDatabase();
    const row = db.get<{ data: string }>("SELECT data FROM request_details WHERE id = ?", id);
    if (!row) return null;

    try {
      return JSON.parse(row.data) as RequestDetail;
    } catch {
      return null;
    }
  }

  public static getDistinctProviders(): string[] {
    const db = getDatabase();
    const rows = db.all<{ provider: string }>(
      "SELECT DISTINCT provider FROM request_details WHERE provider IS NOT NULL AND provider != '' ORDER BY provider ASC"
    );
    return rows.map((r) => r.provider).filter(Boolean);
  }
}
