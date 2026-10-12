import {
  OPENCODE_FINGERPRINT_TOOLS,
  type FingerprintFormat,
} from "./types.js";

export function fingerprintToolKey(name: unknown): string {
  const lower = String(name ?? "").trim().toLowerCase();
  return (OPENCODE_FINGERPRINT_TOOLS as readonly string[]).includes(lower) ? lower : "";
}

function toolNameOf(tool: any): string {
  if (!tool || typeof tool !== "object" || Array.isArray(tool)) return "";
  if (typeof tool.name === "string" && tool.name.trim()) return tool.name.trim();
  const fn = tool.function;
  if (fn && typeof fn === "object" && !Array.isArray(fn) && typeof fn.name === "string") {
    return fn.name.trim();
  }
  return "";
}

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
      list.push({
        name,
        description: "This tool is currently unavailable and must not be used.",
        input_schema: { type: "object", properties: {} },
      });
    } else if (isFlat) {
      list.push({
        type: "function",
        name,
        description: "This tool is currently unavailable and must not be used.",
        parameters: { type: "object", properties: {} },
      });
    } else {
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

export function retargetToolChoice(
  body: any,
  map: Map<string, string>,
  format: FingerprintFormat | boolean = "openai"
): void {
  if (!body || typeof body !== "object" || !map?.size) return;
  const choice = body.tool_choice;
  if (!choice || typeof choice !== "object" || Array.isArray(choice)) return;

  if (choice.type === "tool" && typeof choice.name === "string") {
    const key = fingerprintToolKey(choice.name);
    if (key && map.has(key)) choice.name = key;
    return;
  }

  if (typeof choice.name === "string") {
    const key = fingerprintToolKey(choice.name);
    if (key && map.has(key)) body.tool_choice = { ...choice, name: key };
    return;
  }

  const fn = choice.function;
  if (fn && typeof fn === "object" && !Array.isArray(fn) && typeof fn.name === "string") {
    const key = fingerprintToolKey(fn.name);
    if (key && map.has(key)) {
      body.tool_choice = { ...choice, function: { ...fn, name: key } };
    }
  }
}

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
    if (body.tool_choice === "none") {
      delete body.tool_choice;
    }
  } else if (!body.tool_choice) {
    if (isFlat) body.tool_choice = "auto";
    else if (!hadClientTools) body.tool_choice = "none";
  }

  return map;
}

export function restoreToolNames(payload: any, map: Map<string, string>): any {
  if (!payload || typeof payload !== "object" || map.size === 0) return payload;

  try {
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
    // Fail-open
  }

  return payload;
}
