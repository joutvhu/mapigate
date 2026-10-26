import crypto from "node:crypto";

const TOOL_NAME_PATTERN = /[^a-zA-Z0-9_-]/g;

function cleanSchemaValue(value: any): any {
  if (Array.isArray(value)) return value.map(cleanSchemaValue);
  if (!value || typeof value !== "object") return value;

  const cleaned: Record<string, any> = {};
  for (const [key, child] of Object.entries(value)) {
    if (key === "additionalProperties") continue;
    if (key === "required" && Array.isArray(child) && child.length === 0) continue;
    cleaned[key] = cleanSchemaValue(child);
  }
  return cleaned;
}

function normalizeRootSchema(schema: any): any {
  const cleaned = cleanSchemaValue(schema && typeof schema === "object" ? schema : {});
  cleaned.type = "object";
  if (!cleaned.properties || typeof cleaned.properties !== "object" || Array.isArray(cleaned.properties)) {
    cleaned.properties = {};
  }
  if (Array.isArray(cleaned.required)) {
    cleaned.required = cleaned.required.filter(
      (name: any) => typeof name === "string" && Object.prototype.hasOwnProperty.call(cleaned.properties, name)
    );
    if (cleaned.required.length === 0) delete cleaned.required;
  }
  return cleaned;
}

export function normalizeKiroToolSpecs(tools: any[]): any[] {
  if (!Array.isArray(tools) || tools.length === 0) return [];

  const specs: any[] = [];
  const usedNames = new Set<string>();

  for (let i = 0; i < tools.length; i++) {
    const t = tools[i];
    if (!t) continue;
    const fn = t.function || t;
    const rawName = fn.name || `tool_${i + 1}`;
    const name = rawName.replace(TOOL_NAME_PATTERN, "_").slice(0, 64);
    if (usedNames.has(name)) continue;
    usedNames.add(name);

    specs.push({
      toolSpecification: {
        name,
        description: (fn.description || `Tool: ${name}`).slice(0, 10000),
        inputSchema: {
          json: normalizeRootSchema(fn.parameters || fn.input_schema || {}),
        },
      },
    });
  }

  return specs;
}

export function buildKiroPayload(
  body: any,
  targetModel: string,
  account?: any,
  requestId?: string
): any {
  if (body?.conversationState?.currentMessage?.userInputMessage) {
    const cs = body.conversationState;
    if (!cs.currentMessage.userInputMessage.modelId) {
      cs.currentMessage.userInputMessage.modelId = targetModel;
    }
    if (!cs.chatTriggerType) {
      cs.chatTriggerType = "MANUAL";
    }
    return body;
  }

  const rawMessages: any[] = Array.isArray(body?.messages) ? body.messages : [];
  const tools = normalizeKiroToolSpecs(body?.tools || []);

  const conversationId =
    body?.conversation_id ||
    body?.conversationId ||
    body?.metadata?.["kiro:conversation_id"] ||
    requestId ||
    crypto.randomUUID();

  let systemPrompt = "";
  const normalizedTurns: Array<{ role: "user" | "assistant"; text: string; images?: any[]; toolResults?: any[]; toolUses?: any[] }> = [];

  for (const m of rawMessages) {
    if (!m) continue;
    const role = m.role || "user";

    if (role === "system") {
      const sys = typeof m.content === "string" ? m.content : JSON.stringify(m.content);
      if (sys.trim()) {
        systemPrompt = systemPrompt ? `${systemPrompt}\n\n${sys.trim()}` : sys.trim();
      }
      continue;
    }

    if (role === "tool") {
      const toolText = typeof m.content === "string" ? m.content : JSON.stringify(m.content || "");
      normalizedTurns.push({
        role: "user",
        text: "",
        toolResults: [
          {
            toolUseId: m.tool_call_id || "",
            status: m.is_error ? "error" : "success",
            content: [{ text: toolText }],
          },
        ],
      });
      continue;
    }

    if (role === "assistant") {
      let text = "";
      if (typeof m.content === "string") {
        text = m.content;
      } else if (Array.isArray(m.content)) {
        text = m.content
          .filter((c: any) => c.type === "text" || c.text)
          .map((c: any) => c.text || "")
          .join("\n");
      }

      let toolUses: any[] | undefined;
      if (Array.isArray(m.tool_calls) && m.tool_calls.length > 0) {
        toolUses = m.tool_calls.map((tc: any) => {
          let input = {};
          try {
            input = typeof tc.function?.arguments === "string" ? JSON.parse(tc.function.arguments) : tc.function?.arguments || {};
          } catch {
            input = {};
          }
          return {
            toolUseId: tc.id || crypto.randomUUID(),
            name: tc.function?.name || "",
            input,
          };
        });
      }

      normalizedTurns.push({
        role: "assistant",
        text,
        toolUses,
      });
      continue;
    }

    // User turn
    let userText = "";
    const images: any[] = [];

    if (typeof m.content === "string") {
      userText = m.content;
    } else if (Array.isArray(m.content)) {
      const textParts: string[] = [];
      for (const part of m.content) {
        if (!part) continue;
        if (part.type === "text" || part.text) {
          textParts.push(part.text || "");
        } else if (part.type === "image_url" && part.image_url?.url) {
          const url: string = part.image_url.url;
          if (url.startsWith("data:image/")) {
            const match = url.match(/^data:image\/([a-zA-Z0-9]+);base64,(.+)$/);
            if (match) {
              images.push({
                format: match[1].toLowerCase(),
                source: { bytes: match[2] },
              });
            }
          }
        }
      }
      userText = textParts.join("\n");
    }

    normalizedTurns.push({
      role: "user",
      text: userText,
      images: images.length > 0 ? images : undefined,
    });
  }

  // Inject system prompt into first user turn
  if (systemPrompt) {
    const firstUser = normalizedTurns.find((t) => t.role === "user");
    if (firstUser) {
      firstUser.text = `<instructions>\n${systemPrompt}\n</instructions>\n\n${firstUser.text}`.trim();
    } else {
      normalizedTurns.unshift({
        role: "user",
        text: `<instructions>\n${systemPrompt}\n</instructions>`,
      });
    }
  }

  // Merge consecutive same-role turns to enforce strict user ⇄ assistant alternation
  const alternating: typeof normalizedTurns = [];
  for (const turn of normalizedTurns) {
    const prev = alternating[alternating.length - 1];
    if (prev && prev.role === turn.role) {
      if (turn.text) {
        prev.text = prev.text ? `${prev.text}\n\n${turn.text}` : turn.text;
      }
      if (turn.toolResults) {
        prev.toolResults = [...(prev.toolResults || []), ...turn.toolResults];
      }
      if (turn.toolUses) {
        prev.toolUses = [...(prev.toolUses || []), ...turn.toolUses];
      }
      if (turn.images) {
        prev.images = [...(prev.images || []), ...turn.images];
      }
    } else {
      alternating.push({ ...turn });
    }
  }

  // Extract last user turn as currentMessage
  let currentTurnIndex = -1;
  for (let i = alternating.length - 1; i >= 0; i--) {
    if (alternating[i].role === "user") {
      currentTurnIndex = i;
      break;
    }
  }

  const currentTurn = currentTurnIndex >= 0 ? alternating.splice(currentTurnIndex, 1)[0] : { role: "user" as const, text: "continue" };

  // Build history array
  const history: any[] = [];
  for (const t of alternating) {
    if (t.role === "user") {
      const uMsg: any = {
        userInputMessage: {
          content: t.text || (t.toolResults?.length ? "Tool results provided." : "continue"),
          modelId: targetModel,
        },
      };
      if (t.images?.length) uMsg.userInputMessage.images = t.images;
      if (t.toolResults?.length) {
        uMsg.userInputMessage.userInputMessageContext = {
          toolResults: t.toolResults,
        };
      }
      history.push(uMsg);
    } else {
      const aMsg: any = {
        assistantResponseMessage: {
          content: t.text || (t.toolUses?.length ? "" : "..."),
        },
      };
      if (t.toolUses?.length) {
        aMsg.assistantResponseMessage.toolUses = t.toolUses;
      }
      history.push(aMsg);
    }
  }

  // Build currentMessage
  const currentContext: any = {};
  if (tools.length > 0) {
    currentContext.tools = tools;
  }
  if (currentTurn.toolResults && currentTurn.toolResults.length > 0) {
    currentContext.toolResults = currentTurn.toolResults;
  }

  const currentMessage: any = {
    userInputMessage: {
      content: currentTurn.text || (currentTurn.toolResults?.length ? "Tool results provided." : "continue"),
      modelId: targetModel,
      origin: "AI_EDITOR",
      ...(currentTurn.images?.length ? { images: currentTurn.images } : {}),
      ...(Object.keys(currentContext).length > 0 ? { userInputMessageContext: currentContext } : {}),
    },
  };

  const psd = (account?.providerSpecificData || {}) as Record<string, any>;
  const profileArn = (psd.profileArn || "").trim();

  const payload: any = {
    conversationState: {
      chatTriggerType: "MANUAL",
      conversationId,
      currentMessage,
      history,
    },
  };

  if (profileArn) {
    payload.profileArn = profileArn;
  }

  return payload;
}
