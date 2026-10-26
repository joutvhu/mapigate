import os from "node:os";
import path from "node:path";
import {
  OPENCODE_FINGERPRINT_TOOLS,
  FINGERPRINT_TOOL_DEFINITIONS,
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

function chatFunctionOf(tool: any): any {
  return tool?.type === "function" && tool.function && typeof tool.function === "object"
    ? tool.function
    : null;
}

export function canNormalizeInPlace(tool: any, key: string): boolean {
  const def = tool && (chatFunctionOf(tool) || tool);
  const props = def?.parameters?.properties || def?.input_schema?.properties;
  if (!props || typeof props !== "object" || Array.isArray(props)) return false;

  const fingerprintDef = FINGERPRINT_TOOL_DEFINITIONS[key];
  if (!fingerprintDef) return false;

  const wanted = Object.keys(fingerprintDef.parameters?.properties || {});
  const declared = Object.keys(props);
  if (declared.some((name) => !wanted.includes(name))) return false;
  return (fingerprintDef.parameters?.required || []).every((name: string) => declared.includes(name));
}

export function withFingerprintDefinition(tool: any, key: string, isClaude = false): any {
  const def = FINGERPRINT_TOOL_DEFINITIONS[key];
  if (!def) return tool;
  const { description, parameters } = def;
  if (isClaude) {
    return { ...tool, name: key, description, input_schema: parameters };
  }
  const fn = chatFunctionOf(tool);
  return fn
    ? { ...tool, function: { ...fn, name: key, description, parameters } }
    : { ...tool, name: key, description, parameters };
}

export function concealFingerprintToolNames(
  tools: any[],
  isClaude = false
): { tools: any[]; map: Map<string, string> } {
  const map = new Map<string, string>();
  if (!Array.isArray(tools) || tools.length === 0) return { tools: tools || [], map };

  const taken = new Set<string>(tools.map(toolNameOf).filter(Boolean));
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

    // Case variation (e.g. Read vs read):
    // Map wire name -> client original name so response can restore it
    if (current !== key) {
      map.set(key, current);
      out.push(withFingerprintDefinition(tool, key, isClaude));
      continue;
    }

    // Exact name match (e.g. shell vs shell):
    // If parameters line up, normalize in place to satisfy upstream gate without aliases
    if (canNormalizeInPlace(tool, key)) {
      out.push(withFingerprintDefinition(tool, key, isClaude));
      continue;
    }

    let alias = `${key}_client`;
    for (let i = 2; taken.has(alias); i++) {
      alias = `${key}_client${i}`;
    }
    taken.add(alias);
    map.set(alias, current);

    const fn = chatFunctionOf(tool);
    if (fn) {
      out.push({ ...tool, function: { ...fn, name: alias } });
    } else {
      out.push({ ...tool, name: alias });
    }
  }
  return { tools: out, map };
}

export function appendMissingFingerprintTools(
  tools: any[],
  format: FingerprintFormat | boolean = "openai"
): { tools: any[]; appended: string[] } {
  const list = Array.isArray(tools) ? [...tools] : [];
  const isClaude = format === "claude";
  const isFlat = format === true || format === "flat";
  const appended: string[] = [];

  for (const name of OPENCODE_FINGERPRINT_TOOLS) {
    if (list.some((tool) => fingerprintToolKey(toolNameOf(tool)) === name)) continue;
    const def = FINGERPRINT_TOOL_DEFINITIONS[name] || {
      description: "OpenCode workspace tool",
      parameters: { type: "object", properties: {} },
    };

    if (isClaude) {
      list.push({
        name,
        description: def.description,
        input_schema: def.parameters,
      });
    } else if (isFlat) {
      list.push({
        type: "function",
        name,
        description: def.description,
        parameters: def.parameters,
        strict: false,
      });
    } else {
      list.push({
        type: "function",
        function: {
          name,
          description: def.description,
          parameters: def.parameters,
        },
      });
    }
    appended.push(name);
  }
  return { tools: list, appended };
}

function noteUnavailableTools(body: any, flat: boolean, names: string[], claude = false): void {
  const list = names.map((name) => `\`${name}\``).join(" or ");
  const note = names.length > 1
    ? `Do not call the ${list} tools; they are placeholders that do nothing. Use the other tools you have been given instead.`
    : `Do not call the ${list} tool; it is a placeholder that does nothing. Use the other tools you have been given instead.`;
  if (flat) {
    body.instructions = typeof body.instructions === "string" && body.instructions.trim()
      ? `${body.instructions}\n\n${note}`
      : note;
    return;
  }
  if (claude || body.system !== undefined) {
    body.system = appendSystemText(body.system, note);
    return;
  }
  if (!Array.isArray(body.messages)) return;
  const first = body.messages[0];
  if (first?.role === "system" && typeof first.content === "string") {
    body.messages = [{ ...first, content: `${first.content}\n\n${note}` }, ...body.messages.slice(1)];
  } else {
    body.messages = [{ role: "system", content: note }, ...body.messages];
  }
}

const ENV_TAG = "<env>";
const ENV_HEADING = "Here is some useful information about the environment you are running in:";
const ENV_TMP_DIR = path.join(os.tmpdir(), "opencode");
const ENV_WORKING_DIR = process.cwd();
const ENV_FINGERPRINT_PROMPT = [
  ENV_HEADING,
  ENV_TAG,
  `  Working directory: ${ENV_WORKING_DIR}`,
  `  Workspace root folder: ${ENV_WORKING_DIR}`,
  "  Is directory a git repo: no",
  `  Platform: ${process.platform}`,
  `  Prefer ${ENV_TMP_DIR} over generic system temporary directories such as /tmp; it is pre-created and approved for external access.`,
  "</env>",
].join("\n");

function systemCarriesEnv(system: any): boolean {
  if (typeof system === "string") return system.includes(ENV_TAG);
  if (Array.isArray(system)) {
    return system.some((block: any) => typeof block?.text === "string" && block.text.includes(ENV_TAG));
  }
  return false;
}

function appendSystemText(system: any, text: string): any {
  if (typeof system === "string") {
    return system.trim() ? `${system}\n\n${text}` : text;
  }
  const blocks = Array.isArray(system) ? [...system] : [];
  for (let i = blocks.length - 1; i >= 0; i--) {
    const block = blocks[i];
    if (typeof block?.text === "string") {
      const existing = block.text.trim();
      blocks[i] = { ...block, text: existing ? `${block.text}\n\n${text}` : text };
      return blocks;
    }
  }
  return [...blocks, { type: "text", text }];
}

export function applyEnvFingerprint(body: any, flat: boolean, { claude = false }: { claude?: boolean } = {}): boolean {
  try {
    if (!body || typeof body !== "object") return false;

    if (flat) {
      if (body.instructions !== undefined && typeof body.instructions !== "string") return false;
      if (systemCarriesEnv(body.instructions)) return false;
      body.instructions = (typeof body.instructions === "string" && body.instructions.trim())
        ? `${body.instructions}\n\n${ENV_FINGERPRINT_PROMPT}`
        : ENV_FINGERPRINT_PROMPT;
      return true;
    }

    if (claude || body.system !== undefined) {
      if (systemCarriesEnv(body.system)) return false;
      body.system = appendSystemText(body.system, ENV_FINGERPRINT_PROMPT);
      return true;
    }

    if (!Array.isArray(body.messages)) return false;
    const idx = body.messages.findIndex((msg: any) => msg?.role === "system");
    if (idx >= 0) {
      const target = body.messages[idx];
      if (systemCarriesEnv(target.content)) return false;
      const content = appendSystemText(target.content, ENV_FINGERPRINT_PROMPT);
      body.messages = body.messages.map((msg: any, i: number) => (i === idx ? { ...msg, content } : msg));
      return true;
    }
    body.messages = [{ role: "system", content: ENV_FINGERPRINT_PROMPT }, ...body.messages];
    return true;
  } catch {
    return false;
  }
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

  const { tools, map } = concealFingerprintToolNames(body.tools, isClaude);
  const { tools: finalTools, appended } = appendMissingFingerprintTools(tools, format);
  body.tools = finalTools;
  retargetToolChoice(body, map, format);

  if (appended.length > 0) {
    noteUnavailableTools(body, isFlat, appended, isClaude);
  }

  applyEnvFingerprint(body, isFlat, { claude: isClaude });

  if (isClaude) {
    if (body.tool_choice === "none") {
      delete body.tool_choice;
    }
  } else if (!body.tool_choice) {
    if (isFlat) body.tool_choice = "auto";
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
  } catch {
    // Fail-open
  }

  return payload;
}
