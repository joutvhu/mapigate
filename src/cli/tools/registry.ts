import type { ToolConfigHandler, ResolveToolResult } from "./types.js";
import { claudeHandler } from "./configurators/claude.js";
import { codexHandler } from "./configurators/codex.js";
import { opencodeHandler } from "./configurators/opencode.js";
import { droidHandler } from "./configurators/droid.js";
import { clineHandler } from "./configurators/cline.js";
import { openclawHandler } from "./configurators/openclaw.js";

export const ALL_TOOL_HANDLERS: ToolConfigHandler[] = [
  claudeHandler,
  codexHandler,
  opencodeHandler,
  droidHandler,
  clineHandler,
  openclawHandler,
];

export const SUPPORTED_TOOL_IDS = ALL_TOOL_HANDLERS.map((h) => h.id);

export const TOOL_ALIASES: Record<string, string> = {
  "claude-code": "claude",
  "claudecode": "claude",
  "codex-cli": "codex",
  "open-code": "opencode",
  "factory": "droid",
  "factory-droid": "droid",
  "cline-cli": "cline",
  "open-claw": "openclaw",
};

export class CliToolRegistry {
  private static handlers: Map<string, ToolConfigHandler> = new Map(
    ALL_TOOL_HANDLERS.map((h) => [h.id, h])
  );

  public static get(id: string): ToolConfigHandler | undefined {
    const clean = id.trim().toLowerCase();
    const resolved = TOOL_ALIASES[clean] || clean;
    return this.handlers.get(resolved);
  }

  public static getAll(): ToolConfigHandler[] {
    return ALL_TOOL_HANDLERS;
  }

  public static register(handler: ToolConfigHandler, aliases: string[] = []): void {
    this.handlers.set(handler.id.toLowerCase(), handler);
    for (const a of aliases) {
      TOOL_ALIASES[a.toLowerCase()] = handler.id.toLowerCase();
    }
  }
}

export function resolveToolHandlersWithValidation(toolNames: string[]): ResolveToolResult {
  if (!toolNames.length || toolNames.map((t) => t.trim().toLowerCase()).includes("all")) {
    return { handlers: ALL_TOOL_HANDLERS, unrecognized: [] };
  }

  const handlers: ToolConfigHandler[] = [];
  const unrecognized: string[] = [];

  for (const raw of toolNames) {
    const clean = raw.trim().toLowerCase();
    if (!clean) continue;
    const resolved = TOOL_ALIASES[clean] || clean;
    const match = ALL_TOOL_HANDLERS.find(
      (h) => h.id === resolved || h.id.replace(/-/g, "") === resolved.replace(/-/g, "")
    );
    if (match) {
      if (!handlers.includes(match)) {
        handlers.push(match);
      }
    } else {
      unrecognized.push(raw.trim());
    }
  }

  return { handlers, unrecognized };
}

export function resolveToolHandlers(toolNames: string[]): ToolConfigHandler[] {
  return resolveToolHandlersWithValidation(toolNames).handlers;
}
