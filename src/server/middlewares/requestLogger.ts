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
    reqPath === "/" ||
    reqPath === "/chart" ||
    reqPath.startsWith("/api/console-logs") ||
    reqPath.startsWith("/api/stats") ||
    reqPath.startsWith("/api/usage") ||
    reqPath.startsWith("/api/models") ||
    reqPath.startsWith("/api/settings") ||
    reqPath.startsWith("/assets/") ||
    /\.(js|css|png|jpg|jpeg|gif|svg|ico|woff|woff2|ttf|map|html)$/i.test(reqPath)
  ) {
    return true;
  }
  return false;
}

/** Extract client tool identification */
function formatMessagePreview(msg: any, maxLen = 140): string {
  if (!msg) return "";
  const role = msg.role || msg.type || "unknown";

  if (role === "tool") {
    const callId = msg.tool_call_id ? ` [id: ${msg.tool_call_id}]` : "";
    const rawContent = msg.content;
    const content = typeof rawContent === "string" ? rawContent : JSON.stringify(rawContent ?? "");
    const trimmed = content.trim();
    if (!trimmed) {
      return `[tool${callId}] ⚠️ EMPTY RESULT (0 chars)`;
    }
    const snippet = trimmed.length > maxLen ? trimmed.slice(0, maxLen) + "..." : trimmed;
    return `[tool${callId} (${content.length} chars)] ${snippet.replace(/\r?\n/g, " ")}`;
  }

  if (role === "assistant") {
    if (Array.isArray(msg.tool_calls) && msg.tool_calls.length > 0) {
      const calls = msg.tool_calls
        .map((tc: any) => {
          const name = tc.function?.name || "tool";
          const args = tc.function?.arguments ? tc.function.arguments.slice(0, maxLen) : "";
          return `${name}(${args})` + (tc.id ? ` [id: ${tc.id}]` : "");
        })
        .join(", ");
      return `[assistant] 🛠️ tool_calls: ${calls}`;
    }
    const content = typeof msg.content === "string" ? msg.content : JSON.stringify(msg.content ?? "");
    const trimmed = content.trim();
    const snippet = trimmed.length > maxLen ? trimmed.slice(0, maxLen) + "..." : trimmed;
    return `[assistant] ${snippet.replace(/\r?\n/g, " ")}`;
  }

  if (role === "user") {
    let text = "";
    if (typeof msg.content === "string") {
      text = msg.content;
    } else if (Array.isArray(msg.content)) {
      text = msg.content.map((p: any) => p?.text || (p?.type ? `[${p.type}]` : "")).filter(Boolean).join(" ");
    } else {
      text = JSON.stringify(msg.content ?? "");
    }
    const trimmed = text.trim();
    const snippet = trimmed.length > maxLen ? trimmed.slice(0, maxLen) + "..." : trimmed;
    return `[user] ${snippet.replace(/\r?\n/g, " ")}`;
  }

  if (role === "function_call") {
    const args = typeof msg.arguments === "string" ? msg.arguments.slice(0, maxLen) : JSON.stringify(msg.arguments || "").slice(0, maxLen);
    return `[function_call] 🛠️ ${msg.name}(${args}) [id: ${msg.call_id || ""}]`;
  }

  if (role === "function_call_output") {
    const outStr = typeof msg.output === "string" ? msg.output : JSON.stringify(msg.output ?? "");
    const trimmed = outStr.trim();
    if (!trimmed) {
      return `[function_call_output id:${msg.call_id || ""}] ⚠️ EMPTY OUTPUT (0 chars)`;
    }
    const snippet = trimmed.length > maxLen ? trimmed.slice(0, maxLen) + "..." : trimmed;
    return `[function_call_output id:${msg.call_id || ""} (${outStr.length} chars)] ${snippet.replace(/\r?\n/g, " ")}`;
  }

  return `[${role}]`;
}

function formatTurnTail(messages: any[], count = 2, maxLen = 140): string[] {
  if (!Array.isArray(messages) || messages.length === 0) return [];
  const tail = messages.slice(-count);
  return tail.map((m) => formatMessagePreview(m, maxLen));
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
    if (ua.includes("kiro") || ua.includes("Kiro") || ua.includes("aws-sdk-js")) return "kiro";
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
    // Completely mute high-frequency dashboard polling & static assets from incoming log
  } else if (isProxyRequest) {
    const clientTool = getClientTool(req);
    const model = req.body?.model ? ` · model: ${req.body.model}` : "";
    const streamInfo = req.body?.stream !== undefined ? (req.body.stream ? " (stream)" : " (sync)") : "";
    logger.line(
      reqTag,
      LogSymbol.INCOMING,
      `${req.method} ${req.path} · client: ${clientTool}${model}${streamInfo}`
    );

    const messages = Array.isArray(req.body?.messages)
      ? req.body.messages
      : Array.isArray(req.body?.input)
      ? req.body.input
      : [];
    const msgCount = messages.length;
    const tools = Array.isArray(req.body?.tools) ? req.body.tools : [];
    const toolNames = tools.map((t: any) => t.function?.name || t.name).filter(Boolean);

    if (logger.isDebugEnabled()) {
      const details: string[] = [];
      if (msgCount > 0) details.push(`${msgCount} msgs`);
      if (toolNames.length > 0) {
        const toolList = toolNames.length <= 5
          ? `[${toolNames.join(", ")}]`
          : `[${toolNames.slice(0, 4).join(", ")}, +${toolNames.length - 4} more]`;
        details.push(`${toolNames.length} tools: ${toolList}`);
      }
      if (req.body?.max_tokens) details.push(`max_tokens: ${req.body.max_tokens}`);
      if (req.body?.temperature !== undefined) details.push(`temp: ${req.body.temperature}`);
      const detailStr = details.length > 0 ? ` (${details.join(", ")})` : "";
      logger.debug("PROXY", `[${reqTag}] Incoming request: ${req.method} ${req.path}${detailStr}`);

      if (msgCount > 0) {
        const tailLines = formatTurnTail(messages, 2, 140);
        for (const line of tailLines) {
          logger.debug("PROXY", `[${reqTag}]   ↳ ${line}`);
        }
      }
    }

    if (logger.isTraceEnabled()) {
      try {
        if (msgCount > 2) {
          const tailLines = formatTurnTail(messages, 4, 300);
          logger.trace("PROXY", `[${reqTag}] Conversation turn tail (last ${tailLines.length} msgs):`);
          for (const line of tailLines) {
            logger.trace("PROXY", `[${reqTag}]     ${line}`);
          }
        } else {
          const preview = JSON.stringify(logger.sanitize(req.body)).slice(0, 1000);
          logger.trace("PROXY", `[${reqTag}] Payload preview: ${preview}`);
        }
      } catch {}
    }
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
      }
      return;
    }

    // Proxy requests have rich 📊 completion lines logged by chatProxy,
    // but on early errors (401, 404, etc.) before reaching chatProxy or for non-proxy APIs, log completion
    if (!isProxyRequest || isError) {
      const icon = isError ? "💥" : "📤";
      const color = isError ? ANSI.red : ANSI.green;
      const statusText = isError ? `${status} ERROR` : `${status} OK`;
      const level = isError ? (status === 429 ? "warn" : "error") : "info";
      logger.line(
        reqTag,
        icon,
        `${color}${req.method} ${req.path} -> ${statusText} (${durationMs}ms)${ANSI.reset}`
      );

      if (isError) {
        appendStructuredLog({
          id: incomingReqId,
          timestamp: Date.now(),
          level,
          category: isProxyRequest ? "proxy" : "system",
          message: `${req.method} ${req.path} -> ${statusText} (${durationMs}ms)`,
          requestId: incomingReqId,
          reqTag,
          gateway: isProxyRequest
            ? {
                clientTool: getClientTool(req),
                route: req.path,
                method: req.method,
                requestedModel: req.body?.model,
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
