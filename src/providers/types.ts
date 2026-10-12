import type { Request, Response } from "express";
import type { ProviderConfig, ProviderAccount, ComboConfig } from "../shared/types/index.js";
import type { RawProviderQuotaResult, ProviderUsageContext } from "../core/usage/types.js";
import type {
  ProviderRegistryItem,
  RegistryModel,
  ProviderRegion,
  ProviderNotice,
  ProviderOAuthConfig,
} from "../shared/constants/providerRegistry/types.js";
import type { ModelCapabilities } from "../core/capabilities/types.js";

export type SingleModelHandler = (
  modelBody: any,
  modelStr: string,
  isPanel?: boolean
) => Promise<ModelCallResult>;

export interface ModelCallResult {
  ok: boolean;
  status: number;
  text?: string;
  json?: any;
  data?: any;
  headers?: Record<string, string>;
  isStream?: boolean;
  stream?: any;
  error?: string;
  modelUsed?: string;
}

export interface StreamExecutionResult {
  inputTokens: number;
  outputTokens: number;
  ttftMs: number;
  totalDurationMs: number;
}

export interface ProviderRequestContext {
  req: Request;
  res?: Response;
  targetModel: string;
  clientFormat: "openai" | "anthropic";
  targetFormat: "openai" | "claude" | string;
  body: any;
  provider?: ProviderConfig;
  account?: ProviderAccount & { rawApiKey: string };
  combo?: ComboConfig;
  isPanel?: boolean;
  is1mContext?: boolean;
  reqTag?: string;
  requestId: string;
  startTime: number;
  clientTool: string;
  rawModel: string;
  rtkStats: { compressedTokens: number; tokensSaved: number };
}

export interface IProvider {
  readonly id: string;
  readonly name: string;
  readonly defaultFormat: string;

  /**
   * Whether this provider requires an account configured via LoadBalancer.
   * Defaults to true in BaseProvider. Set to false for providers that don't need accounts (e.g., Ollama, Bedrock, OpenCode).
   */
  readonly requiresAccount?: boolean;

  /**
   * Declarative streaming response protocol:
   * defaults to "sse" (standard OpenAI/Anthropic SSE). Bedrock uses "eventstream".
   */
  readonly streamType?: "sse" | "eventstream" | "custom";

  buildUrl(context: ProviderRequestContext): string;
  buildHeaders(context: ProviderRequestContext): Promise<Record<string, string>> | Record<string, string>;
  transformRequestBody(context: ProviderRequestContext): any;

  /**
   * Optional custom execution hook.
   * Standard providers leave execute undefined (BaseProvider does NOT implement execute).
   * Composite providers (ComboProvider) override execute to orchestrate sub-model execution.
   */
  execute?(
    context: ProviderRequestContext,
    dispatchSingleModel: SingleModelHandler
  ): Promise<ModelCallResult>;

  /** Optional custom stream handler for non-standard streaming protocols */
  streamResponse?(
    upstreamRes: globalThis.Response,
    clientRes: Response,
    context: ProviderRequestContext
  ): Promise<StreamExecutionResult>;

  /** Optional chunk post-processing hook for SSE streams (e.g. OpenCode tool name restoration) */
  transformResponseChunk?(chunk: any, context: ProviderRequestContext): any;

  /** Optional response body post-processing hook for non-streaming responses */
  transformResponseBody?(body: any, context: ProviderRequestContext): any;

  handleAuthRefresh?(context: ProviderRequestContext, status: number): Promise<boolean>;
  isRateLimitOrQuotaError?(status: number, errorText?: string): boolean;

  supportsQuota(): boolean;
  fetchQuota?(context: ProviderUsageContext): Promise<RawProviderQuotaResult>;
}

export type ProviderMetadata = ProviderRegistryItem;

export type {
  ProviderRegistryItem,
  RegistryModel,
  ModelCapabilities,
  ProviderRegion,
  ProviderNotice,
  ProviderOAuthConfig,
};
