import crypto from "node:crypto";

/**
 * OpenCode Free Constants
 */
export const OPENCODE_UA = "opencode/1.18.31";
export const OPENCODE_BASE_URL = "https://opencode.ai";
export const OPENCODE_FINGERPRINT_TOOLS = ["bash", "glob", "grep", "read"] as const;
export const OPENCODE_SESSION_RE = /^ses_[0-9a-f]{12}[0-9A-Za-z]{14}$/;
export const OPENCODE_REQUEST_RE = /^msg_[0-9a-f]{12}[0-9A-Za-z]{14}$/;

const BASE62_CHARS = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";

let lastTimestamp = 0;
let counter = 0;

function unstableRandom(): string {
  const bytes = crypto.randomBytes(14);
  let randomPart = "";
  for (let i = 0; i < 14; i++) {
    randomPart += BASE62_CHARS[bytes[i] % 62];
  }
  return randomPart;
}

/**
 * Generates an OpenCode canonical session ID in the format: ses_<12 hex><14 base62>
 */
export function generateSessionId(timestamp = Date.now()): string {
  if (timestamp !== lastTimestamp) {
    lastTimestamp = timestamp;
    counter = 0;
  }
  counter++;

  const current = BigInt(timestamp) * 0x1000n + BigInt(counter);
  const value = ~current;
  const time = Array.from({ length: 6 }, (_, index) =>
    Number((value >> BigInt(40 - 8 * index)) & 0xffn)
      .toString(16)
      .padStart(2, "0")
  ).join("");
  return `ses_${time}${unstableRandom()}`;
}

/**
 * Generates an OpenCode request ID in the format: msg_<12 hex><14 base62>
 */
export function generateRequestId(timestamp = Date.now()): string {
  const current = BigInt(timestamp) * 0x1000n + 1n;
  const value = current;
  const time = Array.from({ length: 6 }, (_, index) =>
    Number((value >> BigInt(40 - 8 * index)) & 0xffn)
      .toString(16)
      .padStart(2, "0")
  ).join("");
  return `msg_${time}${unstableRandom()}`;
}

/**
 * Deterministically derives an OpenCode session ID from an existing caller ID or tool string
 */
export function translateSessionId(sessionId: string, clientTool = ""): string {
  if (typeof sessionId === "string" && OPENCODE_SESSION_RE.test(sessionId.trim())) {
    return sessionId.trim();
  }
  const digest = crypto
    .createHash("sha256")
    .update(`opencode\0${clientTool || "generic"}\0${sessionId || ""}`)
    .digest();
  const timeHex = digest.subarray(0, 6).toString("hex");
  let randomPart = "";
  for (let i = 6; i < 20; i++) {
    randomPart += BASE62_CHARS[digest[i] % 62];
  }
  return `ses_${timeHex}${randomPart}`;
}

// In-memory stable session cache per identity with TTL
const stableOpencodeSessions = new Map<string, { sessionId: string; lastUsed: number }>();
const MAX_STABLE_SESSIONS = 1000;
const SESSION_TTL_MS = 30 * 60 * 1000; // 30 minutes

/**
 * Retrieves or establishes a stable OpenCode session for a given client identity.
 * Reusing canonical session IDs prevents upstream free-tier quota burning (429 FreeUsageLimitError).
 */
export function getStableSessionId(identityKey = "default"): string {
  const existing = stableOpencodeSessions.get(identityKey);
  const now = Date.now();
  if (existing && now - existing.lastUsed < SESSION_TTL_MS) {
    existing.lastUsed = now;
    return existing.sessionId;
  }
  const sessionId = generateSessionId(now);
  if (stableOpencodeSessions.size >= MAX_STABLE_SESSIONS) {
    const oldestKey = stableOpencodeSessions.keys().next().value;
    if (oldestKey) stableOpencodeSessions.delete(oldestKey);
  }
  stableOpencodeSessions.set(identityKey, { sessionId, lastUsed: now });
  return sessionId;
}

export function clearStableSessions(): void {
  stableOpencodeSessions.clear();
}

function lastUserText(body: any): string {
  try {
    if (!body || typeof body !== "object") return "";
    const arr = Array.isArray(body.messages)
      ? body.messages
      : Array.isArray(body.contents)
      ? body.contents
      : Array.isArray(body.input)
      ? body.input
      : null;
    if (!arr) return typeof body.input === "string" ? body.input.slice(-600) : "";
    for (let i = arr.length - 1; i >= 0; i--) {
      const msg = arr[i];
      if (!msg) continue;
      if (msg.role && msg.role !== "user") continue;
      const content = msg.content;
      if (typeof content === "string" && content.trim()) return content.trim().slice(-600);
      if (Array.isArray(content)) {
        const text = content
          .map((part: any) => (typeof part === "string" ? part : part?.text || part?.input_text || ""))
          .join(" ")
          .trim();
        if (text) return text.slice(-600);
      }
    }
  } catch {
    return "";
  }
  return "";
}

/**
 * Deterministically derives an OpenCode request ID from the session and last user message.
 */
export function deriveRequestId(sessionId: string, body?: any): string {
  const text = lastUserText(body);
  if (!text) return generateRequestId();
  const digest = crypto
    .createHash("sha256")
    .update(`opencode-req\0${sessionId || ""}\0${text}`)
    .digest();
  const timeHex = digest.subarray(0, 6).toString("hex");
  let randomPart = "";
  for (let i = 6; i < 20; i++) {
    randomPart += BASE62_CHARS[digest[i] % 62];
  }
  const id = `msg_${timeHex}${randomPart}`;
  return OPENCODE_REQUEST_RE.test(id) ? id : generateRequestId();
}

/**
 * Canonical lowercase name when `name` is a quartet member; "" otherwise.
 */
export function fingerprintToolKey(name: unknown): string {
  const lower = String(name ?? "").trim().toLowerCase();
  return (OPENCODE_FINGERPRINT_TOOLS as readonly string[]).includes(lower) ? lower : "";
}

/**
 * Read a tool name from either flat ({name}) or chat ({function:{name}}) shape.
 */
function toolNameOf(tool: any): string {
  if (!tool || typeof tool !== "object" || Array.isArray(tool)) return "";
  if (typeof tool.name === "string" && tool.name.trim()) return tool.name.trim();
  const fn = tool.function;
  if (fn && typeof fn === "object" && !Array.isArray(fn) && typeof fn.name === "string") {
    return fn.name.trim();
  }
  return "";
}

/**
 * Canonicalize only the fingerprint quartet and remove duplicate quartet variants.
 * Returns the modified tool definitions and a mapping of sent lowercase name -> original name.
 */
export function concealFingerprintToolNames(tools: any[]): { tools: any[]; map: Map<string, string> } {
  const map = new Map<string, string>();
  if (!Array.isArray(tools) || tools.length === 0) return { tools: tools || [], map };

  const seenQuartet = new Set<string>();
  const out: any[] = [];
  for (const tool of tools) {
    if (!tool || typeof tool !== "object" || Array.isArray(tool)) {
      out.push(tool);
      continue;
    }

    const current = toolNameOf(tool);
    const key = fingerprintToolKey(current);
    if (!key) {
      out.push(tool);
      continue;
    }

    if (seenQuartet.has(key)) continue;
    seenQuartet.add(key);

    if (current !== key) {
      map.set(key, current);
      const fn = tool.function && typeof tool.function === "object" && !Array.isArray(tool.function)
        ? tool.function
        : null;
      out.push(fn ? { ...tool, function: { ...fn, name: key } } : { ...tool, name: key });
    } else {
      out.push(tool);
    }
  }
  return { tools: out, map };
}

export type FingerprintFormat = "openai" | "claude" | "flat";

/**
 * Append missing quartet declarations as disabled decoy functions.
 * Format-aware: generates Anthropic { name, description, input_schema } for "claude",
 * flat { type: "function", name, description, parameters } for "flat",
 * or nested { type: "function", function: { ... } } for "openai".
 */
export function appendMissingFingerprintTools(
  tools: any[],
  format: FingerprintFormat | boolean = "openai"
): any[] {
  const list = Array.isArray(tools) ? [...tools] : [];
  const isClaude = format === "claude";
  const isFlat = format === true || format === "flat";

  for (const name of OPENCODE_FINGERPRINT_TOOLS) {
    if (list.some((tool) => fingerprintToolKey(toolNameOf(tool)) === name)) continue;

    if (isClaude) {
      // Anthropic Messages format: { name, description, input_schema }
      list.push({
        name,
        description: "This tool is currently unavailable and must not be used.",
        input_schema: { type: "object", properties: {} },
      });
    } else if (isFlat) {
      // Responses / flat format: { type: "function", name, description, parameters }
      list.push({
        type: "function",
        name,
        description: "This tool is currently unavailable and must not be used.",
        parameters: { type: "object", properties: {} },
      });
    } else {
      // OpenAI Chat format: { type: "function", function: { name, description, parameters } }
      list.push({
        type: "function",
        function: {
          name,
          description: "This tool is currently unavailable and must not be used.",
          parameters: { type: "object", properties: {} },
        },
      });
    }
  }
  return list;
}

/**
 * Retarget tool_choice to point at quartet member after canonicalization.
 */
export function retargetToolChoice(
  body: any,
  map: Map<string, string>,
  format: FingerprintFormat | boolean = "openai"
): void {
  if (!body || typeof body !== "object" || !map?.size) return;
  const choice = body.tool_choice;
  if (!choice || typeof choice !== "object" || Array.isArray(choice)) return;

  // Claude format: { type: "tool", name: "tool_name" }
  if (choice.type === "tool" && typeof choice.name === "string") {
    const key = fingerprintToolKey(choice.name);
    if (key && map.has(key)) choice.name = key;
    return;
  }

  // Flat or named: { type: "function", name: "..." } or { name: "..." }
  if (typeof choice.name === "string") {
    const key = fingerprintToolKey(choice.name);
    if (key && map.has(key)) body.tool_choice = { ...choice, name: key };
    return;
  }

  // OpenAI format: { type: "function", function: { name: "..." } }
  const fn = choice.function;
  if (fn && typeof fn === "object" && !Array.isArray(fn) && typeof fn.name === "string") {
    const key = fingerprintToolKey(fn.name);
    if (key && map.has(key)) {
      body.tool_choice = { ...choice, function: { ...fn, name: key } };
    }
  }
}

/**
 * Applies OpenCode free-tier fingerprint tool quartet (bash, glob, grep, read) to request body.
 * Format-aware: generates Claude schema and avoids invalid tool_choice: "none" for Anthropic Messages.
 * Always returns a map of { [canonicalName]: originalName } to restore downstream.
 */
export function applyFingerprintTools(
  body: any,
  format: FingerprintFormat | boolean = "openai"
): Map<string, string> {
  if (!body || typeof body !== "object") return new Map();

  const isClaude = format === "claude";
  const isFlat = format === true || format === "flat";

  const hadClientTools = Array.isArray(body.tools) && body.tools.length > 0;
  const { tools, map } = concealFingerprintToolNames(body.tools);
  body.tools = appendMissingFingerprintTools(tools, format);
  retargetToolChoice(body, map, format);

  if (isClaude) {
    // Anthropic Messages API strictly rejects string tool_choice like "none" (HTTP 400).
    // Valid values are { type: "auto" }, { type: "any" }, or { type: "tool", name: "..." }.
    // If tool_choice is string "none", delete it.
    if (body.tool_choice === "none") {
      delete body.tool_choice;
    }
  } else if (!body.tool_choice) {
    if (isFlat) body.tool_choice = "auto";
    else if (!hadClientTools) body.tool_choice = "none";
  }

  return map;
}

/**
 * Restores original tool names in response payload or stream chunk events using the disguise map.
 */
export function restoreToolNames(payload: any, map: Map<string, string>): any {
  if (!payload || typeof payload !== "object" || map.size === 0) return payload;

  try {
    // OpenAI Chat Completions chunk / message
    const choices = payload.choices;
    if (Array.isArray(choices)) {
      for (const choice of choices) {
        const deltaCalls = choice?.delta?.tool_calls;
        if (Array.isArray(deltaCalls)) {
          for (const tc of deltaCalls) {
            if (tc?.function?.name && map.has(tc.function.name)) {
              tc.function.name = map.get(tc.function.name)!;
            }
          }
        }
        const msgCalls = choice?.message?.tool_calls;
        if (Array.isArray(msgCalls)) {
          for (const tc of msgCalls) {
            if (tc?.function?.name && map.has(tc.function.name)) {
              tc.function.name = map.get(tc.function.name)!;
            }
          }
        }
      }
    }

    // Anthropic content blocks
    if (payload.type === "content_block_start" && payload.content_block?.name && map.has(payload.content_block.name)) {
      payload.content_block.name = map.get(payload.content_block.name)!;
    }
    if (Array.isArray(payload.content)) {
      for (const block of payload.content) {
        if (block?.type === "tool_use" && block.name && map.has(block.name)) {
          block.name = map.get(block.name)!;
        }
      }
    }

    // Responses API items
    if (payload.type === "function_call" && payload.name && map.has(payload.name)) {
      payload.name = map.get(payload.name)!;
    }
    if (Array.isArray(payload.output)) {
      for (const item of payload.output) {
        if (item?.type === "function_call" && item.name && map.has(item.name)) {
          item.name = map.get(item.name)!;
        }
      }
    }
  } catch {
    // Fail-open: return payload untouched
  }

  return payload;
}

const RESPONSES_MODELS = new Set([
  "muse-spark-1.2-contributor-free",
  "muse-spark-1.3-contributor-free",
]);

const MESSAGES_MODELS = new Set(["union-alpha"]);

export function isResponsesModel(modelId?: string): boolean {
  if (!modelId) return false;
  const clean = modelId.replace(/\([^()]+\)\s*$/, "").trim().toLowerCase();
  return RESPONSES_MODELS.has(clean) || clean.startsWith("muse-spark");
}

export function isMessagesModel(modelId?: string): boolean {
  if (!modelId) return false;
  const clean = modelId.replace(/\([^()]+\)\s*$/, "").trim().toLowerCase();
  return MESSAGES_MODELS.has(clean);
}

export function buildOpenCodeUrl(modelId?: string, baseUrl: string = OPENCODE_BASE_URL): string {
  const base = baseUrl.replace(/\/+$/, "");
  if (isMessagesModel(modelId)) return `${base}/zen/v1/messages`;
  // Fallback to chat completions for OpenAI-compatible models (including Muse Spark)
  // to avoid Responses API protocol impedance mismatch in Mapigate's proxy pipeline
  return `${base}/zen/v1/chat/completions`;
}

export function buildOpenCodeHeaders(
  reqHeaders: Record<string, string> = {},
  sessionId?: string,
  requestId?: string,
  url?: string
): Record<string, string> {
  const lower: Record<string, string> = {};
  for (const [k, v] of Object.entries(reqHeaders)) {
    lower[k.toLowerCase()] = v;
  }

  const downstreamUa = lower["user-agent"] || "";
  const isOpencodeDownstream = /opencode\/(\d+)\.(\d+)/i.test(downstreamUa);

  const session =
    sessionId ||
    (lower["x-opencode-session"] && OPENCODE_SESSION_RE.test(lower["x-opencode-session"])
      ? lower["x-opencode-session"]
      : getStableSessionId("default"));

  const reqId =
    requestId ||
    (lower["x-opencode-request"] && OPENCODE_REQUEST_RE.test(lower["x-opencode-request"])
      ? lower["x-opencode-request"]
      : generateRequestId());

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "Authorization": "Bearer public",
    "User-Agent": isOpencodeDownstream ? downstreamUa : OPENCODE_UA,
    "x-opencode-client": lower["x-opencode-client"] || "desktop",
    "x-opencode-session": session,
    "x-opencode-request": reqId,
    "x-opencode-project": lower["x-opencode-project"] || "global",
    "Accept": "text/event-stream",
  };

  if (url && (url.endsWith("/messages") || url.includes("/v1/messages"))) {
    headers["anthropic-version"] = "2023-06-01";
  }

  return headers;
}
