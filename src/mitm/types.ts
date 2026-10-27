import type { IncomingMessage, ServerResponse } from "node:http";

export interface MitmRequestContext {
  req: IncomingMessage;
  res: ServerResponse;
  bodyBuffer: Buffer;
  mappedModel?: string | null;
  passthrough: (req: IncomingMessage, res: ServerResponse, buffer: Buffer) => Promise<void>;
}

export interface IMitmHandler {
  readonly id: string;
  canHandle(hostname: string, url: string): boolean;
  handle(context: MitmRequestContext): Promise<void>;
}

export type MitmToolId = "antigravity" | "kiro" | "copilot" | "cursor" | string;

export interface MitmToolUiConfig {
  id: string;
  name: string;
  image: string;
  desc: string;
  iconBg?: string;
  defaultHost?: string;
}

export interface MitmHttpRequestLike {
  url?: string;
  headers?: Record<string, string | string[] | undefined>;
}

export interface MitmToolConfig {
  id: string;
  name: string;
  image: string;
  desc: string;
  iconBg?: string;
  hosts: string[];
  urlPatterns: string[];
  defaultHost?: string;
  hostRewrite?: Record<string, string>;
  modelSynonyms?: Record<string, string>;
  modelPatterns?: Array<{ match: RegExp; alias: string }>;
  modelNoMap?: RegExp[];
  matchesHost?: (hostname: string) => boolean;
  isChatRequest?: (req: MitmHttpRequestLike) => boolean;
  defaultModels?: string[];
  defaultMappings?: Array<{ sourceModel: string; targetModel?: string }>;
}
