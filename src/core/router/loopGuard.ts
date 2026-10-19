import { SettingsRepository, type LoopGuardSettings } from "../../storage/repositories/settingsRepo.js";
import { logger } from "../../shared/logger.js";

interface LoopSignatureRecord {
  count: number;
  lastTimestamp: number;
}

interface ToolLoopRecord {
  lastToolSignature: string;
  count: number;
  lastTimestamp: number;
}

// In-memory registry tracking consecutive empty/zero-token turns
const loopRegistry = new Map<string, LoopSignatureRecord>();
// In-memory registry tracking consecutive identical tool-call turns
const toolLoopRegistry = new Map<string, ToolLoopRecord>();

const CLEANUP_INTERVAL_MS = 60_000;
const RECORD_TTL_MS = 120_000;

setInterval(() => {
  const now = Date.now();
  for (const [key, record] of loopRegistry.entries()) {
    if (now - record.lastTimestamp > RECORD_TTL_MS) {
      loopRegistry.delete(key);
    }
  }
  for (const [key, record] of toolLoopRegistry.entries()) {
    if (now - record.lastTimestamp > RECORD_TTL_MS) {
      toolLoopRegistry.delete(key);
    }
  }
}, CLEANUP_INTERVAL_MS).unref();

function getToolLoopKey(signature: string): string {
  const parts = signature.split(":");
  if (parts.length >= 2) {
    return `${parts[0]}:${parts[1]}`;
  }
  return signature;
}

function canonicalizeValue(val: any): any {
  if (val === null || val === undefined) return "";
  if (typeof val === "string") {
    const trimmed = val.trim();
    try {
      const parsed = JSON.parse(trimmed);
      if (typeof parsed === "object" && parsed !== null) {
        return canonicalizeValue(parsed);
      }
    } catch {
      return trimmed;
    }
    return trimmed;
  }
  if (Array.isArray(val)) {
    return val.map(canonicalizeValue);
  }
  if (typeof val === "object") {
    const sorted: Record<string, any> = {};
    for (const k of Object.keys(val).sort()) {
      sorted[k] = canonicalizeValue(val[k]);
    }
    return sorted;
  }
  return val;
}

const META_TOOL_NAMES = new Set([
  "update_session_information",
  "set_session_info",
  "heartbeat",
]);

function normalizeToolArguments(toolName: string, rawArgs: any): any {
  const canon = canonicalizeValue(rawArgs);
  const baseName = (toolName || "").split(":").pop() || "";
  const lowerName = baseName.toLowerCase();

  // Meta-tools: signature strictly by tool name (ignore description or any parameters)
  if (META_TOOL_NAMES.has(lowerName)) {
    return {};
  }

  // file_search: strip explanation, compare only query and excludePattern
  if (
    (lowerName === "file_search" || lowerName === "filesearch") &&
    canon &&
    typeof canon === "object" &&
    !Array.isArray(canon)
  ) {
    const filtered: Record<string, any> = {};
    if ("query" in canon) filtered.query = canon.query;
    if ("excludePattern" in canon) filtered.excludePattern = canon.excludePattern;
    return filtered;
  }

  // read_file: compare only path, offset, limit, ignoring explanation fields
  if (
    (lowerName === "read_file" || lowerName === "readfile") &&
    canon &&
    typeof canon === "object" &&
    !Array.isArray(canon)
  ) {
    const filtered: Record<string, any> = {};
    if ("path" in canon) filtered.path = canon.path;
    if ("offset" in canon) filtered.offset = canon.offset;
    if ("limit" in canon) filtered.limit = canon.limit;
    return filtered;
  }

  return canon;
}

/**
 * Computes a normalized signature for a set of tool calls to detect identical repetitions.
 */
export function computeToolCallSignature(
  toolCalls?: Array<{ name?: string; function?: { name?: string; arguments?: any }; arguments?: any }>
): string | null {
  if (!Array.isArray(toolCalls) || toolCalls.length === 0) return null;
  const items: string[] = [];
  for (const tc of toolCalls) {
    const name = tc?.function?.name || tc?.name || "";
    if (!name) continue;
    const rawArgs = tc?.function?.arguments ?? tc?.arguments ?? "";
    const canon = normalizeToolArguments(name, rawArgs);
    items.push(`${name}:${JSON.stringify(canon)}`);
  }
  if (items.length === 0) return null;
  return items.sort().join("|");
}

function extractAssistantToolSignature(msg: any): string | null {
  if (!msg || (msg.role !== "assistant" && msg.role !== "model")) return null;

  if (Array.isArray(msg.tool_calls) && msg.tool_calls.length > 0) {
    return computeToolCallSignature(msg.tool_calls);
  }

  if (Array.isArray(msg.content)) {
    const calls: Array<{ name: string; arguments: any }> = [];
    for (const part of msg.content) {
      if (part?.type === "tool_use" || part?.type === "function_call") {
        calls.push({
          name: part.name || "",
          arguments: part.input ?? part.arguments ?? {},
        });
      }
    }
    if (calls.length > 0) {
      return computeToolCallSignature(calls);
    }
  }

  if (Array.isArray(msg.parts)) {
    const calls: Array<{ name: string; arguments: any }> = [];
    for (const part of msg.parts) {
      if (part?.functionCall) {
        calls.push({
          name: part.functionCall.name || "",
          arguments: part.functionCall.args || {},
        });
      }
    }
    if (calls.length > 0) {
      return computeToolCallSignature(calls);
    }
  }

  if (msg.function_call) {
    return computeToolCallSignature([msg.function_call]);
  }

  return null;
}

/**
 * Inspects conversation history to detect if recent assistant turns repeated the exact same tool calls.
 */
export function detectToolCallLoopInMessages(
  messages: any[],
  threshold = 3
): { isLoop: boolean; count: number; toolName?: string } {
  if (!Array.isArray(messages) || messages.length === 0) {
    return { isLoop: false, count: 0 };
  }

  const assistantSigs: Array<{ sig: string | null; msg: any }> = [];
  for (const m of messages) {
    if (m && (m.role === "assistant" || m.role === "model")) {
      assistantSigs.push({
        sig: extractAssistantToolSignature(m),
        msg: m,
      });
    }
  }

  if (assistantSigs.length === 0) {
    return { isLoop: false, count: 0 };
  }

  const lastTurn = assistantSigs[assistantSigs.length - 1];
  if (!lastTurn.sig) {
    return { isLoop: false, count: 0 };
  }

  const targetSig = lastTurn.sig;
  let count = 0;
  for (let i = assistantSigs.length - 1; i >= 0; i--) {
    if (assistantSigs[i].sig === targetSig) {
      count++;
    } else {
      break;
    }
  }

  const toolName = targetSig.split(":")[0];
  if (count >= threshold) {
    return { isLoop: true, count, toolName };
  }

  return { isLoop: false, count, toolName };
}

/**
 * Computes a unique signature for the request state to identify repeated identical turns.
 */
export function computeLoopSignature(
  clientTool: string,
  model: string,
  messagesCount: number,
  lastMsgPreview?: string
): string {
  const prefix = (lastMsgPreview || "").replace(/\s+/g, " ").trim().slice(0, 60);
  return `${clientTool || "client"}:${model}:${messagesCount}:${prefix}`;
}

/**
 * Checks whether the current request signature has hit the consecutive empty turns or tool loop limit.
 */
export function checkLoopGuard(
  signature: string,
  settings?: LoopGuardSettings,
  messages?: any[]
): { shouldHalt: boolean; reason?: "empty_turn" | "tool_loop"; count: number } {
  const guard = settings || SettingsRepository.getLoopGuardSettings();
  if (!guard.enabled) {
    return { shouldHalt: false, count: 0 };
  }

  const maxToolCalls = Math.max(2, guard.maxConsecutiveToolCalls ?? 3);
  const maxAttempts = Math.max(2, guard.maxConsecutiveEmpty ?? 3);

  // 1. Check conversation history messages if provided
  if (Array.isArray(messages) && messages.length > 0) {
    const msgLoop = detectToolCallLoopInMessages(messages, maxToolCalls);
    if (msgLoop.isLoop) {
      return { shouldHalt: true, reason: "tool_loop", count: msgLoop.count };
    }
  }

  // 2. Check in-memory tool loop tracking
  const baseKey = getToolLoopKey(signature);
  const toolRecord = toolLoopRegistry.get(signature) || toolLoopRegistry.get(baseKey);
  if (toolRecord && toolRecord.count >= maxToolCalls) {
    return { shouldHalt: true, reason: "tool_loop", count: toolRecord.count };
  }

  // 3. Check in-memory empty turn tracking
  const emptyRecord = loopRegistry.get(signature);
  if (emptyRecord && emptyRecord.count >= maxAttempts) {
    return { shouldHalt: true, reason: "empty_turn", count: emptyRecord.count };
  }

  const highestCount = Math.max(emptyRecord?.count || 0, toolRecord?.count || 0);
  return { shouldHalt: false, count: highestCount };
}

/**
 * Records the turn result. If 0 output tokens were produced, increments the empty turn count.
 * If tool calls were made, tracks consecutive repetitions without being cleared by outputTokens > 0.
 * If normal text output was produced without tool calls, resets both counters.
 */
export function recordLoopTurnResult(
  signature: string,
  outputTokens: number,
  toolCalls?: Array<{ name: string; arguments?: any }>
): void {
  const settings = SettingsRepository.getLoopGuardSettings();
  if (!settings.enabled) return;

  const now = Date.now();

  // 1. Empty turn tracking
  if (outputTokens === 0) {
    const existing = loopRegistry.get(signature);
    const count = (existing?.count || 0) + 1;
    loopRegistry.set(signature, {
      count,
      lastTimestamp: now,
    });
  } else {
    loopRegistry.delete(signature);
  }

  // 2. Tool call loop tracking
  const toolSig = computeToolCallSignature(toolCalls);
  const baseKey = getToolLoopKey(signature);

  if (toolSig) {
    for (const key of [signature, baseKey]) {
      const existing = toolLoopRegistry.get(key);
      if (existing && existing.lastToolSignature === toolSig) {
        toolLoopRegistry.set(key, {
          lastToolSignature: toolSig,
          count: existing.count + 1,
          lastTimestamp: now,
        });
      } else {
        toolLoopRegistry.set(key, {
          lastToolSignature: toolSig,
          count: 1,
          lastTimestamp: now,
        });
      }
    }
  } else {
    toolLoopRegistry.delete(signature);
    toolLoopRegistry.delete(baseKey);
  }
}

/**
 * Resets the loop guard cache for a given signature or completely.
 */
export function resetLoopGuard(signature?: string): void {
  if (signature) {
    loopRegistry.delete(signature);
    toolLoopRegistry.delete(signature);
    toolLoopRegistry.delete(getToolLoopKey(signature));
  } else {
    loopRegistry.clear();
    toolLoopRegistry.clear();
  }
}
