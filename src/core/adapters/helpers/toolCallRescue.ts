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
    const closeTag = text.indexOf("</function>", extracted?.end ?? m.index + m[0].length);
    if (!ok && closeTag !== -1) {
      const block = text.slice(m.index, closeTag + "</function>".length);
      const call = parseMimoFunctionAndParameters(block, toolNames);
      if (call) {
        calls.push(call);
        ok = true;
      }
    }
    if (!ok) parsedAll = false;
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
  if (!isKnownTool(name, toolNames)) {
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
    let rawVal = afterFn.slice(curr.start, nextStart).trim();
    rawVal = rawVal.replace(/(?:<\/(?:parameter|function|tool_call|invoke|tool_use)>\s*)+$/i, "").trim();
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

export function parseAnyToolBlock(
  raw: string,
  toolNames?: Set<string>
): RescuedToolCall | null {
  if (!raw || typeof raw !== "string") return null;
  const trimmed = raw.trim();

  // 1. JSON object format: {"name": ..., "arguments"|"parameters": ...}
  if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
    const jsonCall = callFromNamedJson(trimmed, toolNames);
    if (jsonCall) return jsonCall;
  }

  // 2. MiMo / Hermes parameter format: <function=NAME><parameter=KEY>VALUE...
  const mimoCall = parseMimoFunctionAndParameters(trimmed, toolNames);
  if (mimoCall) return mimoCall;

  // 3. Anthropic XML format: <invoke name="NAME">... or <tool_use><name>NAME</name>...
  const invokeMatch = /<(?:invoke|function)\s+(?:name|call)=["']?([A-Za-z0-9_.-]+)["']?>/i.exec(trimmed);
  if (invokeMatch) {
    const name = invokeMatch[1].trim();
    if (!isKnownTool(name, toolNames)) return null;
    const body = trimmed.slice(invokeMatch.index + invokeMatch[0].length);
    const paramRegex = /<parameter\s+name=["']?([A-Za-z0-9_.-]+)["']?>([\s\S]*?)<\/parameter>/gi;
    const argsObj: Record<string, any> = {};
    let pm: RegExpExecArray | null;
    let found = false;
    while ((pm = paramRegex.exec(body)) !== null) {
      found = true;
      const key = pm[1].trim();
      const rawVal = pm[2].trim();
      let val: any = rawVal;
      try { val = JSON.parse(rawVal); } catch {}
      argsObj[key] = val;
    }
    if (found) {
      return { name, arguments: JSON.stringify(argsObj) };
    }
    const argsMatch = /<arguments>([\s\S]*?)<\/arguments>/i.exec(body);
    if (argsMatch) {
      const rawArgs = argsMatch[1].trim();
      try {
        JSON.parse(rawArgs);
        return { name, arguments: rawArgs };
      } catch {}
    }
  }

  const toolUseMatch = /<tool_use>[\s\S]*?<name>([A-Za-z0-9_.-]+)<\/name>/i.exec(trimmed);
  if (toolUseMatch) {
    const name = toolUseMatch[1].trim();
    if (isKnownTool(name, toolNames)) {
      const argsMatch = /<arguments>([\s\S]*?)<\/arguments>/i.exec(trimmed);
      if (argsMatch) {
        const rawArgs = argsMatch[1].trim();
        try {
          JSON.parse(rawArgs);
          return { name, arguments: rawArgs };
        } catch {}
      }
    }
  }

  return null;
}

export interface StreamToolCallRescuer {
  feed(text: string): { calls: RescuedToolCall[]; cleanText: string | null };
  flush(): { calls: RescuedToolCall[]; cleanText: string | null };
}

export function createStreamToolCallRescuer(toolNames?: Set<string>): StreamToolCallRescuer {
  let buffer = "";
  let inBlock = false;
  let closeTag = "</tool_call>";

  const TAG_PAIRS: Array<{ open: RegExp; close: string }> = [
    { open: /<tool_call>/i, close: "</tool_call>" },
    { open: /<function[=> ]/i, close: "</function>" },
    { open: /<tool_use>/i, close: "</tool_use>" },
    { open: /<invoke[> ]/i, close: "</invoke>" },
  ];

  function processBuffer(): { calls: RescuedToolCall[]; cleanText: string | null } {
    const calls: RescuedToolCall[] = [];
    let textOut = "";

    while (buffer.length > 0) {
      if (inBlock) {
        const closeIdx = buffer.indexOf(closeTag);
        if (closeIdx === -1) {
          // Block is incomplete, keep all in buffer
          break;
        }
        const block = buffer.slice(0, closeIdx + closeTag.length);
        buffer = buffer.slice(closeIdx + closeTag.length);
        inBlock = false;

        const call = parseAnyToolBlock(block, toolNames);
        if (call) {
          calls.push(call);
        } else {
          // If unparseable, don't drop content, return as text
          textOut += block;
        }
      } else {
        // Search for opening tag
        let earliestMatch: { index: number; length: number; close: string } | null = null;
        for (const pair of TAG_PAIRS) {
          const m = buffer.match(pair.open);
          if (m && m.index !== undefined) {
            if (!earliestMatch || m.index < earliestMatch.index) {
              earliestMatch = { index: m.index, length: m[0].length, close: pair.close };
            }
          }
        }

        if (!earliestMatch) {
          // No tag found in buffer. Check if buffer ends with a potential opening tag prefix (e.g. "<", "<tool", etc.)
          const partialMatch = /<[a-z_0-9=-]*$/i.exec(buffer);
          if (partialMatch) {
            const safeLen = partialMatch.index;
            textOut += buffer.slice(0, safeLen);
            buffer = buffer.slice(safeLen);
          } else {
            textOut += buffer;
            buffer = "";
          }
          break;
        }

        // Emit text before opening tag
        if (earliestMatch.index > 0) {
          textOut += buffer.slice(0, earliestMatch.index);
        }

        buffer = buffer.slice(earliestMatch.index);
        inBlock = true;
        closeTag = earliestMatch.close;
      }
    }

    return {
      calls,
      cleanText: textOut.length > 0 ? textOut : null,
    };
  }

  return {
    feed(text: string) {
      if (!text) return { calls: [], cleanText: null };
      buffer += text;
      return processBuffer();
    },
    flush() {
      if (!buffer) return { calls: [], cleanText: null };
      if (inBlock) {
        inBlock = false;
        const call = parseAnyToolBlock(buffer, toolNames);
        if (call) {
          buffer = "";
          return { calls: [call], cleanText: null };
        }
      }
      const remaining = buffer;
      buffer = "";
      return { calls: [], cleanText: remaining.length > 0 ? remaining : null };
    },
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
    let call = parseAnyToolBlock(inner, toolNames);
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
