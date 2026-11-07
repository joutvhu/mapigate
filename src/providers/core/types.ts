import type { Request, Response } from "express";
import type { ProviderConfig, ProviderAccount, ComboConfig, LogToolSnippet, ScannedModel } from "../../shared/types/index.js";
import type { RawProviderQuotaResult, ProviderUsageContext } from "../../core/usage/types.js";
import type { ModelCapabilities } from "../../core/capabilities/types.js";

export interface RegistryModel {
  id: string;
  name: string;
  upstreamModelId?: string;
  isDefault?: boolean;
  capabilities?: Partial<ModelCapabilities> | string[];
  kind?: "llm" | "image" | "embedding" | "systemone" | "video" | string;
  contextLength?: number;
}

export type ProviderModelInput = string | (Partial<RegistryModel> & { id: string });

export interface ProviderRegion {
  id: string;
  label: string;
}

export interface ProviderNotice {
  apiKeyUrl?: string;
  signupUrl?: string;
  text?: string;
}

export interface ProviderOAuthConfig {
  clientId?: string;
  clientSecret?: string;
  authorizeUrl?: string;
  tokenUrl?: string;
  deviceCodeUrl?: string;
  scopes?: string[] | string;
  scope?: string;
  codeChallengeMethod?: "S256" | "plain" | string;
  platform?: string;
  pollInterval?: number;
  loginGuidanceUrl?: string;
  userInfoUrl?: string;
  firebaseApiKey?: string;
  firebaseSignInUrl?: string;
  registerUrl?: string;
  apiServerUrl?: string;
  auth1ApiServerUrl?: string;
  quotaUrl?: string;
  refresh?: Record<string, any>;
  refreshLeadMs?: number;
  [key: string]: any;
}

export interface ProviderRegistryItem {
  id: string;
  name: string;
  alias?: string;
  aliases?: string[];
  uiAlias?: string;
  color?: string;
  iconBg?: string;
  image?: string;
  website?: string;
  notice?: ProviderNotice;
  deprecated?: boolean;
  deprecationNotice?: string;
  category: "oauth" | "freeTier" | "apikey" | "free" | "webCookie" | "custom" | string;
  authType?: "api-key" | "none" | "oauth" | string;
  requiresApiKey?: boolean;
  isLocal?: boolean;
  defaultBaseUrl?: string;
  authModes?: string[];
  noAuth?: boolean;
  baseUrl: string;
  baseUrls?: string[];
  validateUrl?: string;
  modelsUrl?: string;
  format: "openai" | "claude" | "antigravity" | "kiro" | "vertex" | "grok-web" | "ollama" | string;
  defaultHeaders: Record<string, string>;
  thinkingMode?: string;
  thinkingOptions?: string[];
  regions?: ProviderRegion[];
  defaultRegion?: string;
  rescueInlineTools?: boolean;
  supportedFormats?: Array<{ value: string; label: string } | string>;
  credentialForm?: "aws" | string;
  apiKeyOptionalWith?: string;
  hasProviderSpecificData?: boolean;
  oauth?: ProviderOAuthConfig;
  models: RegistryModel[];
  passthroughModels?: boolean;
  quotaOrder?: string[];
}

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
  logged?: boolean;
}

export interface StreamExecutionResult {
  inputTokens: number;
  outputTokens: number;
  ttftMs: number;
  totalDurationMs: number;
  cachedTokens?: number;
  cacheCreationTokens?: number;
  reasoningTokens?: number;
  tools?: LogToolSnippet[];
}

export interface ProviderRequestContext {
  req: Request;
  res?: Response;
  targetModel: string;
  clientFormat: "openai" | "anthropic" | "responses";
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
  apiKeyId?: string;
  apiKeyName?: string;
  abortController?: AbortController;
}

export interface IProvider {
  readonly id: string;
  readonly name: string;
  readonly defaultFormat: string;
  readonly requiresAccount?: boolean;
  readonly requiresApiKey?: boolean;
  readonly isLocal?: boolean;
  readonly defaultBaseUrl?: string;
  readonly streamType?: "sse" | "eventstream" | "custom";

  buildUrl(context: ProviderRequestContext): string;
  buildHeaders(context: ProviderRequestContext): Promise<Record<string, string>> | Record<string, string>;
  transformRequestBody(context: ProviderRequestContext): any;

  execute?(
    context: ProviderRequestContext,
    dispatchSingleModel: SingleModelHandler
  ): Promise<ModelCallResult>;

  streamResponse?(
    upstreamRes: globalThis.Response,
    clientRes: Response,
    context: ProviderRequestContext
  ): Promise<StreamExecutionResult>;

  transformResponseChunk?(chunk: any, context: ProviderRequestContext): any;
  transformResponseBody?(body: any, context: ProviderRequestContext): any;

  handleAuthRefresh?(context: ProviderRequestContext, status: number): Promise<boolean>;
  isRateLimitOrQuotaError?(status: number, errorText?: string): boolean;

  supportsQuota(): boolean;
  fetchQuota?(context: ProviderUsageContext): Promise<RawProviderQuotaResult>;
  probeModels?(context: ProviderProbeContext): Promise<ProviderProbeResult | null>;
}

export interface ProviderProbeContext {
  account?: {
    id: string;
    name: string;
    rawApiKey?: string;
    apiKey?: string;
    region?: string;
    providerSpecificData?: Record<string, any>;
    [key: string]: any;
  };
  apiKey?: string;
  baseUrl?: string;
  customHeaders?: Record<string, string>;
  format?: string;
  timeoutMs?: number;
  region?: string;
  providerSpecificData?: Record<string, any>;
}

export interface ProviderProbeResult {
  success: boolean;
  endpointUrl?: string;
  models?: ScannedModel[];
  count?: number;
  error?: string;
  authError?: string;
}

export type ProviderMetadata = ProviderRegistryItem;

export type {
  ModelCapabilities,
};
