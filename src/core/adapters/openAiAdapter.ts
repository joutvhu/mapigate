/**
 * OpenAI Adapter
 * Normalizes OpenAI Chat Completions requests
 */
export class OpenAiAdapter {
  /**
   * Normalize an OpenAI request body
   */
  public static normalizeRequest(body: any, targetModel: string): any {
    return {
      ...body,
      model: targetModel,
      stream: body.stream !== undefined ? Boolean(body.stream) : true,
    };
  }

  /**
   * Format an OpenAI chunk to SSE string
   */
  public static toSseEvent(chunk: any): string {
    return `data: ${JSON.stringify(chunk)}\n\n`;
  }
}
