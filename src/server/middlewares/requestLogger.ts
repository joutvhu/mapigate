import type { Request, Response, NextFunction } from "express";
import crypto from "node:crypto";
import { logger, tagForSession, LogSymbol, formatTime, ANSI } from "../../shared/logger.js";
import { appendStructuredLog } from "../utils/consoleLogBuffer.js";

declare global {
  namespace Express {
    interface Request {
      reqId?: string;
      reqTag?: string;
    }
  }
}

/** Check if the request is a high-frequency polling endpoint or static asset */
function isNoisyPath(reqPath: string): boolean {
  if (
    reqPath === "/health" ||
    reqPath.startsWith("/api/console-logs") ||
    reqPath.startsWith("/api/stats") ||
    reqPath.startsWith("/assets/") ||
    /\.(js|css|png|jpg|jpeg|gif|svg|ico|woff|woff2|ttf|map)$/i.test(reqPath)
  ) {
    return true;
  }
  return false;
}

/** Extract client tool identification */
function getClientTool(req: Request): string {
  const custom = req.headers["x-client-tool"];
  if (custom && typeof custom === "string") return custom;
  const ua = req.headers["user-agent"] || "";
  if (typeof ua === "string") {
    if (ua.includes("Claude-Code") || ua.includes("claude-code")) return "claude-code";
    if (ua.includes("Cursor") || ua.includes("cursor")) return "cursor";
    if (ua.includes("Cline") || ua.includes("cline")) return "cline";
    if (ua.includes("Copilot") || ua.includes("copilot")) return "copilot";
    if (ua.includes("OpenCode") || ua.includes("opencode")) return "opencode";
    if (ua.length > 30) return ua.slice(0, 30) + "...";
    return ua || "unknown";
  }
  return "unknown";
}

/**
 * Express middleware for correlation tagging, incoming request logging,
 * and completion status/latency tracking.
 */
export function requestLogger(req: Request, res: Response, next: NextFunction): void {
  const startTime = Date.now();
  const incomingReqId = (req.headers["x-request-id"] as string) || crypto.randomUUID();
  const reqTag = tagForSession(incomingReqId);

  req.reqId = incomingReqId;
  req.reqTag = reqTag;

  const isNoisy = isNoisyPath(req.path);
  const isProxyRequest =
    req.path === "/v1/chat/completions" ||
    req.path === "/v1/messages" ||
    req.path.startsWith("/v1/");

  // Log incoming request
  if (isNoisy) {
    logger.debug("HTTP", `${req.method} ${req.path}`);
  } else if (isProxyRequest) {
    const clientTool = getClientTool(req);
    const model = req.body?.model ? ` · model: ${req.body.model}` : "";
    logger.line(
      reqTag,
      LogSymbol.INCOMING,
      `${req.method} ${req.path} · client: ${clientTool}${model}`
    );
  } else {
    logger.line(reqTag, LogSymbol.INCOMING, `${req.method} ${req.path}`);
  }

  // Response completion logging
  res.on("finish", () => {
    const durationMs = Date.now() - startTime;
    const status = res.statusCode;
    const isError = status >= 400;

    if (isNoisy) {
      if (isError) {
        logger.warn("HTTP", `${req.method} ${req.path} -> ${status} (${durationMs}ms)`);
      } else {
        logger.debug("HTTP", `${req.method} ${req.path} -> ${status} (${durationMs}ms)`);
      }
      return;
    }

    // Proxy requests have rich 📊 completion lines logged by chatProxy,
    // but on early errors (401, 404, etc.) before reaching chatProxy or for non-proxy APIs, log completion
    if (!isProxyRequest || isError) {
      const icon = isError ? "💥" : "📤";
      const color = isError ? ANSI.red : ANSI.green;
      const statusText = isError ? `${status} ERROR` : `${status} OK`;
      logger.line(
        reqTag,
        icon,
        `${color}${req.method} ${req.path} -> ${statusText} (${durationMs}ms)${ANSI.reset}`
      );

      if (isError) {
        appendStructuredLog({
          id: incomingReqId,
          timestamp: Date.now(),
          level: "error",
          category: isProxyRequest ? "proxy" : "system",
          message: `${req.method} ${req.path} -> ${statusText} (${durationMs}ms)`,
          requestId: incomingReqId,
          reqTag,
          gateway: isProxyRequest
            ? {
                clientTool: getClientTool(req),
                route: req.path,
                statusCode: status,
                durationMs,
              }
            : undefined,
          error: {
            status,
            message: statusText,
          },
          rawText: `[${formatTime()}] ${reqTag} ${icon} ${req.method} ${req.path} -> ${statusText} (${durationMs}ms)`,
        });
      }
    }
  });

  next();
}
