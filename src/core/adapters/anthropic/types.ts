import type { JsonSchemaish } from "../helpers/toolArgsRepair.js";
import { toolSchemaMap } from "../helpers/toolArgsRepair.js";
import type { StreamToolCallRescuer } from "../helpers/toolCallRescue.js";
import { createStreamToolCallRescuer } from "../helpers/toolCallRescue.js";

export const AUTO_MODE_SAFEGUARD_TYPE = "dangerous_tool_use";

/**
 * Checks if the request body or compat metadata requests auto mode tool review.
 */
export function requestsAutoModeReview(safeguards: unknown): boolean {
  return (
    Array.isArray(safeguards) &&
    safeguards.some(
      (entry) =>
        typeof entry === "object" &&
        entry !== null &&
        (entry as { type?: unknown }).type === AUTO_MODE_SAFEGUARD_TYPE
    )
  );
}

/**
 * Resolves the safeguard_results to return.
 * Upstream results go back unchanged; otherwise if client requested review,
 * return protocol's unsupported status so Claude Code falls back to client-side review.
 */
export function safeguardResultsFor(safeguards: unknown, upstreamSafeguardResults: unknown): unknown {
  if (upstreamSafeguardResults !== undefined) return upstreamSafeguardResults;
  if (!requestsAutoModeReview(safeguards)) return undefined;
  return [{ type: AUTO_MODE_SAFEGUARD_TYPE, status: { type: "unsupported" } }];
}

export interface AnthropicStreamState {
  messageStartSent?: boolean;
  messageId?: string;
  nextBlockIndex: number;
  currentBlockType: "thinking" | "text" | "tool_use" | null;
  currentBlockIndex: number | null;
  currentToolCallIndex?: number;
  toolCalls: Map<
    number,
    { id: string; name: string; blockIndex: number; started: boolean; stopped?: boolean }
  >;
  outputTokens?: number;
  messageStopSent?: boolean;
  toolSchemas?: Map<string, JsonSchemaish>;
  safeguards?: any[];
  safeguardResults?: any;
}

export interface AnthropicToOpenAiStreamState {
  toolCallIndex: number;
  blockIndexToToolCallIndex: Map<number, number>;
  promptTokens?: number;
  cachedTokens?: number;
  cacheCreationTokens?: number;
  toolRescuer?: StreamToolCallRescuer;
}

export function createStreamState(
  messageId?: string,
  tools?: any[],
  safeguards?: any[]
): AnthropicStreamState {
  return {
    messageStartSent: false,
    messageId: messageId || `msg_${Date.now()}`,
    nextBlockIndex: 0,
    currentBlockType: null,
    currentBlockIndex: null,
    currentToolCallIndex: undefined,
    toolCalls: new Map(),
    toolSchemas: tools ? toolSchemaMap(tools) : undefined,
    safeguards,
  };
}

export function createAnthropicToOpenAiState(toolNames?: Set<string>): AnthropicToOpenAiStreamState {
  return {
    toolCallIndex: 0,
    blockIndexToToolCallIndex: new Map(),
    promptTokens: 0,
    cachedTokens: 0,
    cacheCreationTokens: 0,
    toolRescuer: toolNames ? createStreamToolCallRescuer(toolNames) : undefined,
  };
}
