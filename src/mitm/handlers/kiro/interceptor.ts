import type { IncomingMessage, ServerResponse } from "node:http";
import { fetchRouter, pipeSSE, pipeTransformedEventStream } from "../base.js";
import { initKiroState, isBinaryEventStream } from "./state.js";
import {
  convertOpenAIToKiro,
  codeWhispererToMessages,
  extractTools,
  extractToolResultContent,
  recoverUnchangedFileContent,
  recoverUnchangedToolResultsInMessages,
  recoverUnchangedToolResultString,
} from "./converter.js";
import { logger } from "../../../shared/logger.js";

export {
  convertOpenAIToKiro,
  extractThinking,
  safeArgsString,
  extractToolResultContent,
  recoverUnchangedFileContent,
  recoverUnchangedToolResultsInMessages,
  recoverUnchangedToolResultString,
  convertUserInputMessage,
  convertAssistantResponseMessage,
  codeWhispererToMessages,
  extractTools,
  emitFinish,
} from "./converter.js";

export function extractKiroConversationId(body: any): string {
  if (!body || typeof body !== "object") return "";
  const candidate =
    body.metadata?.["kiro:conversation_id"] ||
    body.metadata?.["kiro:root_conversation_id"] ||
    body.conversationState?.conversationId ||
    body.conversationId ||
    body.conversation_id ||
    "";
  return typeof candidate === "string" ? candidate.trim() : "";
}

export async function interceptKiro(
  req: IncomingMessage,
  res: ServerResponse,
  bodyBuffer: Buffer,
  mappedModel: string
): Promise<void> {
  try {
    if (isBinaryEventStream(bodyBuffer)) {
      throw new Error(`Binary EventStream format detected (${bodyBuffer.length}B)`);
    }

    const isResponsesApi =
      (req.url && req.url.includes("/responses")) ||
      String(req.headers?.["x-amz-target"] || "").includes("CreateResponse");

    const body = JSON.parse(bodyBuffer.toString("utf-8"));
    const conversationId = extractKiroConversationId(body);

    if (isResponsesApi) {
      if (mappedModel) {
        body.model = mappedModel;
      }
      if (Array.isArray(body.messages)) {
        recoverUnchangedToolResultsInMessages(body.messages);
      }
      const routerHeaders: Record<string, string> = {
        ...(req.headers as Record<string, string>),
        "x-client-tool": "kiro",
        ...(conversationId ? { "x-session-id": conversationId } : {}),
      };
      const routerRes = await fetchRouter(body, "/v1/responses", routerHeaders);
      await pipeSSE(routerRes, res);
      return;
    }

    const toolResults = body.conversationState?.currentMessage?.userInputMessage?.userInputMessageContext?.toolResults || [];
    if (toolResults.length > 0 && logger.isDebugEnabled()) {
      const summary = toolResults.map((tr: any) => {
        const content = extractToolResultContent(tr);
        return `${tr.toolUseId || "unknown"} (${content.length} chars${content.length === 0 ? ", EMPTY!" : ""})`;
      }).join(", ");
      logger.debug("MITM:KIRO", `[Kiro] Received ${toolResults.length} tool results: ${summary}`);
    }

    const messages = codeWhispererToMessages(body);
    if (messages.length === 0) {
      throw new Error("codeWhispererToMessages produced 0 messages");
    }

    const tools = extractTools(body);
    const openaiBody: any = {
      model: mappedModel,
      messages,
      stream: true,
      ...(tools.length > 0 && { tools, tool_choice: "auto" }),
      ...(conversationId ? { conversation_id: conversationId } : {}),
    };

    const routerHeaders: Record<string, string> = {
      ...(req.headers as Record<string, string>),
      "x-client-tool": "kiro",
      ...(conversationId ? { "x-session-id": conversationId } : {}),
    };
    const routerRes = await fetchRouter(openaiBody, "/v1/chat/completions", routerHeaders);
    const state = initKiroState(mappedModel, conversationId);

    await pipeTransformedEventStream(routerRes, res, convertOpenAIToKiro, state);
  } catch (error: any) {
    if (!res.headersSent) {
      res.writeHead(500, { "Content-Type": "application/json" });
    }
    res.end(
      JSON.stringify({
        error: {
          message: error.message,
          type: "mitm_error",
          handler: "kiro",
        },
      })
    );
  }
}
