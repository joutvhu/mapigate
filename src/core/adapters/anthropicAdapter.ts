/**
 * Anthropic Adapter (Facade)
 *
 * Lightweight orchestrator facade delegating to modular subsystems under ./anthropic/:
 * - requestAnthropicToOpenAi: Anthropic Messages -> OpenAI Chat payload
 * - requestOpenAiToAnthropic: OpenAI Chat -> Anthropic Messages payload
 * - streamOpenAiToAnthropic: OpenAI chunks -> Anthropic SSE events
 * - streamAnthropicToOpenAi: Anthropic SSE events -> OpenAI chunks
 * - responseConverters: non-streaming responses bidirectional translation
 * - imageUtils: multimodal image conversion
 */

import {
  anthropicChunkToOpenAiEvent as toOpenAiChunk,
  anthropicResponseToOpenAi as toOpenAiResponse,
  type AnthropicStreamState,
  type AnthropicToOpenAiStreamState,
  createAnthropicToOpenAiState,
  createStreamState,
  finalizeStream as finalizeAnthropicStream,
  openAiChunkToAnthropicEvent as toAnthropicChunk,
  openAiResponseToAnthropic as toAnthropicResponse,
  translateAnthropicToOpenAi,
  translateOpenAiToAnthropic,
} from './anthropic/index.js';

export * from './anthropic/index.js';

export class AnthropicAdapter {
  private static openAiStreamStates = new Map<string, AnthropicStreamState>();
  private static anthropicStreamStates = new Map<string, AnthropicToOpenAiStreamState>();

  /**
   * Create a state tracker for OpenAI -> Anthropic streaming
   */
  public static createStreamState(messageId?: string, tools?: any[]): AnthropicStreamState {
    return createStreamState(messageId, tools);
  }

  /**
   * Create a state tracker for Anthropic -> OpenAI streaming
   */
  public static createAnthropicToOpenAiState(toolNames?: Set<string>): AnthropicToOpenAiStreamState {
    return createAnthropicToOpenAiState(toolNames);
  }

  /**
   * Convert Anthropic /v1/messages payload to OpenAI /v1/chat/completions payload
   */
  public static anthropicToOpenAi(anthropicBody: any): any {
    return translateAnthropicToOpenAi(anthropicBody);
  }

  /**
   * Convert OpenAI /v1/chat/completions payload to Anthropic /v1/messages payload
   */
  public static openAiToAnthropic(
    openAiBody: any,
    modelOverride?: string,
    providerId?: string | null
  ): any {
    return translateOpenAiToAnthropic(openAiBody, modelOverride, providerId);
  }

  /**
   * Convert OpenAI response chunk to Anthropic SSE event format
   */
  public static openAiChunkToAnthropicEvent(
    chunk: any,
    messageId: string,
    state?: AnthropicStreamState
  ): string[] {
    return toAnthropicChunk(chunk, messageId, state, AnthropicAdapter.openAiStreamStates);
  }

  /**
   * Finalize an Anthropic stream if finish_reason was omitted or unclosed blocks remain
   */
  public static finalizeStream(state: AnthropicStreamState): string[] {
    return finalizeAnthropicStream(state, AnthropicAdapter.openAiStreamStates);
  }

  /**
   * Convert Anthropic SSE event to OpenAI SSE chunk format
   */
  public static anthropicChunkToOpenAiEvent(
    event: any,
    requestId: string,
    state?: AnthropicToOpenAiStreamState
  ): string[] {
    return toOpenAiChunk(event, requestId, state, AnthropicAdapter.anthropicStreamStates);
  }

  /**
   * Convert OpenAI non-streaming chat completion to Anthropic Message response
   */
  public static openAiResponseToAnthropic(openAiResponse: any, requestId?: string): any {
    return toAnthropicResponse(openAiResponse, requestId);
  }

  /**
   * Convert Anthropic non-streaming Message response to OpenAI chat completion response
   */
  public static anthropicResponseToOpenAi(anthropicResponse: any, targetModel?: string): any {
    return toOpenAiResponse(anthropicResponse, targetModel);
  }
}

export default AnthropicAdapter;
