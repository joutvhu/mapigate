import { buildEventStreamFrame, withInitialFrame, type KiroState } from "./state.js";

export function extractThinking(
  text: string,
  state: { inThink: boolean; thinkBuf: string }
): { thinking: string | null; text: string | null } {
  if (!text) return { thinking: null, text: null };

  let working = text;
  if (state.inThink && state.thinkBuf) {
    working = state.thinkBuf + working;
    state.thinkBuf = "";
    state.inThink = false;
  }

  const startRe = /<thinking>|<think>/i;
  const startMatch = working.match(startRe);
  if (!startMatch) {
    return { thinking: null, text: working };
  }

  const tag = startMatch[0].toLowerCase();
  const closeTag = tag === "<think>" ? "</think>" : "</thinking>";
  const startIdx = startMatch.index ?? 0;
  const endIdx = working.indexOf(closeTag, startIdx + tag.length);

  if (endIdx === -1) {
    state.inThink = true;
    state.thinkBuf = working.slice(startIdx);
    const before = working.slice(0, startIdx).trim();
    return { thinking: null, text: before || null };
  }

  const thinking = working.slice(startIdx + tag.length, endIdx);
  const before = working.slice(0, startIdx).trim();
  const after = working.slice(endIdx + closeTag.length).trim();
  const rest = [before, after].filter(Boolean).join("");

  const recurse = rest
    ? extractThinking(rest, { inThink: false, thinkBuf: "" })
    : { thinking: null, text: null };

  return {
    thinking: thinking || null,
    text: recurse.text || null,
  };
}

export function safeArgsString(value: any): string {
  if (typeof value === "string") return value;
  if (value == null) return "{}";
  try {
    return JSON.stringify(value);
  } catch {
    return "{}";
  }
}

const INLINE_IMAGE_MIME_BY_FORMAT = new Map([
  ["png", "image/png"],
  ["jpeg", "image/jpeg"],
  ["jpg", "image/jpeg"],
  ["gif", "image/gif"],
  ["webp", "image/webp"],
]);

export function extractToolResultContent(tr: any): string {
  if (!tr) return "";
  if (typeof tr.content === "string") return tr.content;
  if (Array.isArray(tr.content)) {
    return tr.content
      .map((c: any) => {
        if (typeof c === "string") return c;
        if (c?.text != null) return c.text;
        if (c?.data != null) return typeof c.data === "string" ? c.data : JSON.stringify(c.data);
        if (c?.output != null) return typeof c.output === "string" ? c.output : JSON.stringify(c.output);
        if (c?.json != null) return JSON.stringify(c.json);
        return "";
      })
      .join("\n");
  }
  if (typeof tr.content === "object" && tr.content !== null) {
    if (tr.content.text != null) return tr.content.text;
    if (tr.content.data != null) return typeof tr.content.data === "string" ? tr.content.data : JSON.stringify(tr.content.data);
    if (tr.content.output != null) return typeof tr.content.output === "string" ? tr.content.output : JSON.stringify(tr.content.output);
    try {
      return JSON.stringify(tr.content);
    } catch {
      return "";
    }
  }
  return "";
}

export function convertUserInputMessage(uim: any): any[] {
  const out: any[] = [];
  const toolResults = uim.userInputMessageContext?.toolResults || [];

  for (const tr of toolResults) {
    const text = extractToolResultContent(tr);
    out.push({
      role: "tool",
      tool_call_id: tr.toolUseId || "",
      content: text,
    });
  }

  const images = Array.isArray(uim.images) ? uim.images : [];
  const imageParts = images
    .filter(
      (image: any) =>
        image !== null &&
        typeof image === "object" &&
        !Array.isArray(image) &&
        image.source !== null &&
        typeof image.source === "object" &&
        !Array.isArray(image.source) &&
        INLINE_IMAGE_MIME_BY_FORMAT.has(image.format) &&
        typeof image.source.bytes === "string" &&
        image.source.bytes.length > 0
    )
    .map((image: any) => ({
      type: "image_url",
      image_url: {
        url: `data:${INLINE_IMAGE_MIME_BY_FORMAT.get(image.format)};base64,${image.source.bytes}`,
      },
    }));

  const text = (uim.content || "").trim();
  if (imageParts.length > 0) {
    const content: any[] = [];
    if (text) content.push({ type: "text", text });
    content.push(...imageParts);
    out.push({ role: "user", content });
  } else if (text || toolResults.length === 0) {
    out.push({ role: "user", content: text });
  }

  return out;
}

export function convertAssistantResponseMessage(arm: any): any {
  const toolUses = arm.toolUses || [];
  if (toolUses.length > 0) {
    return {
      role: "assistant",
      content: arm.content || null,
      tool_calls: toolUses.map((tu: any) => ({
        id: tu.toolUseId || `call_${Date.now()}`,
        type: "function",
        function: {
          name: tu.name || "",
          arguments: safeArgsString(tu.input),
        },
      })),
    };
  }
  return { role: "assistant", content: arm.content || "" };
}

export function codeWhispererToMessages(body: any): any[] {
  const cs = body.conversationState || {};
  const history = cs.history || [];
  const currentMsg = cs.currentMessage;
  const messages: any[] = [];

  for (const item of history) {
    if (item.userInputMessage) {
      messages.push(...convertUserInputMessage(item.userInputMessage));
    } else if (item.assistantResponseMessage) {
      messages.push(convertAssistantResponseMessage(item.assistantResponseMessage));
    }
  }

  if (currentMsg?.userInputMessage) {
    messages.push(...convertUserInputMessage(currentMsg.userInputMessage));
  }

  return messages;
}

export function extractTools(body: any): any[] {
  const cs = body.conversationState || {};
  const fromCurrent = cs.currentMessage?.userInputMessage?.userInputMessageContext?.tools || [];
  const fromHistory = cs.history?.find((h: any) => h.userInputMessage?.userInputMessageContext?.tools)
    ?.userInputMessage?.userInputMessageContext?.tools || [];
  const cwTools = fromCurrent.length > 0 ? fromCurrent : fromHistory;

  if (!cwTools.length) return [];

  return cwTools.map((item: any) => {
    const spec = item.toolSpecification || item;
    return {
      type: "function",
      function: {
        name: spec.name || "",
        description: spec.description || `Tool: ${spec.name || "unknown"}`,
        parameters: spec.inputSchema?.json || { type: "object", properties: {}, required: [] },
      },
    };
  });
}

export function emitFinish(state: KiroState): Buffer[] | null {
  const frames: Buffer[] = [];
  if (state.hasToolCalls) {
    // Tool-call response: emit stop:true for each tool
    for (const idx of Object.keys(state.toolCallInit).sort()) {
      const tc = state.toolCallInit[Number(idx)];
      frames.push(
        buildEventStreamFrame("toolUseEvent", {
          name: tc.name,
          stop: true,
          toolUseId: tc.id,
        })
      );
    }
  } else {
    // Text-only response: emit messageStopEvent
    frames.push(buildEventStreamFrame("messageStopEvent", {}));
  }
  state.finishSent = true;

  // Emit usage if available
  if (state.usage) {
    frames.push(
      buildEventStreamFrame("usageEvent", {
        inputTokens: state.usage.prompt_tokens || 0,
        outputTokens: state.usage.completion_tokens || 0,
      })
    );
  }

  state.toolCallInit = {};
  return frames.length > 0 ? frames : null;
}

export function convertOpenAIToKiro(chunk: any | null, state: KiroState): Buffer | Buffer[] | null {
  // Flush: ensure clean stream termination
  if (!chunk) {
    if (state.finishSent) return null;
    // Flush any remaining buffered thinking
    if (state.inThink && state.thinkBuf) {
      state.inThink = false;
      const thinking = state.thinkBuf;
      state.thinkBuf = "";
      return withInitialFrame(
        state,
        buildEventStreamFrame("reasoningContentEvent", {
          content: thinking,
          modelId: state.modelId || "kiro-unknown",
        })
      );
    }
    return withInitialFrame(state, buildEventStreamFrame("messageStopEvent", {}));
  }

  const frames: Buffer[] = [];
  const choice = chunk.choices?.[0];
  const delta = choice?.delta || {};

  // Capture modelId from first chunk (real API includes it in every content frame)
  if (!state.modelId && chunk.model) {
    state.modelId = chunk.model;
  }
  const modelId = state.modelId || "unknown";

  // Handle usage (may arrive standalone or with other chunks)
  if (chunk.usage) {
    state.usage = chunk.usage;
  }

  // Handle tool calls — stream incrementally, matching real API format
  if (delta.tool_calls) {
    state.hasToolCalls = true;
    for (const tc of delta.tool_calls) {
      const idx = tc.index ?? 0;
      if (tc.id && tc.function?.name && !state.toolCallInit[idx]) {
        state.toolCallInit[idx] = { id: tc.id, name: tc.function.name };
        frames.push(
          buildEventStreamFrame("toolUseEvent", {
            name: tc.function.name,
            toolUseId: tc.id,
          })
        );
      }

      if (tc.function?.arguments) {
        const init = state.toolCallInit[idx];
        frames.push(
          buildEventStreamFrame("toolUseEvent", {
            input: tc.function.arguments,
            name: init?.name || tc.function?.name || "",
            toolUseId: init?.id || tc.id || "",
          })
        );
      }
    }
  }

  // Handle explicit reasoning_content (type-specific thinking channel)
  const reasoning = delta.reasoning_content || delta.reasoningContent || delta.reasoning;
  if (reasoning) {
    frames.push(
      buildEventStreamFrame("reasoningContentEvent", {
        content: reasoning,
        modelId,
      })
    );
  }

  // Handle text content — extract thinking blocks, emit rest as assistantResponseEvent
  if (delta.content) {
    const { thinking, text } = extractThinking(delta.content, state);
    if (thinking) {
      frames.push(
        buildEventStreamFrame("reasoningContentEvent", {
          content: thinking,
          modelId,
        })
      );
    }
    if (text) {
      frames.push(
        buildEventStreamFrame("assistantResponseEvent", {
          content: text,
          modelId,
        })
      );
    }
  }

  // Handle finish_reason
  if (choice?.finish_reason) {
    const finishFrames = emitFinish(state);
    if (finishFrames) {
      frames.push(...finishFrames);
    }
  }

  if (frames.length === 0) {
    if (!state.initialSent) return withInitialFrame(state, null);
    return null;
  }
  return withInitialFrame(state, frames.length === 1 ? frames[0] : frames);
}
