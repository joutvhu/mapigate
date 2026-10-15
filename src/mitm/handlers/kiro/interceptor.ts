import type { IncomingMessage, ServerResponse } from "node:http";
import { fetchRouter, pipeSSE, pipeTransformedEventStream } from "../base.js";
import { initKiroState, isBinaryEventStream } from "./state.js";
import {
  convertOpenAIToKiro,
  codeWhispererToMessages,
  extractTools,
} from "./converter.js";

export {
  convertOpenAIToKiro,
  extractThinking,
  safeArgsString,
  convertUserInputMessage,
  convertAssistantResponseMessage,
  codeWhispererToMessages,
  extractTools,
  emitFinish,
} from "./converter.js";

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

    if (isResponsesApi) {
      const body = JSON.parse(bodyBuffer.toString("utf-8"));
      if (mappedModel) {
        body.model = mappedModel;
      }
      const routerRes = await fetchRouter(body, "/v1/responses", req.headers);
      await pipeSSE(routerRes, res);
      return;
    }

    const body = JSON.parse(bodyBuffer.toString("utf-8"));
    const conversationId =
      body.conversationState?.conversationId ||
      body.conversationId ||
      "";
    const messages = codeWhispererToMessages(body);
    if (messages.length === 0) {
      throw new Error("codeWhispererToMessages produced 0 messages");
    }

    const tools = extractTools(body);
    const openaiBody = {
      model: mappedModel,
      messages,
      stream: true,
      ...(tools.length > 0 && { tools, tool_choice: "auto" }),
    };

    const routerRes = await fetchRouter(openaiBody, "/v1/chat/completions", req.headers);
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
