import crypto from "node:crypto";

// Default signature for Antigravity thinking mode
export const DEFAULT_THINKING_AG_SIGNATURE =
  "EuwGCukGAXLI2nxwZIq54WWSoL/YN0P3TsDZ7zRnLi8g0S4aVr2HUGxvaHKySuY6HAVzcE0GPGjXrytLIldxthSvfxgUlJh6Qa9Z+Oj5QZBlYdg6HaJ6yuY5R7waE6rdwBsRf7Ft2j3DJ9rMi9qhWFqApewYtPhls3VHtuvND3l8Rm09+lbAXQs6KKWEWrxNLKTBkfpMgXhRERc/TQRMZu1twAablm6/Zk1tsYRvfWKLsNbeKF+CCojJdXJKvnR/8Ouuoa+Y2Ti20hcW7aZIIjZDFYPU//k6Ybmhg69J/imbFai2ckhfLaisqdDkdoIiBJScTOUvYqP6AE9d4MsydSC+UlhIMk4hoP76R8vUSCZRMkjOaDXstf/QoVZKbt94wyRZgAJ1G0BqI8L5ow86kLpA4wJEtxsRGymOE4bKUvApveBakYDNM9APkf+LbtbzWSseGjoZcSlycF9iN8Q2XNYKRrHbv3Lr5Y8JjdH/5y/6SHkNehTEZugaeGnSPSyCTWto1kQgHpxdWmhkLfJGNUGLmue7Mesj4TSms4J33mRpYVhNB/J333FCqIP0hr/E7BkkjEn7yZ4X7SQlh+xKPurapsnHRwiKmtsilmEFrnTE9iQr+pMr6M29qqFNv1tr5yumbaJw8JW9sB15tNsRv+dW6BjNanbsKz7HCgKUBc8tGy+7YuhXzAfViyRefcjK7eZW0Fbyt7AbybJTKz78W8NH7ye6LAwzOebXpeZ4D43fNIt8bKh26qgduSQv/7o+pAflkuqHZ99YWgHQ8h8OkZFi3eOiSYjsjhdZ/czWOdoPI/OnqIldzMPF5YlrKBLFX8VhRKVmqgsmWf5PHGulHhMkVlS+XG2UIseGy69ARa93D78Gsa+1n1kJr7EEB7Rh+27vUMxVYLdz1yMSvE5nalTAlg/ZeG8+XQ0cHuAI3KbQpHW2Q++RdXfm5JzD5WdJZUU+Zn8t8UUn85BH4RxZLeE0qJikgSsKoYVBc6YhiMjhPgkR95ReimY4Z0xCJdRo1gjexOFeODZMpQF6Yxnoic7IrdgsFA3iePTbFnPp3IAM1fAThWhXJUn3QInUOTd5o1qmTmn6REbL15g/JQNl+dqUoPkhleeb2V3kjqp1okmO3wMZbPknR3S1LZNmlS72/iBQUm+n2b/RCn4PjmM2";

export const ANTIGRAVITY_PROMPT_REWRITES: Array<{ from: string | RegExp; to: string | ((m: string) => string) }> = [
  { from: "You are a Claude agent, built on Anthropic's Claude Agent SDK.", to: "" },
  { from: /You are Hermes(?: Agent)?(?:,\s*(?:an intelligent AI assistant|an AI assistant|an AI agent))?(?:,?\s*(?:built|created)\s+by\s+Nous Research)?\./gi, to: "You are an AI assistant." },
  { from: /^x-anthropic-billing-header:[^\n]*(?:\r?\n)*/gim, to: "" },
  { from: /opencode/gi, to: (m: string) => (m === "OpenCode" ? "Antigravity" : m === "OPENCODE" ? "ANTIGRAVITY" : "antigravity") },
];

export function uuidFromSeed(seed: string): string {
  const bytes = crypto.createHash("sha256").update(String(seed || "antigravity")).digest().subarray(0, 16);
  bytes[6] = (bytes[6] & 0x0f) | 0x50;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export function toNumericSessionId(sessionId?: string | null): string {
  if (!sessionId) return "-1";
  const v = String(sessionId).trim();
  if (!v) return "-1";
  if (/^-?\d+$/.test(v)) return v;
  const h = crypto.createHash("sha256").update(v).digest();
  const n = h.readBigUInt64BE(0) & 0x7fffffffffffffffn;
  return `-${n.toString()}`;
}

export function resolveSessionId(req: any, body: any, fallbackScope = "local"): string {
  const headerSessionId = req?.headers?.["x-session-id"] || req?.headers?.["session-id"] || req?.headers?.["x-amp-thread-id"];
  if (headerSessionId && typeof headerSessionId === "string" && headerSessionId.trim()) {
    return headerSessionId.trim();
  }
  if (body?.conversation_id && typeof body.conversation_id === "string" && body.conversation_id.trim()) {
    return body.conversation_id.trim();
  }
  if (body?.session_id && typeof body.session_id === "string" && body.session_id.trim()) {
    return body.session_id.trim();
  }
  const items = Array.isArray(body?.messages) ? body.messages : [];
  let assistantText = "";
  for (const item of items) {
    if (item?.role === "assistant") {
      if (typeof item.content === "string") assistantText += item.content;
      else if (Array.isArray(item.content)) {
        for (const c of item.content) assistantText += c?.text || "";
      }
      if (assistantText.length >= 50) break;
    }
  }
  if (assistantText.length >= 50) {
    return crypto.createHash("sha256").update(`ag:${assistantText.slice(0, 50)}`).digest("hex").slice(0, 16);
  }
  return `antigravity:session:${fallbackScope}`;
}

export function buildIdeRequestId(opts: {
  sessionId: string;
  model: string;
  contentCount: number;
  requestType?: string;
}): string {
  const conversationId = uuidFromSeed(`antigravity:conversation:${opts.sessionId}`);
  const trajectoryId = uuidFromSeed(`antigravity:trajectory:${opts.sessionId}:${opts.model}:${opts.requestType || "agent"}`);
  const step = Math.max(1, opts.contentCount * 2 - 1);
  return `agent/${conversationId}/${Date.now()}/${trajectoryId}/${step}`;
}

// Unsupported JSON Schema constraints that should be removed for Antigravity
export const UNSUPPORTED_SCHEMA_CONSTRAINTS = [
  "minLength", "maxLength", "exclusiveMinimum", "exclusiveMaximum",
  "minItems", "maxItems", "format", "multipleOf",
  "uniqueItems", "contains",
  "unevaluatedProperties", "unevaluatedItems", "contentSchema",
  "prefixItems", "additionalItems",
  "default", "examples",
  "$schema", "$defs", "definitions", "const", "$ref", "$comment",
  "deprecated", "readOnly", "writeOnly",
  "additionalProperties", "propertyNames", "patternProperties", "enumDescriptions",
  "anyOf", "oneOf", "allOf", "not",
  "dependencies", "dependentSchemas", "dependentRequired",
  "title", "optional", "if", "then", "else", "contentMediaType", "contentEncoding",
  "cornerRadius", "fillColor", "fontFamily", "fontSize", "fontWeight",
  "gap", "padding", "strokeColor", "strokeThickness", "textColor",
  "errorMessage", "errorMessages", "x-errorMessage", "x-errorMessages",
  "markdownDescription", "x-intellij-html-description",
  "x-taplo-info", "x-taplo", "doNotSuggest", "suggestSortText",
  "minProperties", "maxProperties",
];

export function sanitizeGeminiFunctionName(name?: string): string {
  if (!name) return "_unknown";
  let sanitized = name.replace(/[^a-zA-Z0-9_.:\-]/g, "_");
  if (!/^[a-zA-Z_]/.test(sanitized)) {
    sanitized = "_" + sanitized;
  }
  return sanitized.substring(0, 64);
}

export function tryParseJSON(val: any): any {
  if (typeof val !== "string") return val ?? {};
  try {
    return JSON.parse(val);
  } catch {
    return { raw: val };
  }
}

export function mapFinishReason(reason?: string | null): string {
  if (!reason) return "stop";
  const r = String(reason).toUpperCase();
  if (r === "STOP") return "stop";
  if (r === "MAX_TOKENS" || r === "LENGTH") return "length";
  if (r === "SAFETY" || r === "CONTENT_FILTER") return "content_filter";
  if (r === "RECITATION") return "content_filter";
  return "stop";
}

function selectBestSchema(items: any[]): number {
  let bestIdx = 0;
  let bestScore = -1;

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    if (!item) continue;
    let score = 0;
    const type = item.type;
    if (type === "object" || item.properties) {
      score = 3;
    } else if (type === "array" || item.items) {
      score = 2;
    } else if (type && type !== "null") {
      score = 1;
    }

    if (score > bestScore) {
      bestScore = score;
      bestIdx = i;
    }
  }
  return bestIdx;
}

function flattenAnyOfOneOf(obj: any): void {
  if (!obj || typeof obj !== "object") return;

  if (Array.isArray(obj.anyOf) && obj.anyOf.length > 0) {
    const nonNull = obj.anyOf.filter((s: any) => s && s.type !== "null");
    if (nonNull.length > 0) {
      const best = nonNull[selectBestSchema(nonNull)];
      delete obj.anyOf;
      Object.assign(obj, best);
    }
  }

  if (Array.isArray(obj.oneOf) && obj.oneOf.length > 0) {
    const nonNull = obj.oneOf.filter((s: any) => s && s.type !== "null");
    if (nonNull.length > 0) {
      const best = nonNull[selectBestSchema(nonNull)];
      delete obj.oneOf;
      Object.assign(obj, best);
    }
  }

  for (const v of Object.values(obj)) {
    if (v && typeof v === "object") {
      flattenAnyOfOneOf(v);
    }
  }
}

function stripUnsupportedConstraints(obj: any): void {
  if (!obj || typeof obj !== "object") return;

  for (const key of UNSUPPORTED_SCHEMA_CONSTRAINTS) {
    delete obj[key];
  }

  if (Array.isArray(obj.type)) {
    const nonNullType = obj.type.find((t: string) => t !== "null");
    obj.type = nonNullType || "string";
  }

  for (const v of Object.values(obj)) {
    if (v && typeof v === "object") {
      stripUnsupportedConstraints(v);
    }
  }
}

function ensureObjectType(obj: any): void {
  if (!obj || typeof obj !== "object") return;
  if (obj.properties && !obj.type) obj.type = "object";
  for (const [key, v] of Object.entries(obj)) {
    if (!v || typeof v !== "object") continue;
    if (key === "properties" && !Array.isArray(v)) {
      for (const sub of Object.values(v)) ensureObjectType(sub);
    } else {
      ensureObjectType(v);
    }
  }
}

function ensureArrayItems(obj: any): void {
  if (!obj || typeof obj !== "object") return;
  if (obj.type === "array" && !obj.items) {
    obj.items = { type: "string" };
  }
  for (const v of Object.values(obj)) {
    if (v && typeof v === "object") ensureArrayItems(v);
  }
}

function cleanupRequired(obj: any): void {
  if (!obj || typeof obj !== "object") return;

  if (obj.required && Array.isArray(obj.required)) {
    if (!obj.properties || typeof obj.properties !== "object") {
      delete obj.required;
    } else {
      const validRequired = obj.required.filter(
        (field: any) =>
          typeof field === "string" &&
          Object.prototype.hasOwnProperty.call(obj.properties, field)
      );
      if (validRequired.length === 0) {
        delete obj.required;
      } else {
        obj.required = validRequired;
      }
    }
  }

  for (const value of Object.values(obj)) {
    if (value && typeof value === "object") {
      cleanupRequired(value);
    }
  }
}

function addPlaceholdersForEmptyObjects(obj: any): void {
  if (!obj || typeof obj !== "object") return;

  if (Object.keys(obj).length === 0) {
    obj.type = "object";
    obj.properties = {
      reason: {
        type: "string",
        description: "Brief explanation of why you are calling this tool",
      },
    };
    obj.required = ["reason"];
    return;
  }

  if (obj.type === "object") {
    if (!obj.properties || Object.keys(obj.properties).length === 0) {
      obj.properties = {
        reason: {
          type: "string",
          description: "Brief explanation of why you are calling this tool",
        },
      };
      obj.required = ["reason"];
    }
  }

  for (const v of Object.values(obj)) {
    if (v && typeof v === "object") {
      addPlaceholdersForEmptyObjects(v);
    }
  }
}

/**
 * Cleans and normalizes JSON schema for Google Cloud Code / Antigravity Gemini tools
 */
export function cleanJSONSchemaForAntigravity(schema: any): any {
  if (!schema || typeof schema !== "object") {
    return {
      type: "object",
      properties: {
        reason: {
          type: "string",
          description: "Brief explanation of why you are calling this tool",
        },
      },
      required: ["reason"],
    };
  }

  const cloned = structuredClone(schema);
  flattenAnyOfOneOf(cloned);
  ensureObjectType(cloned);
  ensureArrayItems(cloned);
  stripUnsupportedConstraints(cloned);
  addPlaceholdersForEmptyObjects(cloned);
  cleanupRequired(cloned);

  return cloned;
}

/**
 * Convert OpenAI content blocks (text or image_url) to Gemini parts
 */
export function convertOpenAIContentToParts(content: any): any[] {
  const parts: any[] = [];
  if (typeof content === "string") {
    if (content.trim()) parts.push({ text: content });
    return parts;
  }
  if (!Array.isArray(content)) return parts;

  for (const item of content) {
    if (!item) continue;
    if (typeof item === "string") {
      parts.push({ text: item });
    } else if (item.type === "text" && item.text) {
      parts.push({ text: item.text });
    } else if (item.type === "image_url" && item.image_url?.url) {
      const url: string = item.image_url.url;
      if (url.startsWith("data:")) {
        const commaIdx = url.indexOf(",");
        if (commaIdx !== -1) {
          const mime = url.substring(5, commaIdx).split(";")[0];
          const data = url.substring(commaIdx + 1);
          parts.push({ inlineData: { mimeType: mime, data } });
        }
      } else {
        parts.push({ fileData: { fileUri: url, mimeType: "image/*" } });
      }
    }
  }
  return parts;
}

export function isGemini4Model(model?: string): boolean {
  return /(?:^|\/)gemini-4(?:$|[-.])/i.test(String(model || ""));
}

function moveFunctionResponsesLast(parts: any[]): any[] {
  const responses = parts.filter((p: any) => p && p.functionResponse);
  if (!responses.length) return parts;
  return [...parts.filter((p: any) => !p || !p.functionResponse), ...responses];
}

// Gemini / Cloud Code treat a `$ref` key inside functionResponse.response as a
// pointer to functionResponse.parts and reject the request. Tool results carrying
// schemas hit this, so rename the key recursively.
export const GEMINI_RESERVED_RESPONSE_KEYS: Record<string, string> = { "$ref": "_ref" };

export function sanitizeFunctionResponsePayload(value: any): any {
  if (Array.isArray(value)) return value.map(sanitizeFunctionResponsePayload);
  if (!value || typeof value !== "object") return value;
  const out: Record<string, any> = {};
  for (const [key, val] of Object.entries(value)) {
    out[GEMINI_RESERVED_RESPONSE_KEYS[key] ?? key] = sanitizeFunctionResponsePayload(val);
  }
  return out;
}

export function sanitizeFunctionResponsePart(part: any): any {
  if (!part?.functionResponse) return part;
  const response = part.functionResponse.response;
  let finalResponse: any;
  if (response === undefined || response === null) {
    finalResponse = { result: "" };
  } else {
    const sanitized = sanitizeFunctionResponsePayload(response);
    finalResponse =
      sanitized !== null &&
      typeof sanitized === "object" &&
      !Array.isArray(sanitized) &&
      "result" in sanitized
        ? sanitized
        : { result: sanitized ?? "" };
  }
  return {
    ...part,
    functionResponse: {
      ...part.functionResponse,
      response: finalResponse,
    },
  };
}

/**
 * Rewrites duplicate tool_call_ids so every emitted functionCall id is unique across history.
 * Gemini validates functionCall id uniqueness across the whole history and rejects otherwise.
 */
export function createToolCallIdUniquifier() {
  const used = new Set<string>();
  return {
    next(id?: string): string {
      if (!id) return `call_${Date.now()}`;
      if (!used.has(id)) {
        used.add(id);
        return id;
      }
      let n = 2;
      let candidate = `${id}-${n}`;
      while (used.has(candidate)) candidate = `${id}-${n++}`;
      used.add(candidate);
      return candidate;
    },
  };
}

/**
 * Ensures any assistant message with tool_calls in history has corresponding tool results.
 * If an intermediate turn lacks a tool result, inserts an empty result so turn sequence is preserved.
 */
export function fixMissingToolResponses(messages: any[]): any[] {
  if (!Array.isArray(messages)) return messages;
  const newMessages: any[] = [];
  for (let i = 0; i < messages.length; i++) {
    const msg = messages[i];
    newMessages.push(msg);

    if (msg.role === "assistant" && Array.isArray(msg.tool_calls) && msg.tool_calls.length > 0) {
      const tcIds = msg.tool_calls.map((tc: any) => tc.id).filter(Boolean);
      if (tcIds.length === 0) continue;

      let lookaheadIdx = i + 1;
      const seenResponses = new Set<string>();
      while (lookaheadIdx < messages.length && messages[lookaheadIdx]?.role === "tool") {
        if (messages[lookaheadIdx].tool_call_id) {
          seenResponses.add(messages[lookaheadIdx].tool_call_id);
        }
        lookaheadIdx++;
      }

      for (const id of tcIds) {
        if (!seenResponses.has(id)) {
          newMessages.push({
            role: "tool",
            tool_call_id: id,
            content: "",
          });
        }
      }
    }
  }
  return newMessages;
}

/**
 * Normalizes Gemini contents array:
 * - strips empty turns
 * - merges consecutive same-role turns
 * - guarantees conversation starts with user turn
 * - guarantees assistant turn doesn't dangle at end without response
 * - for Gemini 4: ensures functionResponse parts appear last in merged user turns
 */
export function normalizeGeminiContents(contents: any[], model?: string): any[] {
  const frLast = isGemini4Model(model);
  const out: any[] = [];
  for (const c of contents || []) {
    if (!c?.role || !Array.isArray(c.parts)) continue;
    const parts = c.parts
      .filter((p: any) => p && Object.keys(p).length > 0)
      .map(sanitizeFunctionResponsePart);
    if (parts.length === 0) continue;
    const last = out.at(-1);
    if (last?.role === c.role) {
      last.parts.push(...parts);
      if (frLast && last.role === "user") {
        last.parts = moveFunctionResponsesLast(last.parts);
      }
    } else {
      let p = [...parts];
      if (frLast && c.role === "user") {
        p = moveFunctionResponsesLast(p);
      }
      out.push({ role: c.role, parts: p });
    }
  }

  if (out.length > 0 && out[0].role !== "user") {
    out.unshift({ role: "user", parts: [{ text: "..." }] });
  }

  if (out.length > 0 && out.at(-1).role === "model") {
    const fnCalls = (out.at(-1).parts || []).filter((p: any) => p && p.functionCall);
    if (fnCalls.length > 0) {
      const responses = fnCalls.map((p: any) => {
        const call = p.functionCall || {};
        return {
          functionResponse: {
            name: call.name || "tool",
            id: call.id || "call_1",
            response: { result: "Continue." },
          },
        };
      });
      out.push({ role: "user", parts: responses });
    } else {
      out.push({ role: "user", parts: [{ text: "Continue." }] });
    }
  }

  return out;
}
