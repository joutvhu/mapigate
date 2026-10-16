/**
 * Tool Schema Normalization Helper
 *
 * Ensures tool definitions and parameter schemas meet standard OpenAPI / JSON Schema requirements:
 * 1. Guarantees any schema with type: "object" has properties: {} (preventing 400 Bad Request on strict providers).
 * 2. Recursively normalizes nested object properties.
 * 3. Strips unsupported meta-keys like $schema.
 * 4. Normalizes flat tools ({ type: "function", name, parameters }) into standard OpenAI structure ({ type: "function", function: { ... } }).
 */

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
