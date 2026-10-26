/**
 * Converts OpenAI image_url content items into Anthropic image content blocks.
 */
export function convertOpenAiContentToAnthropic(content: any): any {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return content;

  return content.map((item: any) => {
    if (item?.type === "image_url" && item.image_url?.url) {
      const url = String(item.image_url.url);
      const match = url.match(/^data:([a-zA-Z0-9]+\/[a-zA-Z0-9-.+]+);base64,(.+)$/s);
      if (match) {
        return {
          type: "image",
          source: {
            type: "base64",
            media_type: match[1],
            data: match[2].trim(),
          },
        };
      }
      return {
        type: "image",
        source: {
          type: "url",
          url,
        },
      };
    }
    return item;
  });
}

/**
 * Converts an Anthropic image source block into an OpenAI image_url object.
 */
export function convertAnthropicImageToOpenAi(source: any): { type: "image_url"; image_url: { url: string } } | null {
  if (!source || typeof source !== "object") return null;

  if (source.type === "base64" && source.data) {
    return {
      type: "image_url",
      image_url: {
        url: `data:${source.media_type || "image/png"};base64,${source.data}`,
      },
    };
  }

  if (source.type === "url" && source.url) {
    return {
      type: "image_url",
      image_url: { url: source.url },
    };
  }

  return null;
}
