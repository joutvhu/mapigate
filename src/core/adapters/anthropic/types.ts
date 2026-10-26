import type { JsonSchemaish } from "../helpers/toolArgsRepair.js";
import { toolSchemaMap } from "../helpers/toolArgsRepair.js";

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
}

export interface AnthropicToOpenAiStreamState {
  toolCallIndex: number;
  blockIndexToToolCallIndex: Map<number, number>;
  promptTokens?: number;
  cachedTokens?: number;
  cacheCreationTokens?: number;
}

export function createStreamState(messageId?: string, tools?: any[]): AnthropicStreamState {
  return {
    messageStartSent: false,
    messageId: messageId || `msg_${Date.now()}`,
    nextBlockIndex: 0,
    currentBlockType: null,
    currentBlockIndex: null,
    currentToolCallIndex: undefined,
    toolCalls: new Map(),
    toolSchemas: tools ? toolSchemaMap(tools) : undefined,
  };
}

export function createAnthropicToOpenAiState(): AnthropicToOpenAiStreamState {
  return {
    toolCallIndex: 0,
    blockIndexToToolCallIndex: new Map(),
    promptTokens: 0,
    cachedTokens: 0,
    cacheCreationTokens: 0,
  };
}
