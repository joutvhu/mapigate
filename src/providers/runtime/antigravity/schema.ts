import crypto from "node:crypto";

// Default signature for Antigravity thinking mode (Claude models)
export const DEFAULT_THINKING_AG_SIGNATURE =
  "EuwGCukGAXLI2nxwZIq54WWSoL/YN0P3TsDZ7zRnLi8g0S4aVr2HUGxvaHKySuY6HAVzcE0GPGjXrytLIldxthSvfxgUlJh6Qa9Z+Oj5QZBlYdg6HaJ6yuY5R7waE6rdwBsRf7Ft2j3DJ9rMi9qhWFqApewYtPhls3VHtuvND3l8Rm09+lbAXQs6KKWEWrxNLKTBkfpMgXhRERc/TQRMZu1twAablm6/Zk1tsYRvfWKLsNbeKF+CCojJdXJKvnR/8Ouuoa+Y2Ti20hcW7aZIIjZDFYPU//k6Ybmhg69J/imbFai2ckhfLaisqdDkdoIiBJScTOUvYqP6AE9d4MsydSC+UlhIMk4hoP76R8vUSCZRMkjOaDXstf/QoVZKbt94wyRZgAJ1G0BqI8L5ow86kLpA4wJEtxsRGymOE4bKUvApveBakYDNM9APkf+LbtbzWSseGjoZcSlycF9iN8Q2XNYKRrHbv3Lr5Y8JjdH/5y/6SHkNehTEZugaeGnSPSyCTWto1kQgHpxdWmhkLfJGNUGLmue7Mesj4TSms4J33mRpYVhNB/J333FCqIP0hr/E7BkkjEn7yZ4X7SQlh+xKPurapsnHRwiKmtsilmEFrnTE9iQr+pMr6M29qqFNv1tr5yumbaJw8JW9sB15tNsRv+dW6BjNanbsKz7HCgKUBc8tGy+7YuhXzAfViyRefcjK7eZW0Fbyt7AbybJTKz78W8NH7ye6LAwzOebXpeZ4D43fNIt8bKh26qgduSQv/7o+pAflkuqHZ99YWgHQ8h8OkZFi3eOiSYjsjhdZ/czWOdoPI/OnqIldzMPF5YlrKBLFX8VhRKVmqgsmWf5PHGulHhMkVlS+XG2UIseGy69ARa93D78Gsa+1n1kJr7EEB7Rh+27vUMxVYLdz1yMSvE5nalTAlg/ZeG8+XQ0cHuAI3KbQpHW2Q++RdXfm5JzD5WdJZUU+Zn8t8UUn85BH4RxZLeE0qJikgSsKoYVBc6YhiMjhPgkR95ReimY4Z0xCJdRo1gjexOFeODZMpQF6Yxnoic7IrdgsFA3iePTbFnPp3IAM1fAThWhXJUn3QInUOTd5o1qmTmn6REbL15g/JQNl+dqUoPkhleeb2V3kjqp1okmO3wMZbPknR3S1LZNmlS72/iBQUm+n2b/RCn4PjmM2";

// Default Protobuf signature for Antigravity Gemini models (Google Gemini CLI)
export const DEFAULT_THINKING_GEMINI_CLI_SIGNATURE =
  "CiQBjz1rX/AlslZWMe5RgBt4Tv9j4+YNZTTez+JH2/+5oAlICygKXgGPPWtf7/Sux9eLYap/bmYAdPqFThLXj+l7o0DLu/hdgU98MA9ZrlRDNHXx+T0tuY8AcnjPZbiDyOq2bE11Fjhsk6p5axqayaapC/Pt9GczcgIQf1z15WTxCeKWAPYKYQGPPWtfDYj0nlNFNoTlU39RC91Z16xFKJ2MLEmkm+NvimsoOJ6be3g2BssNPtJ/9BKDXRA5cVs17tBeeW72lH8TMB5999udtxHM2SiUsnWsrHlfVuGSCpNQQ+5REw8HNvEKkgEBjz1rXzBNWrqZGbjun55K+vgYPBhJO2qZ67uRWXUA5/qcU12U/mbi5XoA3swoxYE8LEXfZvFFC9WG/W28QNCA0Qd4Trk/WkWiAwZmB8a84Fs14rkv3wqyxwFavPkJorqurAfd2XzGiFy0sB0ITCOPYi1HzDGV5WfXk6b9k+jT66/RuzGa8EcSOWo/QtC3Bkhgowo4AY89a1/f/tw8A02zjIoK7JVDAbf8W4UfmbApJJhwXIiGtu1M0JItObx7g2reYqT+HHL2Q/R4VDc=";

/**
 * Resolves the appropriate default thinking signature.
 * Antigravity backend (Google Cloud Code PA) uses DEFAULT_THINKING_AG_SIGNATURE.
 */
export function getDefaultThinkingSignature(_model?: string): string {
  return DEFAULT_THINKING_AG_SIGNATURE;
}

// Fields Google generateContent / Cloud Code PA rejects (Claude/OpenAI/Qwen thinking fields set at body root or generationConfig)
export const ANTIGRAVITY_REQUEST_BLACKLIST = [
  "output_config",
  "thinking",
  "reasoning_effort",
  "reasoning",
  "enable_thinking",
  "thinking_budget",
  "thinkingConfig",
];

// Strip blacklisted fields from an object (used for generationConfig and request envelopes)
export function stripBlacklisted(obj: any): void {
  if (!obj || typeof obj !== "object") return;
  for (const key of ANTIGRAVITY_REQUEST_BLACKLIST) {
    delete obj[key];
  }
}

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

export function resolveSessionId(
  req: any,
  body: any,
  fallbackAccount?: string | { id?: string; name?: string; email?: string } | null
): string {
  const headerSessionId =
    req?.headers?.["x-session-id"] ||
    req?.headers?.["session-id"] ||
    req?.headers?.["x-amp-thread-id"];
  if (headerSessionId && typeof headerSessionId === "string" && headerSessionId.trim()) {
    return headerSessionId.trim();
  }

  const clientBodyId =
    body?.metadata?.["kiro:conversation_id"] ||
    body?.metadata?.["kiro:root_conversation_id"] ||
    body?.conversationState?.conversationId ||
    body?.conversationId ||
    body?.conversation_id ||
    body?._clientSessionId ||
    body?.sessionId ||
    body?.session_id;
  if (clientBodyId && typeof clientBodyId === "string" && clientBodyId.trim()) {
    return clientBodyId.trim();
  }

  let accountIdentifier = "anonymous";
  if (typeof fallbackAccount === "string" && fallbackAccount.trim()) {
    accountIdentifier = fallbackAccount.trim();
  } else if (fallbackAccount && typeof fallbackAccount === "object") {
    accountIdentifier = fallbackAccount.id || fallbackAccount.name || fallbackAccount.email || "anonymous";
  }

  return `antigravity:account:${accountIdentifier}`;
}

export function buildIdeRequestId(opts: {
  sessionId: string;
  model: string;
  contentCount: number;
  requestType?: string;
}): string {
  const sid = opts.sessionId || "anonymous";
  const conversationId = uuidFromSeed(`antigravity:conversation:${sid}`);
  const trajectoryId = uuidFromSeed(`antigravity:trajectory:${sid}:${opts.model}:${opts.requestType || "agent"}`);
  const count = Number.isFinite(opts.contentCount) ? opts.contentCount : 1;
  const step = Math.max(1, count * 2 - 1);
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
  if (typeof val !== "string") return val;
  try {
    return JSON.parse(val);
  } catch {
    return null;
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

export function convertConstToEnum(obj: any): void {
  if (!obj || typeof obj !== "object") return;

  if (obj.const !== undefined && !obj.enum) {
    obj.enum = [obj.const];
    delete obj.const;
  }

  for (const value of Object.values(obj)) {
    if (value && typeof value === "object") {
      convertConstToEnum(value);
    }
  }
}

export function convertEnumValuesToStrings(obj: any): void {
  if (!obj || typeof obj !== "object") return;

  if (obj.enum && Array.isArray(obj.enum)) {
    obj.enum = obj.enum.map((v: any) => String(v));
    // Gemini API requires type:"string" when enum is present
    if (!obj.type) {
      obj.type = "string";
    }
  }

  for (const value of Object.values(obj)) {
    if (value && typeof value === "object") {
      convertEnumValuesToStrings(value);
    }
  }
}

export function mergeAllOf(obj: any): void {
  if (!obj || typeof obj !== "object") return;

  if (obj.allOf && Array.isArray(obj.allOf)) {
    const merged: { properties?: Record<string, any>; required?: string[] } = {};

    for (const item of obj.allOf) {
      if (item && typeof item === "object") {
        if (item.properties) {
          if (!merged.properties) merged.properties = {};
          Object.assign(merged.properties, item.properties);
        }
        if (item.required && Array.isArray(item.required)) {
          if (!merged.required) merged.required = [];
          for (const req of item.required) {
            if (!merged.required.includes(req)) {
              merged.required.push(req);
            }
          }
        }
      }
    }

    delete obj.allOf;
    if (merged.properties) obj.properties = { ...obj.properties, ...merged.properties };
    if (merged.required) obj.required = [...(obj.required || []), ...merged.required];
  }

  for (const value of Object.values(obj)) {
    if (value && typeof value === "object") {
      mergeAllOf(value);
    }
  }
}

export function convertPrefixItems(obj: any): void {
  if (!obj || typeof obj !== "object") return;

  if (Array.isArray(obj.prefixItems) && obj.prefixItems.length > 0) {
    if (!obj.type) obj.type = "array";
    const variants = obj.prefixItems.filter((s: any) => s && s.type !== "null");
    if (!obj.items && variants.length === 1) {
      obj.items = variants[0];
    } else if (!obj.items && variants.length > 1) {
      obj.items = { anyOf: variants };
    }
    delete obj.prefixItems;
  }

  for (const value of Object.values(obj)) {
    if (value && typeof value === "object") {
      convertPrefixItems(value);
    }
  }
}

export function flattenTypeArrays(obj: any): void {
  if (!obj || typeof obj !== "object") return;

  if (obj.type && Array.isArray(obj.type)) {
    const hasNull = obj.type.includes("null");
    const nonNullTypes = obj.type.filter((t: any) => t !== "null");
    if (nonNullTypes.length === 0) {
      obj.type = "string";
    } else if (nonNullTypes.length === 1) {
      obj.type = nonNullTypes[0];
    } else {
      // Multiple types: choose best fitting type (prefer structural clues then string over boolean/number)
      if (obj.properties && nonNullTypes.includes("object")) {
        obj.type = "object";
      } else if (
        obj.items &&
        typeof obj.items === "object" &&
        Object.keys(obj.items).length > 0 &&
        obj.items.type &&
        nonNullTypes.includes("array")
      ) {
        obj.type = "array";
      } else if (nonNullTypes.includes("string")) {
        obj.type = "string";
      } else if (nonNullTypes.includes("number")) {
        obj.type = "number";
      } else if (nonNullTypes.includes("integer")) {
        obj.type = "integer";
      } else if (nonNullTypes.includes("boolean")) {
        obj.type = "boolean";
      } else {
        obj.type = nonNullTypes[0];
      }
    }
    if (hasNull) {
      obj.nullable = true;
    }
  }

  for (const value of Object.values(obj)) {
    if (value && typeof value === "object") {
      flattenTypeArrays(value);
    }
  }
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

export function removeUnsupportedKeywords(obj: any, keywords: string[]): void {
  if (!obj || typeof obj !== "object") return;

  if (Array.isArray(obj)) {
    for (const item of obj) {
      removeUnsupportedKeywords(item, keywords);
    }
    return;
  }

  for (const key of Object.keys(obj)) {
    if (keywords.includes(key) || key.startsWith("x-")) {
      delete obj[key];
      continue;
    }

    const value = obj[key];
    if (value && typeof value === "object") {
      removeUnsupportedKeywords(value, keywords);
    }
  }
}

export const stripUnsupportedConstraints = removeUnsupportedKeywords;

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
  if (!obj.type && obj.items) {
    obj.type = "array";
  }
  if (obj.type === "array") {
    if (!obj.items || typeof obj.items !== "object" || Object.keys(obj.items).length === 0) {
      obj.items = { type: "string" };
    } else if (!obj.items.type) {
      if (obj.items.properties) {
        obj.items.type = "object";
      } else if (obj.items.items) {
        obj.items.type = "array";
      } else {
        obj.items.type = "string";
      }
    }
  }
  for (const v of Object.values(obj)) {
    if (v && typeof v === "object") ensureArrayItems(v);
  }
}

// Gemini Schema proto validation rules:
// 1. Schema.items predicate: $type == Type.ARRAY. If type is not "array", items field MUST NOT exist.
// 2. Schema.properties / required predicate: $type == Type.OBJECT. If type is not "object", properties and required MUST NOT exist.
export function enforceTypeConstraints(obj: any): void {
  if (!obj || typeof obj !== "object") return;

  for (const value of Object.values(obj)) {
    if (value && typeof value === "object") {
      enforceTypeConstraints(value);
    }
  }

  if (obj.type === "array") {
    delete obj.properties;
    delete obj.required;
    if (!obj.items || typeof obj.items !== "object" || Object.keys(obj.items).length === 0) {
      obj.items = { type: "string" };
    } else if (!obj.items.type) {
      if (obj.items.properties) {
        obj.items.type = "object";
      } else if (obj.items.items) {
        obj.items.type = "array";
      } else {
        obj.items.type = "string";
      }
    }
  } else {
    // Non-array schemas MUST NOT carry items
    delete obj.items;
  }

  if (obj.type !== "object") {
    delete obj.properties;
    delete obj.required;
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

  const cleaned = structuredClone(schema);

  // Phase 1: Convert and prepare
  convertConstToEnum(cleaned);
  convertEnumValuesToStrings(cleaned);

  // Phase 2: Flatten complex structures
  mergeAllOf(cleaned);
  convertPrefixItems(cleaned);
  flattenAnyOfOneOf(cleaned);
  flattenTypeArrays(cleaned);

  // Phase 2.5: Infer missing type=object and array items (Gemini requirements)
  ensureObjectType(cleaned);
  ensureArrayItems(cleaned);

  // Phase 3: Remove unsupported constraints at ALL levels (including inside arrays and x- extensions)
  removeUnsupportedKeywords(cleaned, UNSUPPORTED_SCHEMA_CONSTRAINTS);

  // Phase 4: Cleanup required fields recursively
  cleanupRequired(cleaned);

  // Phase 5: Add placeholders for empty objects
  addPlaceholdersForEmptyObjects(cleaned);

  // Phase 6: Enforce Gemini protobuf type predicates (items only on array, properties/required only on object)
  enforceTypeConstraints(cleaned);

  return cleaned;
}

export function remoteImageMimeType(url: string): string {
  let pathname: string;
  try {
    pathname = new URL(url).pathname.toLowerCase();
  } catch {
    return "image/png";
  }
  if (pathname.endsWith(".jpg") || pathname.endsWith(".jpeg")) return "image/jpeg";
  if (pathname.endsWith(".webp")) return "image/webp";
  if (pathname.endsWith(".gif")) return "image/gif";
  if (pathname.endsWith(".bmp")) return "image/bmp";
  return "image/png";
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
        parts.push({ fileData: { fileUri: url, mimeType: remoteImageMimeType(url) } });
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

// Return the part with a sanitized functionResponse.response (same reference when untouched)
export function sanitizeFunctionResponsePart(part: any): any {
  const response = part?.functionResponse?.response;
  if (!response || typeof response !== "object") return part;
  return {
    ...part,
    functionResponse: {
      ...part.functionResponse,
      response: sanitizeFunctionResponsePayload(response),
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
