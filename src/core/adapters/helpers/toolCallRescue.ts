/**
 * Inline tool-call dialect rescue.
 *
 * When a model emits tool calls as raw TEXT in private training dialects
 * instead of structured tool_calls, this module detects and re-parses them
 * into standard tool calls, schema-gated against the request's tool list.
 *
 * Supported dialects:
 *  1. Kimi / DeepSeek token style:
 *     <|tool_calls_section_begin|><|tool_call_begin|>functions.NAME:0
 *     <|tool_call_argument_begin|>{...}<|tool_call_end|>...
 *  2. Llama / Groq function tags: <function=NAME{...}</function> and
 *     <function=NAME>{...}</function>
 *  3. Qwen / Hermes XML: <tool_call>{"name": ..., "arguments": ...}</tool_call>
 *  4. Bare or ```json-fenced single JSON object: {"name": KNOWN, "arguments": {...}}
 *     (strictly schema-gated to known tools)
 */

export interface RescuedToolCall {
  name: string;
  /** JSON string, matching OpenAI's function.arguments */
  arguments: string;
}

export interface RescueResult {
  /** True when the text contains inline tool-call dialect markers. */
  detected: boolean;
  /** Parsed calls; null when detected but unparseable (dead turn). */
  calls: RescuedToolCall[] | null;
  /** Text with the dialect blocks removed (may be ''). */
  cleanText: string;
}

const DIALECT_MARKERS = [
  "<|tool_calls_section_begin|>",
  "<|tool_call_begin|>",
  "<tool_call>",
  "<function=",
] as const;

/** Does the (trimmed) text start with a known dialect marker? */
export function startsWithDialectMarker(text: string): boolean {
  if (!text) return false;
  const t = text.trimStart();
  return DIALECT_MARKERS.some((m) => t.startsWith(m));
}

/**
 * Streaming hold-window helper: could `text` still grow into a dialect marker?
 */
export function couldBecomeDialectMarker(text: string): boolean {
  const t = text.trimStart();
  if (t.length === 0) return true;
  return DIALECT_MARKERS.some((m) => m.startsWith(t) && t.length < m.length);
}

/** Anywhere-in-text detection for non-streaming paths. */
export function containsDialectMarker(text: string): boolean {
  if (!text) return false;
  return DIALECT_MARKERS.some((m) => text.includes(m));
}

/**
 * Extract one balanced JSON object or array starting at text[from] (which must be '{' or '[').
 * String-aware so braces inside strings don't break balance.
 */
export function extractBalancedJson(
  text: string,
  from: number
): { json: string; end: number } | null {
  const open = text[from];
  if (open !== "{" && open !== "[") return null;
  const close = open === "{" ? "}" : "]";
  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let i = from; i < text.length; i++) {
    const ch = text[i];
    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (ch === "\\") {
        escaped = true;
      } else if (ch === '"') {
        inString = false;
      }
      continue;
    }
    if (ch === '"') {
      inString = true;
    } else if (ch === open) {
      depth++;
    } else if (ch === close) {
      depth--;
      if (depth === 0) {
        return { json: text.slice(from, i + 1), end: i + 1 };
      }
    }
  }
  return null;
}

const isKnownTool = (name: string, toolNames?: Set<string>): boolean =>
  toolNames !== undefined ? (toolNames.size === 0 ? false : toolNames.has(name)) : true;

/** Parse `{"name": ..., "arguments"|"parameters": ...}` into a call. */
export function callFromNamedJson(
  json: string,
  toolNames?: Set<string>
): RescuedToolCall | null {
  let obj: unknown;
  try {
    obj = JSON.parse(json);
  } catch {
    return null;
  }
  if (typeof obj !== "object" || obj === null) return null;
  const o = obj as Record<string, unknown>;
  const name = typeof o.name === "string" ? o.name : undefined;
  if (!name || !isKnownTool(name, toolNames)) return null;

  const rawArgs = o.arguments ?? o.parameters ?? {};
  const args = typeof rawArgs === "string" ? rawArgs : JSON.stringify(rawArgs);
  try {
    JSON.parse(args);
  } catch {
    return null;
  }
  return { name, arguments: args };
}

/** Dialect 1: Kimi/DeepSeek <|tool_call_begin|> token blocks. */
function parseTokenDialect(
  text: string,
  toolNames: Set<string>
): { calls: RescuedToolCall[] | null; cleanText: string } {
  const calls: RescuedToolCall[] = [];
  let clean = text;
  clean = clean
    .replaceAll("<|tool_calls_section_begin|>", "")
    .replaceAll("<|tool_calls_section_end|>", "");

  const callRe = /<\|tool_call_begin\|>\s*([\s\S]*?)\s*<\|tool_call_argument_begin\|>\s*/g;
  let m: RegExpExecArray | null;
  let parsedAll = true;
  const spans: Array<{ from: number; to: number }> = [];

  while ((m = callRe.exec(clean)) !== null) {
    const idToken = m[1].trim();
    const argStart = m.index + m[0].length;
    const jsonStart = clean.indexOf("{", argStart);
    const extracted = jsonStart === -1 ? null : extractBalancedJson(clean, jsonStart);

    const nameMatch = /^functions\.([A-Za-z0-9_.-]+):\d+$/.exec(idToken);
    const name = nameMatch?.[1];
    let argsOk = false;
    if (extracted && name && isKnownTool(name, toolNames)) {
      try {
        JSON.parse(extracted.json);
        argsOk = true;
      } catch {
        /* fall through */
      }
      if (argsOk) calls.push({ name, arguments: extracted.json });
    }
    if (!argsOk) parsedAll = false;
    const endTag = clean.indexOf("<|tool_call_end|>", extracted?.end ?? argStart);
    spans.push({
      from: m.index,
      to: endTag === -1 ? (extracted?.end ?? argStart) : endTag + "<|tool_call_end|>".length,
    });
  }

  for (const s of [...spans].reverse()) {
    clean = clean.slice(0, s.from) + clean.slice(s.to);
  }
  return { calls: parsedAll && calls.length > 0 ? calls : null, cleanText: clean.trim() };
}

/** Dialect 2: <function=NAME{...}</function> */
function parseFunctionTagDialect(
  text: string,
  toolNames: Set<string>
): { calls: RescuedToolCall[] | null; cleanText: string } {
  const calls: RescuedToolCall[] = [];
  let clean = text;
  let parsedAll = true;
  const headRe = /<function=([A-Za-z0-9_.-]+)\s*>?\s*/g;
  let m: RegExpExecArray | null;
  const spans: Array<{ from: number; to: number }> = [];

  while ((m = headRe.exec(text)) !== null) {
    const name = m[1];
    const afterHead = m.index + m[0].length;
    const jsonStart =
      text[afterHead] === "{" || text[afterHead] === "["
        ? afterHead
        : text.indexOf("{", afterHead);
    const extracted = jsonStart === -1 ? null : extractBalancedJson(text, jsonStart);
    let ok = false;
    if (extracted && isKnownTool(name, toolNames) && extracted.json.startsWith("{")) {
      try {
        JSON.parse(extracted.json);
        ok = true;
      } catch {
        /* fall through */
      }
      if (ok) calls.push({ name, arguments: extracted.json });
    }
    if (!ok) parsedAll = false;
    const closeTag = text.indexOf("</function>", extracted?.end ?? m.index + m[0].length);
    spans.push({
      from: m.index,
      to: closeTag === -1 ? (extracted?.end ?? m.index + m[0].length) : closeTag + "</function>".length,
    });
  }

  for (const s of [...spans].reverse()) {
    clean = clean.slice(0, s.from) + clean.slice(s.to);
  }
  return { calls: parsedAll && calls.length > 0 ? calls : null, cleanText: clean.trim() };
}

export function parseMimoFunctionAndParameters(
  inner: string,
  toolNames?: Set<string>
): RescuedToolCall | null {
  const fnMatch = /<function=([A-Za-z0-9_.-]+)>/i.exec(inner);
  if (!fnMatch) return null;
  const name = fnMatch[1].trim();
  if (toolNames && toolNames.size > 0 && !toolNames.has(name)) {
    return null;
  }

  const afterFn = inner.slice(fnMatch.index + fnMatch[0].length);
  const paramRegex = /<parameter=([A-Za-z0-9_.-]+)>/gi;
  const paramMatches: Array<{ key: string; start: number; end: number }> = [];

  let pm: RegExpExecArray | null;
  while ((pm = paramRegex.exec(afterFn)) !== null) {
    paramMatches.push({
      key: pm[1].trim(),
      start: pm.index + pm[0].length,
      end: pm.index,
    });
  }

  const argsObj: Record<string, any> = {};
  for (let i = 0; i < paramMatches.length; i++) {
    const curr = paramMatches[i];
    const nextStart = i + 1 < paramMatches.length ? paramMatches[i + 1].end : afterFn.length;
    const rawVal = afterFn.slice(curr.start, nextStart).trim();
    let val: any = rawVal;
    if (
      (rawVal.startsWith("{") && rawVal.endsWith("}")) ||
      (rawVal.startsWith("[") && rawVal.endsWith("]")) ||
      rawVal === "true" ||
      rawVal === "false" ||
      rawVal === "null" ||
      (!isNaN(Number(rawVal)) && rawVal !== "")
    ) {
      try {
        val = JSON.parse(rawVal);
      } catch {
        val = rawVal;
      }
    }
    argsObj[curr.key] = val;
  }

  return {
    name,
    arguments: JSON.stringify(argsObj),
  };
}

/** Dialect 3: <tool_call>{...}</tool_call> XML-JSON blocks. */
function parseXmlDialect(
  text: string,
  toolNames: Set<string>
): { calls: RescuedToolCall[] | null; cleanText: string } {
  const calls: RescuedToolCall[] = [];
  let parsedAll = true;
  const re = /<tool_call>\s*([\s\S]*?)\s*<\/tool_call>/g;
  let m: RegExpExecArray | null;
  const matches: string[] = [];

  while ((m = re.exec(text)) !== null) {
    matches.push(m[1]);
  }
  for (const inner of matches) {
    let call = callFromNamedJson(inner, toolNames);
    if (!call) {
      call = parseMimoFunctionAndParameters(inner, toolNames);
    }
    if (call) calls.push(call);
    else parsedAll = false;
  }
  let clean = text.replace(/<tool_call>\s*[\s\S]*?\s*<\/tool_call>/g, "");
  if (/<tool_call>/.test(clean)) {
    parsedAll = false;
    clean = clean.replace(/<tool_call>[\s\S]*$/, "");
  }
  return { calls: parsedAll && calls.length > 0 ? calls : null, cleanText: clean.trim() };
}

/**
 * Rescue inline tool-call dialects out of an assistant text answer.
 * Fail-open invariant: wrapped in try/catch to never crash the turn.
 *
 * @param text the assistant message content
 * @param toolNames the names of tools declared in the request
 */
export function rescueInlineToolCalls(
  text: string,
  toolNames: Set<string>
): RescueResult {
  if (!text) return { detected: false, calls: null, cleanText: text };

  try {
    if (
      text.includes("<|tool_call_begin|>") ||
      text.includes("<|tool_calls_section_begin|>")
    ) {
      const { calls, cleanText } = parseTokenDialect(text, toolNames);
      return { detected: true, calls, cleanText };
    }
    if (text.includes("<tool_call>")) {
      const { calls, cleanText } = parseXmlDialect(text, toolNames);
      return { detected: true, calls, cleanText };
    }
    if (text.includes("<function=")) {
      const { calls, cleanText } = parseFunctionTagDialect(text, toolNames);
      return { detected: true, calls, cleanText };
    }

    // Dialect 4: bare or ```json-fenced JSON object naming a known tool
    const trimmed = text.trim();
    const fenced = /^```(?:json)?\s*([\s\S]*?)\s*```$/.exec(trimmed);
    const candidate = (fenced ? fenced[1] : trimmed).trim();
    if (candidate.startsWith("{") && candidate.endsWith("}")) {
      const call = callFromNamedJson(candidate, toolNames);
      if (call) {
        return { detected: true, calls: [call], cleanText: "" };
      }
    }

    return { detected: false, calls: null, cleanText: text };
  } catch {
    // Fail-open: return untouched
    return { detected: false, calls: null, cleanText: text };
  }
}
