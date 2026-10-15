// Default signature for Antigravity thinking mode
export const DEFAULT_THINKING_AG_SIGNATURE =
  "EuwGCukGAXLI2nxwZIq54WWSoL/YN0P3TsDZ7zRnLi8g0S4aVr2HUGxvaHKySuY6HAVzcE0GPGjXrytLIldxthSvfxgUlJh6Qa9Z+Oj5QZBlYdg6HaJ6yuY5R7waE6rdwBsRf7Ft2j3DJ9rMi9qhWFqApewYtPhls3VHtuvND3l8Rm09+lbAXQs6KKWEWrxNLKTBkfpMgXhRERc/TQRMZu1twAablm6/Zk1tsYRvfWKLsNbeKF+CCojJdXJKvnR/8Ouuoa+Y2Ti20hcW7aZIIjZDFYPU//k6Ybmhg69J/imbFai2ckhfLaisqdDkdoIiBJScTOUvYqP6AE9d4MsydSC+UlhIMk4hoP76R8vUSCZRMkjOaDXstf/QoVZKbt94wyRZgAJ1G0BqI8L5ow86kLpA4wJEtxsRGymOE4bKUvApveBakYDNM9APkf+LbtbzWSseGjoZcSlycF9iN8Q2XNYKRrHbv3Lr5Y8JjdH/5y/6SHkNehTEZugaeGnSPSyCTWto1kQgHpxdWmhkLfJGNUGLmue7Mesj4TSms4J33mRpYVhNB/J333FCqIP0hr/E7BkkjEn7yZ4X7SQlh+xKPurapsnHRwiKmtsilmEFrnTE9iQr+pMr6M29qqFNv1tr5yumbaJw8JW9sB15tNsRv+dW6BjNanbsKz7HCgKUBc8tGy+7YuhXzAfViyRefcjK7eZW0Fbyt7AbybJTKz78W8NH7ye6LAwzOebXpeZ4D43fNIt8bKh26qgduSQv/7o+pAflkuqHZ99YWgHQ8h8OkZFi3eOiSYjsjhdZ/czWOdoPI/OnqIldzMPF5YlrKBLFX8VhRKVmqgsmWf5PHGulHhMkVlS+XG2UIseGy69ARa93D78Gsa+1n1kJr7EEB7Rh+27vUMxVYLdz1yMSvE5nalTAlg/ZeG8+XQ0cHuAI3KbQpHW2Q++RdXfm5JzD5WdJZUU+Zn8t8UUn85BH4RxZLeE0qJikgSsKoYVBc6YhiMjhPgkR95ReimY4Z0xCJdRo1gjexOFeODZMpQF6Yxnoic7IrdgsFA3iePTbFnPp3IAM1fAThWhXJUn3QInUOTd5o1qmTmn6REbL15g/JQNl+dqUoPkhleeb2V3kjqp1okmO3wMZbPknR3S1LZNmlS72/iBQUm+n2b/RCn4PjmM2";

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

/**
 * Normalizes Gemini contents array:
 * - strips empty turns
 * - merges consecutive same-role turns
 * - guarantees conversation starts with user turn
 * - guarantees assistant turn doesn't dangle at end without response
 */
export function normalizeGeminiContents(contents: any[]): any[] {
  const out: any[] = [];
  for (const c of contents || []) {
    if (!c?.role || !Array.isArray(c.parts)) continue;
    const parts = c.parts.filter((p: any) => p && Object.keys(p).length > 0);
    if (parts.length === 0) continue;
    const last = out.at(-1);
    if (last?.role === c.role) {
      last.parts.push(...parts);
    } else {
      out.push({ role: c.role, parts: [...parts] });
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
