/**
 * Extracts plain text from OpenAI / Responses / Anthropic message content
 * (handles string or array of text / input_text / output_text blocks).
 */
export function extractPlainTextContent(content: unknown): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    const parts: string[] = [];
    for (const item of content) {
      if (typeof item === "string") {
        parts.push(item);
      } else if (item && typeof item === "object") {
        const block = item as Record<string, unknown>;
        if (
          (block.type === "text" ||
            block.type === "input_text" ||
            block.type === "output_text" ||
            block.type === undefined) &&
          typeof block.text === "string"
        ) {
          parts.push(block.text);
        }
      }
    }
    return parts.join("\n");
  }
  if (content != null && typeof content === "object" && typeof (content as any).text === "string") {
    return (content as any).text;
  }
  return "";
}
