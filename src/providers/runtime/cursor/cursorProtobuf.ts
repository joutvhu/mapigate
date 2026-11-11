import crypto from "node:crypto";
import {
  WIRE_TYPE,
  concatBuffers,
  encodeField,
  decodeMessage,
  wrapConnectRPCFrame,
  agentString,
  agentMessage,
  agentBool,
  extractAgentString,
  encodeAgentValue,
  decodeAgentValue,
  type DecodedFields,
} from "./cursorWire.js";

export * from "./cursorWire.js";

// MCP Tool Definition & Args Constants
const MTD_NAME = 1;
const MTD_DESCRIPTION = 2;
const MTD_INPUT_SCHEMA = 3;
const MTD_PROVIDER = 4;
const MTD_TOOL_NAME = 5;

const MCP_TOOLS_TOOL = 1;

const MCP_ARGS_NAME = 1;
const MCP_ARGS_ENTRY = 2;
const MCP_ARGS_CALL_ID = 3;
const MCP_ARGS_TOOL_NAME = 5;

const PB_MAP_KEY = 1;
const PB_MAP_VALUE = 2;

export interface ToolDefinitionInput {
  name?: string;
  description?: string;
  parameters?: Record<string, unknown>;
  inputSchema?: Record<string, unknown>;
  input_schema?: Record<string, unknown>;
  function?: {
    name?: string;
    description?: string;
    parameters?: Record<string, unknown>;
  };
}

export function toolNameAndSchema(tool: ToolDefinitionInput): {
  name: string;
  description: string;
  schema: Record<string, unknown>;
} {
  const fn = tool?.function || tool || {};
  return {
    name: fn.name || tool?.name || "",
    description: fn.description || tool?.description || "",
    schema: fn.parameters || tool?.parameters || tool?.inputSchema || tool?.input_schema || {},
  };
}

export function encodeMcpToolDefinition(tool: ToolDefinitionInput): Uint8Array {
  const { name, description, schema } = toolNameAndSchema(tool);
  return concatBuffers(
    encodeField(MTD_NAME, WIRE_TYPE.LEN, name),
    encodeField(MTD_DESCRIPTION, WIRE_TYPE.LEN, description),
    encodeField(MTD_INPUT_SCHEMA, WIRE_TYPE.LEN, encodeAgentValue(schema)),
    encodeField(MTD_PROVIDER, WIRE_TYPE.LEN, "mapigate"),
    encodeField(MTD_TOOL_NAME, WIRE_TYPE.LEN, name)
  );
}

export function encodeMcpTools(tools: ToolDefinitionInput[] = []): Uint8Array {
  if (!tools?.length) return new Uint8Array();
  return concatBuffers(
    ...tools.map((tool) => encodeField(MCP_TOOLS_TOOL, WIRE_TYPE.LEN, encodeMcpToolDefinition(tool)))
  );
}

export function decodeMcpArgs(bytes: Uint8Array): {
  name: string;
  toolCallId: string;
  toolName: string;
  args: Record<string, unknown>;
} {
  const msg = decodeMessage(Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes));
  const args: Record<string, unknown> = {};
  for (const entry of msg.get(MCP_ARGS_ENTRY) || []) {
    const pair = decodeMessage(Buffer.from(entry.value));
    const key = Buffer.from(pair.get(PB_MAP_KEY)?.[0]?.value || []).toString("utf8");
    if (key) args[key] = decodeAgentValue(pair.get(PB_MAP_VALUE)?.[0]?.value);
  }
  const read = (field: number) => Buffer.from(msg.get(field)?.[0]?.value || []).toString("utf8");
  return {
    name: read(MCP_ARGS_NAME),
    toolCallId: read(MCP_ARGS_CALL_ID),
    toolName: read(MCP_ARGS_TOOL_NAME),
    args,
  };
}

export function textFromContent(content: unknown): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content
    .filter((part) => !part || part.type === "text" || typeof part === "string")
    .map((part) => (typeof part === "string" ? part : String(part?.text ?? "")))
    .join("\n");
}

export function isAgentCapableRequest(body: { messages?: any[] }): boolean {
  if (!Array.isArray(body?.messages) || body.messages.length === 0) return false;
  return body.messages.every((message) => {
    if (Array.isArray(message?.content)) {
      return message.content.every((part: any) => !part || part.type === "text" || typeof part === "string");
    }
    return message?.content == null || typeof message.content === "string";
  });
}

export function encodeHistoryMessage(message: any): Uint8Array | null {
  const content = textFromContent(message?.content);
  const extras: string[] = [];
  if (message?.role === "assistant" && Array.isArray(message.tool_calls) && message.tool_calls.length) {
    for (const tc of message.tool_calls) {
      extras.push(
        `[tool_call id=${tc.id || ""} name=${tc.function?.name || "tool"} args=${tc.function?.arguments || "{}"}]`
      );
    }
  }
  if (message?.role === "tool") {
    extras.push(`[tool_result id=${message.tool_call_id || ""}]`);
  }
  const textBody = [content, ...extras].filter(Boolean).join("\n");
  if (!textBody) return null;

  const text = agentString(1, textBody);
  if (message.role === "assistant") {
    return agentMessage(2, agentMessage(1, agentMessage(1, text)));
  }
  return agentMessage(1, agentMessage(1, agentMessage(1, text)));
}

export function buildAgentRunFrame(
  messages: any[],
  model: string,
  tools: ToolDefinitionInput[] = [],
  reasoningEffort: string | null = null
): Uint8Array {
  const system = messages
    .filter((message) => message?.role === "system")
    .map((message) => textFromContent(message.content))
    .filter(Boolean)
    .join("\n\n");
  const chatMessages = messages.filter((message) => message?.role !== "system");
  let currentIndex = -1;
  for (let i = chatMessages.length - 1; i >= 0; i--) {
    const role = chatMessages[i]?.role;
    if (role === "user" || role === "tool") { currentIndex = i; break; }
  }
  const current = currentIndex >= 0 ? chatMessages[currentIndex] : chatMessages[chatMessages.length - 1];
  const history = chatMessages
    .slice(0, currentIndex >= 0 ? currentIndex : -1)
    .map(encodeHistoryMessage)
    .filter((entry): entry is Uint8Array => entry !== null);
  const content = textFromContent(current?.content);
  const toolTag = current?.role === "tool" && current.tool_call_id ? `[tool_result id=${current.tool_call_id}]` : "";
  const rawUser = [content, toolTag].filter(Boolean).join("\n") || "Continue.";
  const userText = system ? `${system}\n\n${rawUser}` : rawUser;

  const userMessage = concatBuffers(
    agentString(1, userText),
    agentString(2, crypto.randomUUID()),
    agentMessage(3, new Uint8Array()),
    encodeField(4, WIRE_TYPE.VARINT, 1)
  );
  const conversationHistory = history.length ? concatBuffers(...history.map((entry) => agentMessage(1, entry))) : null;
  const userAction = concatBuffers(
    agentMessage(1, userMessage),
    ...(conversationHistory ? [agentMessage(7, conversationHistory)] : [])
  );
  const conversationAction = agentMessage(1, userAction);
  const effort = String(reasoningEffort || "").toLowerCase();
  const effortValue = effort === "ultra" ? "max" : effort === "minimal" ? "low" : effort;
  const parameter =
    effortValue && effortValue !== "none"
      ? agentMessage(
          3,
          concatBuffers(
            agentString(1, /gpt-/i.test(model) ? "reasoning" : "effort"),
            agentString(2, effortValue)
          )
        )
      : null;
  const requestedModel = concatBuffers(
    agentString(1, model),
    agentBool(7, true),
    ...(parameter ? [parameter] : [])
  );
  const modelDetails = concatBuffers(agentString(1, model), agentString(3, model), agentString(4, model));
  const mcpTools = encodeMcpTools(tools);
  const runRequest = concatBuffers(
    agentMessage(1, new Uint8Array()),
    agentMessage(2, conversationAction),
    agentMessage(3, modelDetails),
    ...(mcpTools.length ? [agentMessage(4, mcpTools)] : []),
    agentMessage(9, requestedModel)
  );

  return wrapConnectRPCFrame(agentMessage(1, runRequest));
}

export function tailOnlyCursorMessages(messages: any[]): any[] {
  if (!Array.isArray(messages) || messages.length === 0) return messages || [];
  const systemMessages = messages.filter(
    (message) => message?.role === "system" && !String(message?.content || "").includes("[mapigate]")
  );
  const chatMessages = messages.filter((message) => message?.role !== "system");
  let anchor = chatMessages.length - 1;
  for (let i = chatMessages.length - 1; i >= 0; i--) {
    if (chatMessages[i]?.role === "user" || chatMessages[i]?.role === "tool") {
      anchor = i;
      break;
    }
  }
  const tailStart = anchor > 0 && chatMessages[anchor - 1]?.role === "assistant" ? anchor - 1 : anchor;
  const tail = chatMessages.slice(Math.max(0, tailStart));
  const note = {
    role: "system",
    content: `[mapigate] Long session: ${messages.length} messages trimmed to latest turn. Answer the current request.`,
  };
  return [...systemMessages, note, ...tail];
}

export function execIds(execRequest: DecodedFields): { id: number; execId: string } {
  const id = Number(execRequest?.get(1)?.[0]?.value || 0);
  const execId = extractAgentString(execRequest, 15);
  return { id, execId };
}

export function wrapExecClientMessage(
  execMsgId: number,
  execId: string,
  resultField: number,
  resultPayload: Uint8Array
): Uint8Array {
  const parts: Uint8Array[] = [];
  if (execMsgId) parts.push(encodeField(1, WIRE_TYPE.VARINT, execMsgId));
  parts.push(agentString(15, execId || ""));
  parts.push(encodeField(resultField, WIRE_TYPE.LEN, resultPayload || new Uint8Array()));
  return wrapConnectRPCFrame(agentMessage(2, concatBuffers(...parts)));
}

export function createRequestContextResponse(execRequest: DecodedFields): Uint8Array {
  const { id, execId } = execIds(execRequest);
  const requestContextSuccess = agentMessage(1, new Uint8Array());
  const requestContextResult = agentMessage(1, requestContextSuccess);
  return wrapExecClientMessage(id, execId, 10, requestContextResult);
}

const EXEC_RESULT_FIELD: Record<number, number> = {
  2: 2, 3: 3, 4: 4, 5: 5, 7: 7, 8: 8, 9: 9, 16: 16, 20: 20, 23: 23,
};

export function rejectExecRequest(execRequest: DecodedFields): Uint8Array | null {
  const { id, execId } = execIds(execRequest);
  const variant = [...(execRequest?.keys() || [])].find((field) => field !== 1 && field !== 15);
  if (!variant) return null;
  const resultField = EXEC_RESULT_FIELD[variant];
  if (!resultField) return null;
  if (variant === 9) return wrapExecClientMessage(id, execId, 9, new Uint8Array());
  const rejected = agentMessage(
    2,
    agentString(2, "Tool not available in this environment. Use the MCP tools provided instead.")
  );
  return wrapExecClientMessage(id, execId, resultField, rejected);
}

export function encodeKvClientMessage(
  kvId: number,
  resultField: number,
  resultPayload: Uint8Array,
  metadata?: Uint8Array | null
): Uint8Array {
  const parts: Uint8Array[] = [];
  if (kvId) parts.push(encodeField(1, WIRE_TYPE.VARINT, kvId));
  parts.push(encodeField(resultField, WIRE_TYPE.LEN, resultPayload || new Uint8Array()));
  if (metadata && metadata.length) parts.push(encodeField(4, WIRE_TYPE.LEN, metadata));
  return wrapConnectRPCFrame(agentMessage(3, concatBuffers(...parts)));
}
