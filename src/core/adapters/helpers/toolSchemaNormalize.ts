/**
 * Tool Schema Normalization Helper
 *
 * Ensures tool definitions and parameter schemas meet standard OpenAPI / JSON Schema requirements:
 * 1. Guarantees any schema with type: "object" has properties: {} (preventing 400 Bad Request on strict providers).
 * 2. Recursively normalizes nested object properties.
 * 3. Strips unsupported meta-keys like $schema.
 * 4. Normalizes flat tools ({ type: "function", name, parameters }) into standard OpenAI structure ({ type: "function", function: { ... } }).
 */

function isSchemaObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function mergeAllOf(branches: Record<string, unknown>[], own: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  const properties: Record<string, unknown> = {};
  const required: string[] = [];

  for (const source of [...branches, own]) {
    for (const [key, value] of Object.entries(source)) {
      if (key === "properties" && isSchemaObject(value)) {
        Object.assign(properties, value);
      } else if (key === "required" && Array.isArray(value)) {
        for (const name of value) {
          if (typeof name === "string" && !required.includes(name)) {
            required.push(name);
          }
        }
      } else if (source === own || !(key in result)) {
        result[key] = value;
      }
    }
  }

  if (Object.keys(properties).length > 0) {
    result.properties = properties;
    if (result.type === undefined) result.type = "object";
  }
  if (required.length > 0) {
    result.required = required;
  }
  return result;
}

/**
 * Sanitizes JSON Schema for Google Gemini / Vertex / AI Studio compatibility:
 * 1. Rewrites oneOf -> anyOf (Gemini supports anyOf, rejects oneOf with HTTP 400).
 * 2. Merges allOf branches into the holding object schema (merging properties and required).
 * 3. Removes items if schema type is not array (preventing field predicate failed: $type == Type.ARRAY).
 * 4. Collapses type unions like ["string", "null"] -> "string" with nullable: true.
 */
export function sanitizeSchemaForGemini(schema: unknown): unknown {
  if (!schema || typeof schema !== "object") return schema;
  if (Array.isArray(schema)) return schema.map(sanitizeSchemaForGemini);

  const out: Record<string, unknown> = {};
  let allOfBranches: Record<string, unknown>[] = [];
  const src = schema as Record<string, unknown>;

  for (const [key, value] of Object.entries(src)) {
    if (key === "$schema") continue;

    // Handle oneOf -> anyOf
    if (key === "oneOf") {
      const branches = Array.isArray(value)
        ? (value.filter(isSchemaObject).map(sanitizeSchemaForGemini) as Record<string, unknown>[])
        : [];
      const kept = branches.filter((branch) => Object.keys(branch).length > 0);
      if (kept.length > 0 && !("anyOf" in src)) {
        out.anyOf = kept;
      }
      continue;
    }

    // Handle allOf
    if (key === "allOf") {
      allOfBranches = Array.isArray(value)
        ? (value.filter(isSchemaObject).map(sanitizeSchemaForGemini) as Record<string, unknown>[])
        : [];
      continue;
    }

    // Collapse type unions like ["string", "null"] -> "string" + nullable: true
    if (key === "type" && Array.isArray(value)) {
      const nonNull = value.filter((t) => t !== "null");
      if (nonNull.length > 0) {
        out.type = nonNull.includes("array") ? "array" : nonNull[0];
      }
      if (value.includes("null")) {
        out.nullable = true;
      }
      continue;
    }

    // Recursively sanitize properties
    if (key === "properties" && isSchemaObject(value)) {
      const newProps: Record<string, unknown> = {};
      for (const [propName, propSchema] of Object.entries(value)) {
        newProps[propName] = sanitizeSchemaForGemini(propSchema);
      }
      out.properties = newProps;
      continue;
    }

    // Recursively sanitize items
    if (key === "items") {
      out.items = sanitizeSchemaForGemini(value);
      continue;
    }

    // Recursively sanitize anyOf
    if (key === "anyOf" && Array.isArray(value)) {
      out.anyOf = value.filter(isSchemaObject).map(sanitizeSchemaForGemini);
      continue;
    }

    out[key] = value;
  }

  let merged = allOfBranches.length > 0 ? mergeAllOf(allOfBranches, out) : out;

  // Items sanitation: items only allowed if type is array
  if ("items" in merged) {
    if (merged.type === "array") {
      // Valid
    } else if (merged.type === undefined && !merged.properties && !merged.anyOf) {
      merged.type = "array";
    } else {
      delete merged.items;
    }
  }

  // Ensure type: object has properties
  if (merged.type === "object" && !merged.properties) {
    merged.properties = {};
  }

  return merged;
}

/**
 * Recursively normalize tool parameter schemas.
 */
export function normalizeToolParameters(params: any): any {
  if (!params || typeof params !== "object") {
    return { type: "object", properties: {} };
  }

  const normalized: any = { ...params };

  if ("$schema" in normalized) {
    delete normalized.$schema;
  }

  if (normalized.type === "object") {
    if (!normalized.properties || typeof normalized.properties !== "object") {
      normalized.properties = {};
    } else {
      const newProps: Record<string, any> = {};
      for (const [key, propSchema] of Object.entries(normalized.properties)) {
        if (propSchema && typeof propSchema === "object") {
          newProps[key] = normalizeToolParameters(propSchema);
        } else {
          newProps[key] = propSchema;
        }
      }
      normalized.properties = newProps;
    }
  }

  return normalized;
}

/**
 * Normalize an array of tools to standard OpenAI Chat Completions tool definitions.
 */
export function normalizeToolsToOpenAi(tools?: any[]): any[] | undefined {
  if (!Array.isArray(tools) || tools.length === 0) return undefined;
  const normalized = tools
    .map((t: any) => {
      if (!t || typeof t !== "object") return null;

      // Already in standard OpenAI Chat Completions format
      if (t.function && typeof t.function === "object") {
        return {
          type: "function",
          function: {
            name: t.function.name || t.name || "",
            description: t.function.description !== undefined ? t.function.description : t.description,
            parameters: normalizeToolParameters(t.function.parameters || t.parameters),
            ...(t.function.strict !== undefined && { strict: t.function.strict }),
            ...(t.strict !== undefined && t.function.strict === undefined && { strict: t.strict }),
          },
        };
      }

      // Flat format: { type: "function", name: "...", description: "...", parameters: {...} }
      if (t.type === "function" || t.name) {
        const fn: any = {
          name: t.name || "",
          parameters: normalizeToolParameters(t.parameters),
        };
        if (t.description !== undefined) {
          fn.description = t.description;
        }
        if (t.strict !== undefined) {
          fn.strict = t.strict;
        }
        return {
          type: "function",
          function: fn,
        };
      }

      return t;
    })
    .filter(Boolean);

  return normalized.length > 0 ? normalized : undefined;
}
