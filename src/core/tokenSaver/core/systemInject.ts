/**
 * Shared system-prompt injector: appends an instruction into the system message of
 * the request body, dispatching by wire format or shape.
 * Fail-open and fully idempotent across multiple passes.
 */

const SEP = "\n\n";

export function injectSystemPrompt(body: any, format?: string, prompt?: string): boolean {
  try {
    if (!body || !prompt || typeof body !== "object") return false;

    // 1. Kiro wire shape (conversationState)
    if (isKiroBody(body) || format === "kiro") {
      return injectKiroSystem(body, prompt);
    }

    // 2. Claude format (dedicated system field)
    if (format === "claude" || format === "anthropic" || "system" in body) {
      if (injectClaudeSystem(body, prompt)) return true;
    }

    // 3. Gemini format (system_instruction / systemInstruction)
    if (
      format === "gemini" ||
      format === "gemini_cli" ||
      format === "vertex" ||
      format === "antigravity" ||
      "system_instruction" in body ||
      "systemInstruction" in body
    ) {
      if (injectGeminiSystem(body, prompt)) return true;
    }

    // 4. OpenAI instructions string (Assistant/Realtime/Responses)
    if (typeof body.instructions === "string") {
      return injectInstructionsSystem(body, prompt);
    }

    // 5. OpenAI Chat messages[]
    if (Array.isArray(body.messages)) {
      return injectChatSystem(body, prompt);
    }

    // 6. OpenAI Responses input[]
    if (Array.isArray(body.input)) {
      return injectResponsesInputSystem(body, prompt);
    }

    return false;
  } catch {
    // Fail-open
    return false;
  }
}

function isKiroBody(body: any): boolean {
  if (!body || typeof body !== "object") return false;
  const cs = body.conversationState;
  if (!cs || typeof cs !== "object") return false;
  const historyTurn =
    Array.isArray(cs.history) &&
    cs.history.some((it: any) => it && (it.userInputMessage || it.assistantResponseMessage));
  return Boolean(historyTurn || (cs.currentMessage && cs.currentMessage.userInputMessage));
}

function hasPrompt(haystack: string, prompt: string): boolean {
  if (!haystack || typeof haystack !== "string") return false;
  if (haystack === prompt) return true;
  return haystack.split(SEP).includes(prompt);
}

function dedupStringAppend(curr: string, prompt: string): string {
  if (!curr) return prompt;
  if (hasPrompt(curr, prompt)) return curr;
  return `${curr}${SEP}${prompt}`;
}

function injectInstructionsSystem(body: any, prompt: string): boolean {
  try {
    const curr = body.instructions;
    if (typeof curr !== "string") return false;
    if (hasPrompt(curr, prompt)) return false;
    body.instructions = curr ? `${curr}${SEP}${prompt}` : prompt;
    return true;
  } catch {
    return false;
  }
}

function injectChatSystem(body: any, prompt: string): boolean {
  try {
    const arr = body.messages;
    if (!Array.isArray(arr)) return false;
    if (containsPromptInMessages(arr, prompt)) return false;

    const idx = arr.findIndex((m) => m && (m.role === "system" || m.role === "developer"));
    if (idx >= 0) {
      return appendToChatMessage(arr[idx], prompt);
    } else {
      arr.unshift({ role: "system", content: prompt });
      return true;
    }
  } catch {
    return false;
  }
}

function containsPromptInMessages(arr: any[], prompt: string): boolean {
  try {
    for (const m of arr) {
      if (!m || (m.role !== "system" && m.role !== "developer")) continue;
      const c = m.content;
      if (typeof c === "string" && hasPrompt(c, prompt)) return true;
      if (Array.isArray(c)) {
        for (const part of c) {
          if (part && typeof part.text === "string" && hasPrompt(part.text, prompt)) return true;
        }
      }
    }
  } catch {}
  return false;
}

function appendToChatMessage(msg: any, prompt: string): boolean {
  try {
    if (!msg || typeof msg !== "object") return false;
    const c = msg.content;
    if (typeof c === "string") {
      const next = dedupStringAppend(c, prompt);
      if (next === c) return false;
      msg.content = next;
      return true;
    }
    if (Array.isArray(c)) {
      if (c.some((b: any) => b && b.text === prompt)) return false;
      c.push({ type: "text", text: prompt });
      return true;
    }
    msg.content = prompt;
    return true;
  } catch {
    return false;
  }
}

function injectResponsesInputSystem(body: any, prompt: string): boolean {
  try {
    const arr = body.input;
    if (!Array.isArray(arr)) return false;
    if (containsPromptInResponsesInput(arr, prompt)) return false;

    const idx = arr.findIndex(
      (m: any) => m && m.type === "message" && (m.role === "system" || m.role === "developer")
    );
    if (idx >= 0) {
      return appendToResponsesMessage(arr[idx], prompt);
    } else {
      arr.unshift({
        type: "message",
        role: "system",
        content: [{ type: "input_text", text: prompt }],
      });
      return true;
    }
  } catch {
    return false;
  }
}

function containsPromptInResponsesInput(arr: any[], prompt: string): boolean {
  try {
    for (const item of arr) {
      if (!item || item.type !== "message") continue;
      if (item.role !== "system" && item.role !== "developer") continue;
      const c = item.content;
      if (typeof c === "string" && hasPrompt(c, prompt)) return true;
      if (Array.isArray(c)) {
        for (const part of c) {
          if (part && typeof part.text === "string" && hasPrompt(part.text, prompt)) return true;
        }
      }
    }
  } catch {}
  return false;
}

function appendToResponsesMessage(msg: any, prompt: string): boolean {
  try {
    if (!msg || typeof msg !== "object") return false;
    const c = msg.content;
    if (typeof c === "string") {
      const next = dedupStringAppend(c, prompt);
      if (next === c) return false;
      msg.content = next;
      return true;
    }
    if (Array.isArray(c)) {
      if (c.some((b: any) => b && b.text === prompt)) return false;
      c.push({ type: "input_text", text: prompt });
      return true;
    }
    msg.content = [{ type: "input_text", text: prompt }];
    return true;
  } catch {
    return false;
  }
}

function injectClaudeSystem(body: any, prompt: string): boolean {
  try {
    const sys = body.system;
    if (typeof sys === "string") {
      if (hasPrompt(sys, prompt)) return false;
      body.system = sys.length > 0 ? `${sys}${SEP}${prompt}` : prompt;
      return true;
    }
    if (Array.isArray(sys)) {
      if (sys.some((b: any) => b && b.text === prompt)) return false;
      const block = { type: "text", text: prompt };
      let lastCacheIdx = -1;
      for (let i = sys.length - 1; i >= 0; i--) {
        if (sys[i]?.cache_control) {
          lastCacheIdx = i;
          break;
        }
      }
      if (lastCacheIdx >= 0) sys.splice(lastCacheIdx, 0, block);
      else sys.push(block);
      return true;
    }
    body.system = prompt;
    return true;
  } catch {
    return false;
  }
}

function injectGeminiSystem(body: any, prompt: string): boolean {
  try {
    let target = body;
    if (body.request && typeof body.request === "object") target = body.request;
    const key = Object.prototype.hasOwnProperty.call(target, "system_instruction")
      ? "system_instruction"
      : "systemInstruction";
    const sys = target[key];
    if (sys && Array.isArray(sys.parts)) {
      if (sys.parts.some((p: any) => p && p.text === prompt)) return false;
      sys.parts.push({ text: prompt });
      return true;
    }
    target[key] = { parts: [{ text: prompt }] };
    return true;
  } catch {
    return false;
  }
}

function injectKiroSystem(body: any, prompt: string): boolean {
  try {
    const cs = body.conversationState;
    let targetMsg: any = null;
    const hist = Array.isArray(cs?.history) ? cs.history : null;
    if (hist) {
      for (const item of hist) {
        if (item && item.userInputMessage) {
          targetMsg = item.userInputMessage;
          break;
        }
      }
    }
    if (!targetMsg && cs?.currentMessage?.userInputMessage) {
      targetMsg = cs.currentMessage.userInputMessage;
    }
    if (!targetMsg) return false;

    const content = typeof targetMsg.content === "string" ? targetMsg.content : "";
    const next = dedupStringAppend(content, prompt);
    if (next === content) return false;
    targetMsg.content = next;
    return true;
  } catch {
    return false;
  }
}
