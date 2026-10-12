export type LogLevel = "debug" | "info" | "warn" | "error";

export type LogCategory =
  | "proxy"
  | "router"
  | "rtk"
  | "mitm"
  | "system"
  | "auth"
  | "scheduler";

export interface LogToolSnippet {
  name: string;
  type: "call" | "result";
  summary: string;
  isError?: boolean;
}

export interface GatewayLogMetadata {
  clientTool?: string;
  route?: string;
  requestedModel?: string;
  actualModel?: string;
  providerId?: string;
  accountId?: string;
  accountName?: string;
  statusCode?: number;
  durationMs?: number;
  ttftMs?: number;
  tokens?: {
    prompt: number;
    completion: number;
    cached?: number;
    cacheCreation?: number;
    reasoning?: number;
    savedByRtk?: number;
  };
  cost?: number;
  tools?: LogToolSnippet[];
  failover?: {
    fromAccount?: string;
    toAccount?: string;
    reason?: string;
  };
}

export interface StructuredLogEntry {
  id: string;
  timestamp: number;
  level: LogLevel;
  category: LogCategory;
  message: string;
  requestId?: string;
  reqTag?: string;
  gateway?: GatewayLogMetadata;
  error?: {
    code?: string;
    status?: number;
    message?: string;
    stack?: string;
  };
  rawText: string;
}
