import { codeWhispererToMessages, extractTools } from "../../mitm/handlers/kiro/converter.js";
import {
  createStreamToolCallRescuer,
  type StreamToolCallRescuer,
} from "./helpers/toolCallRescue.js";
import { repairPartialToolResponses } from "./helpers/toolResponseRepair.js";
import {
  createStreamToolCallTracker,
  normalizeStreamToolCallIndices,
  type StreamToolCallTracker,
} from "./helpers/streamToolCallTracker.js";

function splitToolOutput(output: any): { text: string; images: any[] } {
  if (typeof output === "string") {
    return { text: output, images: [] };
  }
  if (Array.isArray(output)) {
    const textParts: string[] = [];
    const images: any[] = [];
    for (const part of output) {
      if (!part) continue;
      if (typeof part === "string") {
        textParts.push(part);
      } else if (part.type === "input_image") {
        const url = part.image_url || part.file_id || "";
        if (url) {
          images.push({
            type: "image_url",
            image_url: { url, detail: part.detail || "auto" },
          });
        }
      } else if (part.type === "input_text" || part.type === "output_text" || part.type === "text") {
        if (part.text) textParts.push(part.text);
      } else {
        textParts.push(JSON.stringify(part));
      }
    }
    const text = textParts.filter(Boolean).join("\n") || (images.length > 0 ? "[Image returned]" : "");
    return { text, images };
  }
  return { text: JSON.stringify(output ?? ""), images: [] };
}

/**
 * Normalize Responses API input to array format.
 * Accepts string or array, returns array of message items.
 */
export function normalizeResponsesInput(input: any): any[] | null {
  if (typeof input === "string") {
    const text = input.trim() === "" ? "..." : input;
    return [{ type: "message", role: "user", content: [{ type: "input_text", text }] }];
  }
  if (Array.isArray(input)) {
    if (input.length === 0) {
      return [{ type: "message", role: "user", content: [{ type: "input_text", text: "..." }] }];
    }
    return input;
  }
  return null;
}

import {
  normalizeToolsToOpenAi,
  normalizeToolParameters,
} from "./helpers/toolSchemaNormalize.js";
export { normalizeToolsToOpenAi, normalizeToolParameters };

export function normalizeToolChoiceToOpenAi(toolChoice: any): any {
  if (!toolChoice) return undefined;
  if (typeof toolChoice === "string") return toolChoice;
  if (typeof toolChoice === "object") {
    if (!toolChoice.function && toolChoice.name) {
      return {
        type: "function",
        function: { name: toolChoice.name },
      };
    }
  }
  return toolChoice;
}

/**
 * Convert OpenAI Responses API format or Kiro conversationState format
 * to standard OpenAI Chat Completions format { messages: [...], tools: [...] }
 */
export function convertResponsesApiFormat(body: any): any {
  if (!body || typeof body !== "object") return body;

  // 1. Kiro wire format (conversationState)
  if (body.conversationState) {
    const messages = codeWhispererToMessages(body);
    const tools = extractTools(body);
    return {
      ...body,
      messages,
      stream: body.stream !== undefined ? Boolean(body.stream) : true,
      ...(tools.length > 0 && { tools, tool_choice: "auto" }),
    };
  }

  // 2. Already OpenAI messages
  if (body.messages && Array.isArray(body.messages)) {
    const result: any = { ...body, messages: repairPartialToolResponses(body.messages) };
    if (result.tools) {
      result.tools = normalizeToolsToOpenAi(result.tools);
      if (!result.tools) {
        delete result.tools;
        delete result.tool_choice;
      }
    }
    if (result.tool_choice) {
      result.tool_choice = normalizeToolChoiceToOpenAi(result.tool_choice);
    }
    return result;
  }

  // 3. OpenAI Responses API format ({ input: [...], instructions?: "..." })
  if (!body.input) return body;

  const result: any = { ...body };
  result.messages = [];

  // Convert instructions to system message
  if (body.instructions) {
    result.messages.push({ role: "system", content: body.instructions });
  }

  let currentAssistantMsg: any = null;
  let pendingToolResults: any[] = [];
  let pendingToolImages: any[] = [];

  const flushToolImages = () => {
    if (pendingToolImages.length > 0) {
      result.messages.push({ role: "user", content: pendingToolImages });
      pendingToolImages = [];
    }
  };

  const inputItems = normalizeResponsesInput(body.input);
  if (!inputItems) return body;

  for (const item of inputItems) {
    const itemType = item.type || (item.role ? "message" : null);

    if (itemType === "message") {
      if (currentAssistantMsg) {
        result.messages.push(currentAssistantMsg);
        currentAssistantMsg = null;
      }
      if (pendingToolResults.length > 0) {
        for (const tr of pendingToolResults) {
          result.messages.push(tr);
        }
        pendingToolResults = [];
      }
      flushToolImages();

      const content = Array.isArray(item.content)
        ? item.content.map((c: any) => {
            if (c.type === "input_text" || c.type === "output_text") {
              return { type: "text", text: c.text ?? "" };
            }
            if (c.type === "input_image") {
              const url = c.image_url || c.file_id || "";
              return { type: "image_url", image_url: { url, detail: c.detail || "auto" } };
            }
            return c;
          })
        : item.content;

      result.messages.push({ role: item.role, content });
    } else if (itemType === "function_call") {
      if (pendingToolResults.length > 0) {
        for (const tr of pendingToolResults) {
          result.messages.push(tr);
        }
        pendingToolResults = [];
      }
      flushToolImages();
      if (!currentAssistantMsg) {
        currentAssistantMsg = {
          role: "assistant",
          content: null,
          tool_calls: [],
        };
      }
      if (!item.name || typeof item.name !== "string" || item.name.trim() === "") continue;
      currentAssistantMsg.tool_calls.push({
        id: item.call_id || `call_${Date.now()}`,
        type: "function",
        function: {
          name: item.name,
          arguments: typeof item.arguments === "string" ? item.arguments : JSON.stringify(item.arguments ?? {}),
        },
      });
    } else if (itemType === "function_call_output") {
      if (currentAssistantMsg) {
        result.messages.push(currentAssistantMsg);
        currentAssistantMsg = null;
      }
      if (pendingToolResults.length > 0) {
        for (const tr of pendingToolResults) {
          result.messages.push(tr);
        }
        pendingToolResults = [];
      }
      const { text, images } = splitToolOutput(item.output);
      result.messages.push({
        role: "tool",
        tool_call_id: item.call_id,
        content: text,
      });
      if (images.length > 0) {
        pendingToolImages.push({
          type: "text",
          text: item.call_id ? `[Image from tool result ${item.call_id}]` : "[Image from tool result]",
        });
        pendingToolImages.push(...images);
      }
    } else if (itemType === "reasoning") {
      continue;
    }
  }

  if (currentAssistantMsg) {
    result.messages.push(currentAssistantMsg);
  }
  if (pendingToolResults.length > 0) {
    for (const tr of pendingToolResults) {
      result.messages.push(tr);
    }
  }
  flushToolImages();
  result.messages = repairPartialToolResponses(result.messages);

  if (result.tools) {
    result.tools = normalizeToolsToOpenAi(result.tools);
    if (!result.tools) {
      delete result.tools;
      delete result.tool_choice;
    }
  }
  if (result.tool_choice) {
    result.tool_choice = normalizeToolChoiceToOpenAi(result.tool_choice);
  }

  if (result.max_output_tokens !== undefined && result.max_tokens === undefined) {
    result.max_tokens = result.max_output_tokens;
  }
  delete result.max_output_tokens;

  if (
    body.reasoning &&
    typeof body.reasoning === "object" &&
    !Array.isArray(body.reasoning) &&
    typeof body.reasoning.effort === "string" &&
    body.reasoning.effort.trim() &&
    result.reasoning_effort === undefined
  ) {
    result.reasoning_effort = body.reasoning.effort.trim();
  }

  delete result.input;
  delete result.instructions;
  delete result.include;
  delete result.prompt_cache_key;
  delete result.store;
  delete result.reasoning;
  delete result.origin;
  delete result.profileArn;
  delete result.previous_response_id;
  delete result.text;
  delete result.truncation;
  delete result.background;
  delete result.max_tool_calls;
  delete result.prompt_cache_retention;
  delete result.safety_identifier;
  delete result.conversation;
  delete result.inferenceConfig;

  if (result.stream === undefined) {
    result.stream = true;
  }

  return result;
}

export interface ResponsesStreamEvent {
  event: string;
  data: any;
}

export interface ResponsesStreamState {
  seq: number;
  started: boolean;
  responseId: string;
  created: number;
  nextOutputIndex: number;
  msgItemAdded: Record<number, boolean>;
  msgContentAdded: Record<number, boolean>;
  msgTextBuf: Record<number, string>;
  msgItemDone: Record<number, boolean>;
  msgOutputIndex: Record<number, number>;
  reasoningId: string | null;
  reasoningIndex: number;
  reasoningPartAdded: boolean;
  reasoningBuf: string;
  reasoningDone: boolean;
  inThinking: boolean;
  funcNames: Record<number, string>;
  funcCallIds: Record<number, string>;
  funcItemAdded: Record<number, boolean>;
  funcArgsBuf: Record<number, string>;
  funcItemDone: Record<number, boolean>;
  funcArgsDone: Record<number, boolean>;
  funcOutputIndex: Record<number, number>;
  completedOutputItems: Map<number, any>;
  completedSent: boolean;
  responsesUsage: any | null;
  completionPending: boolean;
  toolRescuer?: StreamToolCallRescuer;
  toolTracker?: StreamToolCallTracker;
}

export function createResponsesStreamState(requestId?: string, toolNames?: Set<string>): ResponsesStreamState {
  return {
    seq: 0,
    started: false,
    responseId: requestId ? `resp_${requestId}` : `resp_${Date.now()}`,
    created: Math.floor(Date.now() / 1000),
    nextOutputIndex: 0,
    msgItemAdded: {},
    msgContentAdded: {},
    msgTextBuf: {},
    msgItemDone: {},
    msgOutputIndex: {},
    reasoningId: null,
    reasoningIndex: 0,
    reasoningPartAdded: false,
    reasoningBuf: "",
    reasoningDone: false,
    inThinking: false,
    funcNames: {},
    funcCallIds: {},
    funcItemAdded: {},
    funcArgsBuf: {},
    funcItemDone: {},
    funcArgsDone: {},
    funcOutputIndex: {},
    completedOutputItems: new Map(),
    completedSent: false,
    responsesUsage: null,
    completionPending: false,
    toolRescuer: toolNames ? createStreamToolCallRescuer(toolNames) : undefined,
    toolTracker: createStreamToolCallTracker(),
  };
}

function toResponsesUsage(usage: any) {
  if (!usage || typeof usage !== "object") return null;
  const inputTokens = [usage.input_tokens, usage.prompt_tokens].find(Number.isInteger);
  const outputTokens = [usage.output_tokens, usage.completion_tokens].find(Number.isInteger);
  if (inputTokens === undefined || outputTokens === undefined) return null;
  const res: any = {
    input_tokens: inputTokens,
    output_tokens: outputTokens,
    total_tokens: inputTokens + outputTokens,
  };
  const cached = [usage.input_tokens_details?.cached_tokens, usage.prompt_tokens_details?.cached_tokens].find(Number.isInteger);
  if (Number.isInteger(cached)) res.input_tokens_details = { cached_tokens: cached };
  const reasoning = [usage.output_tokens_details?.reasoning_tokens, usage.completion_tokens_details?.reasoning_tokens].find(Number.isInteger);
  if (Number.isInteger(reasoning)) res.output_tokens_details = { reasoning_tokens: reasoning };
  return res;
}

function recordCompletedOutputItem(state: ResponsesStreamState, outputIndex: number, item: any): void {
  state.completedOutputItems.set(outputIndex, item);
}

function collectCompletedOutputItems(state: ResponsesStreamState): any[] {
  if (state.completedOutputItems.size === 0) return [];
  return [...state.completedOutputItems.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([, item]) => item);
}

function emitTextContent(state: ResponsesStreamState, emit: (event: string, data: any) => void, idx: number, content: string): void {
  if (!state.msgItemAdded[idx]) {
    state.msgItemAdded[idx] = true;
    state.msgOutputIndex[idx] = state.nextOutputIndex++;
    const outIdx = state.msgOutputIndex[idx];
    const msgId = `msg_${state.responseId}_${outIdx}`;
    emit("response.output_item.added", {
      type: "response.output_item.added",
      output_index: outIdx,
      item: { id: msgId, type: "message", content: [], role: "assistant" },
    });
  }

  const outIdx = state.msgOutputIndex[idx] ?? idx;
  const msgId = `msg_${state.responseId}_${outIdx}`;

  if (!state.msgContentAdded[idx]) {
    state.msgContentAdded[idx] = true;
    emit("response.content_part.added", {
      type: "response.content_part.added",
      item_id: msgId,
      output_index: outIdx,
      content_index: 0,
      part: { type: "output_text", annotations: [], logprobs: [], text: "" },
    });
  }

  emit("response.output_text.delta", {
    type: "response.output_text.delta",
    item_id: msgId,
    output_index: outIdx,
    content_index: 0,
    delta: content,
    logprobs: [],
  });

  state.msgTextBuf[idx] = (state.msgTextBuf[idx] || "") + content;
}

function closeMessage(state: ResponsesStreamState, emit: (event: string, data: any) => void, idx: number): void {
  if (state.msgItemAdded[idx] && !state.msgItemDone[idx]) {
    state.msgItemDone[idx] = true;
    const outIdx = state.msgOutputIndex[idx] ?? idx;
    const fullText = state.msgTextBuf[idx] || "";
    const msgId = `msg_${state.responseId}_${outIdx}`;

    emit("response.output_text.done", {
      type: "response.output_text.done",
      item_id: msgId,
      output_index: outIdx,
      content_index: 0,
      text: fullText,
      logprobs: [],
    });

    emit("response.content_part.done", {
      type: "response.content_part.done",
      item_id: msgId,
      output_index: outIdx,
      content_index: 0,
      part: { type: "output_text", annotations: [], logprobs: [], text: fullText },
    });

    const item = {
      id: msgId,
      type: "message",
      content: [{ type: "output_text", annotations: [], logprobs: [], text: fullText }],
      role: "assistant",
    };

    emit("response.output_item.done", {
      type: "response.output_item.done",
      output_index: outIdx,
      item,
    });

    recordCompletedOutputItem(state, outIdx, item);
  }
}

function startReasoning(state: ResponsesStreamState, emit: (event: string, data: any) => void, _idx: number): void {
  if (!state.reasoningId) {
    const outIdx = state.nextOutputIndex++;
    state.reasoningId = `rs_${state.responseId}_${outIdx}`;
    state.reasoningIndex = outIdx;

    emit("response.output_item.added", {
      type: "response.output_item.added",
      output_index: outIdx,
      item: { id: state.reasoningId, type: "reasoning", summary: [] },
    });

    emit("response.reasoning_summary_part.added", {
      type: "response.reasoning_summary_part.added",
      item_id: state.reasoningId,
      output_index: outIdx,
      summary_index: 0,
      part: { type: "summary_text", text: "" },
    });
    state.reasoningPartAdded = true;
  }
}

function emitReasoningDelta(state: ResponsesStreamState, emit: (event: string, data: any) => void, text: string): void {
  if (!text) return;
  state.reasoningBuf += text;
  emit("response.reasoning_summary_text.delta", {
    type: "response.reasoning_summary_text.delta",
    item_id: state.reasoningId,
    output_index: state.reasoningIndex,
    summary_index: 0,
    delta: text,
  });
}

function closeReasoning(state: ResponsesStreamState, emit: (event: string, data: any) => void): void {
  if (state.reasoningId && !state.reasoningDone) {
    state.reasoningDone = true;

    emit("response.reasoning_summary_text.done", {
      type: "response.reasoning_summary_text.done",
      item_id: state.reasoningId,
      output_index: state.reasoningIndex,
      summary_index: 0,
      text: state.reasoningBuf,
    });

    emit("response.reasoning_summary_part.done", {
      type: "response.reasoning_summary_part.done",
      item_id: state.reasoningId,
      output_index: state.reasoningIndex,
      summary_index: 0,
      part: { type: "summary_text", text: state.reasoningBuf },
    });

    const item = {
      id: state.reasoningId,
      type: "reasoning",
      summary: [{ type: "summary_text", text: state.reasoningBuf }],
    };

    emit("response.output_item.done", {
      type: "response.output_item.done",
      output_index: state.reasoningIndex,
      item,
    });

    recordCompletedOutputItem(state, state.reasoningIndex, item);
  }
}

function emitToolCall(state: ResponsesStreamState, emit: (event: string, data: any) => void, tc: any): void {
  const tcIdx = tc.index ?? 0;
  const newCallId = tc.id;
  const funcName = tc.function?.name;

  if (funcName) state.funcNames[tcIdx] = funcName;
  if (newCallId) state.funcCallIds[tcIdx] = newCallId;
  else if (!state.funcCallIds[tcIdx] && funcName) {
    state.funcCallIds[tcIdx] = `call_${Date.now()}_${tcIdx}`;
  }

  const callId = state.funcCallIds[tcIdx];
  if (!state.funcItemAdded[tcIdx] && callId && state.funcNames[tcIdx]) {
    state.funcItemAdded[tcIdx] = true;
    state.funcOutputIndex[tcIdx] = state.nextOutputIndex++;
    const outIdx = state.funcOutputIndex[tcIdx];
    emit("response.output_item.added", {
      type: "response.output_item.added",
      output_index: outIdx,
      item: {
        id: `fc_${callId}`,
        type: "function_call",
        arguments: "",
        call_id: callId,
        name: state.funcNames[tcIdx] || "",
      },
    });
  }

  if (!state.funcArgsBuf[tcIdx]) state.funcArgsBuf[tcIdx] = "";

  if (tc.function?.arguments) {
    const refCallId = state.funcCallIds[tcIdx] || newCallId;
    if (state.funcItemAdded[tcIdx] && refCallId) {
      const outIdx = state.funcOutputIndex[tcIdx] ?? tcIdx;
      emit("response.function_call_arguments.delta", {
        type: "response.function_call_arguments.delta",
        item_id: `fc_${refCallId}`,
        output_index: outIdx,
        delta: tc.function.arguments,
      });
    }
    state.funcArgsBuf[tcIdx] += tc.function.arguments;
  }
}

function closeToolCall(state: ResponsesStreamState, emit: (event: string, data: any) => void, idx: number): void {
  const callId = state.funcCallIds[idx];
  if (callId && !state.funcItemDone[idx]) {
    const outIdx = state.funcOutputIndex[idx] ?? idx;
    const args = state.funcArgsBuf[idx] || "{}";
    emit("response.function_call_arguments.done", {
      type: "response.function_call_arguments.done",
      item_id: `fc_${callId}`,
      output_index: outIdx,
      arguments: args,
    });

    const item = {
      id: `fc_${callId}`,
      type: "function_call",
      arguments: args,
      call_id: callId,
      name: state.funcNames[idx] || "",
    };

    emit("response.output_item.done", {
      type: "response.output_item.done",
      output_index: outIdx,
      item,
    });

    recordCompletedOutputItem(state, outIdx, item);
    state.funcItemDone[idx] = true;
    state.funcArgsDone[idx] = true;
  }
}

function sendCompleted(state: ResponsesStreamState, emit: (event: string, data: any) => void): void {
  if (!state.completedSent) {
    state.completedSent = true;
    state.completionPending = false;
    const incompleteReason = (state as any)._incompleteReason;
    const terminalEvent = incompleteReason ? "response.incomplete" : "response.completed";
    emit(terminalEvent, {
      type: terminalEvent,
      response: {
        id: state.responseId,
        object: "response",
        created_at: state.created,
        status: incompleteReason ? "incomplete" : "completed",
        ...(incompleteReason ? { incomplete_details: { reason: incompleteReason } } : {}),
        background: false,
        error: null,
        output: collectCompletedOutputItems(state),
        ...(state.responsesUsage ? { usage: state.responsesUsage } : {}),
      },
    });
  }
}

function flushToolRescuer(state: ResponsesStreamState, emit: (eventType: string, data: any) => void) {
  const rescuer = state.toolRescuer;
  if (!rescuer) return;
  const { calls, cleanText } = rescuer.flush();
  if (calls.length > 0) {
    for (const c of calls) {
      const tcIdx = ((state as any)._rescuedToolIdx = ((state as any)._rescuedToolIdx || 0) + 1);
      const callId = `call_${Date.now()}_${tcIdx}`;
      emitToolCall(state, emit, {
        index: tcIdx,
        id: callId,
        function: {
          name: c.name,
          arguments: c.arguments,
        },
      });
    }
  }
  if (cleanText) {
    emitTextContent(state, emit, 0, cleanText);
  }
}

export function openAiChunkToResponsesEvents(chunk: any, state: ResponsesStreamState): ResponsesStreamEvent[] {
  if (!chunk) {
    return finalizeResponsesStream(state);
  }

  const responseUsage = toResponsesUsage(chunk.usage);
  if (responseUsage) state.responsesUsage = responseUsage;

  if (!chunk.choices?.length) {
    return state.completionPending && state.responsesUsage ? finalizeResponsesStream(state) : [];
  }

  const events: ResponsesStreamEvent[] = [];
  const nextSeq = () => ++state.seq;
  const emit = (eventType: string, data: any) => {
    data.sequence_number = nextSeq();
    events.push({ event: eventType, data });
  };

  const choice = chunk.choices[0];
  const idx = choice.index || 0;
  const delta = choice.delta || {};

  // Initial event emission
  if (!state.started) {
    state.started = true;
    if (chunk.id) state.responseId = `resp_${chunk.id}`;

    emit("response.created", {
      type: "response.created",
      response: {
        id: state.responseId,
        object: "response",
        created_at: state.created,
        status: "in_progress",
        background: false,
        error: null,
        output: [],
      },
    });

    emit("response.in_progress", {
      type: "response.in_progress",
      response: {
        id: state.responseId,
        object: "response",
        created_at: state.created,
        status: "in_progress",
      },
    });
  }

  // Handle reasoning
  const reasoningText = delta.reasoning_content || delta.reasoning || delta.reasoning_details;
  if (reasoningText && typeof reasoningText === "string") {
    startReasoning(state, emit, idx);
    emitReasoningDelta(state, emit, reasoningText);
  }

  // Handle content
  if (delta.content) {
    let content = delta.content;

    if (content.includes("<think>")) {
      state.inThinking = true;
      content = content.replace("<think>", "");
      startReasoning(state, emit, idx);
    }

    if (content.includes("</think>")) {
      const parts = content.split("</think>");
      const thinkPart = parts[0];
      const textPart = parts.slice(1).join("</think>");
      if (thinkPart) emitReasoningDelta(state, emit, thinkPart);
      closeReasoning(state, emit);
      state.inThinking = false;
      content = textPart;
    }

    if (state.inThinking && content) {
      emitReasoningDelta(state, emit, content);
      return events;
    }

    if (content) {
      if (state.toolRescuer) {
        const rescuer = state.toolRescuer;
        const { calls, cleanText } = rescuer.feed(content);
        if (calls.length > 0) {
          closeReasoning(state, emit);
          closeMessage(state, emit, idx);
          for (const c of calls) {
            const tcIdx = ((state as any)._rescuedToolIdx = ((state as any)._rescuedToolIdx || 0) + 1);
            const callId = `call_${Date.now()}_${tcIdx}`;
            emitToolCall(state, emit, {
              index: tcIdx,
              id: callId,
              function: {
                name: c.name,
                arguments: c.arguments,
              },
            });
          }
        }
        if (cleanText) {
          closeReasoning(state, emit);
          emitTextContent(state, emit, idx, cleanText);
        }
      } else {
        closeReasoning(state, emit);
        emitTextContent(state, emit, idx, content);
      }
    }
  }

  // Handle tool calls
  if (delta.tool_calls && delta.tool_calls.length) {
    closeReasoning(state, emit);
    closeMessage(state, emit, idx);
    if (!state.toolTracker) {
      state.toolTracker = createStreamToolCallTracker();
    }
    normalizeStreamToolCallIndices(delta.tool_calls, state.toolTracker);
    for (const tc of delta.tool_calls) {
      emitToolCall(state, emit, tc);
    }
  }

  // Handle finish reason
  if (choice.finish_reason) {
    const incReason = getResponsesIncompleteReason(choice.finish_reason);
    if (incReason) {
      (state as any)._incompleteReason = incReason;
    }
    flushToolRescuer(state, emit);
    for (const i of Object.keys(state.msgItemAdded).map(Number)) closeMessage(state, emit, i);
    closeReasoning(state, emit);
    for (const i of Object.keys(state.funcCallIds).map(Number)) closeToolCall(state, emit, i);

    if (!state.responsesUsage && chunk.usage === null) {
      state.completionPending = true;
    } else {
      sendCompleted(state, emit);
    }
  }

  return events;
}

export function finalizeResponsesStream(state: ResponsesStreamState): ResponsesStreamEvent[] {
  if (state.completedSent) return [];

  const events: ResponsesStreamEvent[] = [];
  const nextSeq = () => ++state.seq;
  const emit = (eventType: string, data: any) => {
    data.sequence_number = nextSeq();
    events.push({ event: eventType, data });
  };

  flushToolRescuer(state, emit);

  // Close any unclosed items
  for (const i of Object.keys(state.msgItemAdded).map(Number)) closeMessage(state, emit, i);
  closeReasoning(state, emit);
  for (const i of Object.keys(state.funcCallIds).map(Number)) closeToolCall(state, emit, i);

  sendCompleted(state, emit);
  return events;
}

/**
 * Returns incomplete_details.reason for an upstream finish reason, or undefined if completed.
 */
export function getResponsesIncompleteReason(finishReason?: string | null): "max_output_tokens" | "content_filter" | undefined {
  if (finishReason === "length") return "max_output_tokens";
  if (finishReason === "content_filter") return "content_filter";
  return undefined;
}

export function convertOpenAiResponseToResponsesApi(openAiResponse: any): any {
  if (!openAiResponse) return openAiResponse;
  const choice = openAiResponse.choices?.[0];
  const message = choice?.message || {};
  const output: any[] = [];
  const finishReason = choice?.finish_reason;
  const incompleteReason = getResponsesIncompleteReason(finishReason);

  if (message.reasoning_content) {
    output.push({
      id: `rs_${openAiResponse.id || Date.now()}`,
      type: "reasoning",
      summary: [],
      content: [{ type: "reasoning_text", text: message.reasoning_content }],
      status: "completed",
    });
  }

  if (message.content) {
    output.push({
      id: `msg_${openAiResponse.id || Date.now()}`,
      type: "message",
      status: incompleteReason ? "incomplete" : "completed",
      role: "assistant",
      content: [
        {
          type: "output_text",
          annotations: [],
          logprobs: [],
          text: message.content,
        },
      ],
    });
  }

  if (Array.isArray(message.tool_calls)) {
    for (let i = 0; i < message.tool_calls.length; i++) {
      const tc = message.tool_calls[i];
      const callId = tc.id || `call_${Date.now()}_${i}`;
      output.push({
        id: callId.startsWith("fc_") ? callId : `fc_${callId}`,
        type: "function_call",
        status: "completed",
        name: tc.function?.name || "",
        call_id: callId,
        arguments: tc.function?.arguments || "{}",
      });
    }
  }

  return {
    id: openAiResponse.id ? `resp_${openAiResponse.id}` : `resp_${Date.now()}`,
    object: "response",
    created_at: openAiResponse.created || Math.floor(Date.now() / 1000),
    status: incompleteReason ? "incomplete" : "completed",
    ...(incompleteReason ? { incomplete_details: { reason: incompleteReason } } : {}),
    background: false,
    error: null,
    output,
    ...(openAiResponse.usage ? { usage: toResponsesUsage(openAiResponse.usage) } : {}),
  };
}
