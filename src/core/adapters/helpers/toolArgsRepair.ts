/**
 * Schema-aware repair of double-encoded tool-call arguments.
 *
 * Several models emit nested JSON inside tool arguments as a string:
 * `{"plan": "[{\"step\":...}]"}` instead of `{"plan": [{"step":...}]}`.
 * Strict coding agents reject the call. This module repairs arguments
 * schema-consciously: only when the schema says a parameter is an array/object
 * AND the string value parses to exactly that JSON type.
 * Also handles whole-arguments double encoding (`"{\"a\": 1}"`).
 */

export interface JsonSchemaish {
  type?: string;
  properties?: Record<string, JsonSchemaish>;
  items?: JsonSchemaish;
}

/**
 * Decode `value` against the schema node that describes it, or return `undefined`.
 */
function decodeIfSchemaSays(
  value: string,
  schema: JsonSchemaish | undefined
): unknown | undefined {
  const want = schema?.type;
  if (want !== "array" && want !== "object") return undefined;
  const trimmed = value.trim();
  if (!(trimmed.startsWith("[") || trimmed.startsWith("{"))) return undefined;
  try {
    const inner = JSON.parse(trimmed);
    const isMatch =
      want === "array"
        ? Array.isArray(inner)
        : inner !== null && typeof inner === "object" && !Array.isArray(inner);
    return isMatch ? inner : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Recursively walk decoded JSON in-place alongside its schema, decoding
 * double-encoded strings wherever the schema allows.
 */
function repairInPlace(
  node: unknown,
  schema: JsonSchemaish | undefined
): boolean {
  if (node === null || typeof node !== "object") return false;

  let changed = false;

  if (Array.isArray(node)) {
    const itemSchema = schema?.items;
    if (!itemSchema) return false;
    for (let i = 0; i < node.length; i++) {
      const value = node[i];
      if (typeof value === "string") {
        const decoded = decodeIfSchemaSays(value, itemSchema);
        if (decoded !== undefined) {
          node[i] = decoded;
          changed = true;
          repairInPlace(decoded, itemSchema);
        }
      } else if (repairInPlace(value, itemSchema)) {
        changed = true;
      }
    }
    return changed;
  }

  const props = schema?.properties;
  if (!props) return false;

  const obj = node as Record<string, unknown>;
  for (const [key, value] of Object.entries(obj)) {
    const child = props[key];
    if (!child) continue;
    if (typeof value === "string") {
      const decoded = decodeIfSchemaSays(value, child);
      if (decoded !== undefined) {
        obj[key] = decoded;
        changed = true;
        repairInPlace(decoded, child);
      }
    } else if (repairInPlace(value, child)) {
      changed = true;
    }
  }

  return changed;
}

/**
 * Repair a tool call's `arguments` JSON string against the tool's parameter schema.
 * Fail-open invariant: returns original string untouched on any error.
 */
export function repairToolArguments(
  args: string,
  paramSchema?: JsonSchemaish
): string {
  if (!args) return args;

  let parsed: unknown;
  try {
    parsed = JSON.parse(args);
  } catch {
    return args;
  }

  let changed = false;

  // Whole-arguments double encoding: `"{\"a\":1}"`
  if (typeof parsed === "string") {
    try {
      const inner = JSON.parse(parsed);
      if (inner !== null && typeof inner === "object" && !Array.isArray(inner)) {
        parsed = inner;
        changed = true;
      } else {
        return args;
      }
    } catch {
      return args;
    }
  }

  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    return changed ? JSON.stringify(parsed) : args;
  }

  try {
    if (repairInPlace(parsed, paramSchema)) {
      changed = true;
    }
  } catch {
    return args;
  }

  return changed ? JSON.stringify(parsed) : args;
}

/**
 * Recursively remove the given keys from a JSON-Schema-ish value.
 * Never mutates input (returns fresh object).
 */
export function stripSchemaKeys<T>(schema: T, keys: Set<string>): T {
  if (Array.isArray(schema)) {
    return schema.map((s) => stripSchemaKeys(s, keys)) as unknown as T;
  }
  if (schema && typeof schema === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(schema as Record<string, unknown>)) {
      if (keys.has(k)) continue;
      out[k] = stripSchemaKeys(v, keys);
    }
    return out as unknown as T;
  }
  return schema;
}

/**
 * Build a tool-name -> parameter-schema map from OpenAI-style or Anthropic-style tools.
 */
export function toolSchemaMap(
  tools?: Array<any>
): Map<string, JsonSchemaish> {
  const map = new Map<string, JsonSchemaish>();
  for (const t of tools ?? []) {
    // OpenAI style: { type: 'function', function: { name, parameters } }
    if (
      t?.type === "function" &&
      t.function?.name &&
      t.function?.parameters &&
      typeof t.function.parameters === "object"
    ) {
      map.set(t.function.name, t.function.parameters as JsonSchemaish);
      continue;
    }
    // Anthropic style: { name, input_schema }
    if (
      t?.name &&
      t.input_schema &&
      typeof t.input_schema === "object"
    ) {
      map.set(t.name, t.input_schema as JsonSchemaish);
      continue;
    }
  }
  return map;
}

/**
 * Extract tool names from an array of OpenAI or Anthropic tool definitions.
 */
export function extractToolNames(tools?: Array<any>): Set<string> {
  const names = new Set<string>();
  for (const t of tools ?? []) {
    if (t?.type === "function" && t.function?.name) {
      names.add(t.function.name);
    } else if (typeof t?.name === "string") {
      names.add(t.name);
    }
  }
  return names;
}
