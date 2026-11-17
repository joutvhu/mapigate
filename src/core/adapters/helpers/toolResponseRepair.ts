/**
 * Repairs partial or missing tool responses in OpenAI-format message arrays.
 * When an assistant message has parallel tool_calls [A, B] and only A has a
 * corresponding `tool` message, inserts a placeholder `tool` message for B
 * immediately after the contiguous tool responses so upstream providers do not
 * reject the request with HTTP 400.
 */
export function repairPartialToolResponses(messages: any[]): any[] {
  if (!Array.isArray(messages) || messages.length === 0) return messages;

  const out: any[] = [];
  let i = 0;

  while (i < messages.length) {
    const msg = messages[i];
    out.push(msg);

    if (msg?.role === "assistant" && Array.isArray(msg.tool_calls) && msg.tool_calls.length > 0) {
      const tcIds: string[] = msg.tool_calls
        .map((tc: any) => tc?.id)
        .filter((id: any): id is string => typeof id === "string" && id.length > 0);

      if (tcIds.length > 0) {
        const seenIds = new Set<string>();
        let j = i + 1;
        while (j < messages.length && messages[j]?.role === "tool") {
          const toolMsg = messages[j];
          out.push(toolMsg);
          if (typeof toolMsg.tool_call_id === "string" && toolMsg.tool_call_id.length > 0) {
            seenIds.add(toolMsg.tool_call_id);
          }
          j++;
        }

        const isPartialBatch = seenIds.size > 0 && seenIds.size < tcIds.length;

        if (isPartialBatch) {
          for (const id of tcIds) {
            if (!seenIds.has(id)) {
              out.push({
                role: "tool",
                tool_call_id: id,
                content: "[No tool output]",
              });
            }
          }
        }

        i = j;
        continue;
      }
    }

    i++;
  }

  return out;
}
