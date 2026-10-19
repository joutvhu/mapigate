/**
 * Tool Arguments Sanitizer for Mapigate
 *
 * Cleans malformed tool call arguments, including:
 * - Google Cloud Code / Gemini's `{ invalidArgs: string }`
 * - Concatenated JSON objects (e.g. `{"a":1}{"b":2}`)
 * - Escaped stringified arguments
 */

/**
 * Extract and parse the first valid JSON object from a potentially
 * malformed or concatenated JSON string.
 */
export function parseFirstJsonObject(raw: string): Record<string, any> | null {
  if (!raw || typeof raw !== "string") return null;
  const startIdx = raw.indexOf("{");
  if (startIdx === -1) return null;
  const text = raw.slice(startIdx);

  let depth = 0;
  let inString = false;
  let escape = false;
  let endIdx = -1;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (escape) {
      escape = false;
      continue;
    }
    if (char === "\\") {
      escape = true;
      continue;
    }
    if (char === '"') {
      inString = !inString;
      continue;
    }
    if (!inString) {
      if (char === "{") depth++;
      else if (char === "}") {
        depth--;
        if (depth === 0) {
          endIdx = i;
          break;
        }
      }
    }
  }

  if (endIdx !== -1) {
    const jsonStr = text.slice(0, endIdx + 1);
    try {
      const parsed = JSON.parse(jsonStr);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        return parsed;
      }
    } catch {
      return null;
    }
  }
  return null;
}

/**
 * Extract all valid JSON objects from a concatenated JSON string like `{"a":1}{"b":2}`.
 */
export function parseAllJsonObjects(raw: string): Array<Record<string, any>> {
  if (!raw || typeof raw !== "string") return [];
  let text = raw.trim();
  const results: Array<Record<string, any>> = [];

  while (text.length > 0) {
    const startIdx = text.indexOf("{");
    if (startIdx === -1) break;
    text = text.slice(startIdx);

    let depth = 0;
    let inString = false;
    let escape = false;
    let endIdx = -1;

    for (let i = 0; i < text.length; i++) {
      const char = text[i];
      if (escape) {
        escape = false;
        continue;
      }
      if (char === "\\") {
        escape = true;
        continue;
      }
      if (char === '"') {
        inString = !inString;
        continue;
      }
      if (!inString) {
        if (char === "{") depth++;
        else if (char === "}") {
          depth--;
          if (depth === 0) {
            endIdx = i;
            break;
          }
        }
      }
    }

    if (endIdx !== -1) {
      const jsonStr = text.slice(0, endIdx + 1);
      try {
        const parsed = JSON.parse(jsonStr);
        if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
          results.push(parsed);
        }
      } catch {}
      text = text.slice(endIdx + 1).trim();
    } else {
      break;
    }
  }

  return results;
}

/**
 * Sanitize tool arguments to guarantee a valid, non-corrupted object conforming
 * to standard function parameters. Strips synthetic `invalidArgs` wrappers and
 * unpacks concatenated JSONs.
 */
export function sanitizeToolArguments(args: any): Record<string, any> {
  if (!args) return {};

  if (typeof args === "string") {
    try {
      const parsed = JSON.parse(args);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        return sanitizeToolArguments(parsed);
      }
    } catch {
      const first = parseFirstJsonObject(args);
      if (first) {
        return sanitizeToolArguments(first);
      }
      return {};
    }
  }

  if (typeof args === "object" && !Array.isArray(args)) {
    // Check for Google Cloud Code PA's synthetic `invalidArgs` wrapper
    if (typeof args.invalidArgs === "string") {
      const unpacked = parseFirstJsonObject(args.invalidArgs);
      if (unpacked) {
        return sanitizeToolArguments(unpacked);
      }
      try {
        const parsed = JSON.parse(args.invalidArgs);
        if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
          return sanitizeToolArguments(parsed);
        }
      } catch {}
      return {};
    }
    return args;
  }

  return {};
}
