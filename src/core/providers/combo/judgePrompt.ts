const TOOL_CALL_PREFIX = "[Called tools: ";
const TOOL_RESULT_PREFIX = "[Tool result: ";

export function flattenToolHistory(messages: any[]): any[] {
  if (!Array.isArray(messages)) return [];

  return messages
    .filter((msg) => msg)
    .map((msg) => {
      if (msg.role === "tool" || msg.role === "function") {
        const text = typeof msg.content === "string" ? msg.content : JSON.stringify(msg.content ?? "");
        return { role: "assistant", content: `${TOOL_RESULT_PREFIX}${text}]` };
      }

      if (msg.role === "assistant" && Array.isArray(msg.tool_calls)) {
        const { tool_calls, ...rest } = msg;
        const names = tool_calls.map((c: any) => c?.function?.name || c?.name || "tool").join(", ");
        const base = typeof rest.content === "string" ? rest.content : "";
        return { ...rest, content: `${base}${base ? "\n" : ""}${TOOL_CALL_PREFIX}${names}]` };
      }

      if (Array.isArray(msg.content)) {
        const hasToolUse = msg.content.some((c: any) => c.type === "tool_use");
        const hasToolResult = msg.content.some((c: any) => c.type === "tool_result");

        if (hasToolUse || hasToolResult) {
          const textParts: string[] = [];
          const toolNames: string[] = [];
          const toolResults: string[] = [];

          for (const block of msg.content) {
            if (block.type === "text" && block.text) textParts.push(block.text);
            if (block.type === "tool_use") toolNames.push(block.name || "tool");
            if (block.type === "tool_result") {
              const resText = typeof block.content === "string" ? block.content : JSON.stringify(block.content ?? "");
              toolResults.push(resText);
            }
          }

          const { ...rest } = msg;
          let newContent = textParts.join("\n");
          if (toolNames.length > 0) {
            newContent = `${newContent}${newContent ? "\n" : ""}${TOOL_CALL_PREFIX}${toolNames.join(", ")}]`;
          }
          if (toolResults.length > 0) {
            newContent = `${newContent}${newContent ? "\n" : ""}${TOOL_RESULT_PREFIX}${toolResults.join("\n")}]`;
          }
          return { ...rest, content: newContent };
        }
      }

      return msg;
    });
}

export function buildJudgePrompt(answers: Array<{ model: string; text: string }>): string {
  const panel = answers
    .map((a, i) => `[Source ${i + 1}]\n${a.text}`)
    .join("\n\n");

  return [
    `You are the JUDGE in a model-fusion panel. ${answers.length} expert models independently answered the user's most recent request. Their responses are below, anonymized by source.`,
    "",
    "Do NOT mention that multiple models were used, and do NOT refer to the sources. Produce ONE authoritative final answer addressed directly to the user.",
    "",
    "First, internally analyze the panel along these dimensions: consensus (points most sources agree on — treat as higher-confidence), contradictions (where they disagree — resolve with your own judgment), partial coverage, unique insights only one source surfaced, and blind spots every source missed. Then write the best possible final answer grounded in that analysis — more complete and correct than any single response, with no filler.",
    "",
    "=== PANEL RESPONSES ===",
    panel,
    "=== END PANEL RESPONSES ===",
    "",
    "Now write the final answer to the user's original request.",
  ].join("\n");
}

export function extractPanelText(json: any): string {
  if (!json || typeof json !== "object") return "";

  const choice = json.choices?.[0];
  if (choice) {
    const msg = choice.message ?? choice.delta ?? {};
    if (typeof msg.content === "string" && msg.content.trim()) return msg.content;
    if (Array.isArray(msg.content)) {
      const t = msg.content
        .map((c: any) => (typeof c === "string" ? c : c?.text || ""))
        .join("");
      if (t.trim()) return t;
    }
    if (typeof choice.text === "string" && choice.text.trim()) return choice.text;
  }

  if (Array.isArray(json.content)) {
    const t = json.content
      .filter((b: any) => b && b.type === "text" && typeof b.text === "string")
      .map((b: any) => b.text)
      .join("");
    if (t.trim()) return t;
  } else if (typeof json.content === "string" && json.content.trim()) {
    return json.content;
  }

  const parts = json.candidates?.[0]?.content?.parts;
  if (Array.isArray(parts)) {
    const t = parts.map((p: any) => p?.text || "").join("");
    if (t.trim()) return t;
  }

  if (Array.isArray(json.output)) {
    const t = json.output
      .flatMap((o: any) => (Array.isArray(o.content) ? o.content.map((c: any) => c?.text || "") : []))
      .join("");
    if (t.trim()) return t;
  }

  return "";
}

export function appendUserTurn(body: any, text: string): any {
  const next = { ...body };
  if (Array.isArray(body.messages)) {
    next.messages = [...body.messages, { role: "user", content: text }];
  } else if (Array.isArray(body.input)) {
    next.input = [...body.input, { role: "user", content: text }];
  } else if (Array.isArray(body.contents)) {
    next.contents = [...body.contents, { role: "user", parts: [{ text }] }];
  } else {
    next.messages = [{ role: "user", content: text }];
  }
  return next;
}
