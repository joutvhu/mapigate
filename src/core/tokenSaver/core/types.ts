export type TokenSaverMethodType = "compressor" | "prompt_injector" | "proxy_compressor";

export interface TokenSaverContext {
  clientFormat?: "openai" | "anthropic" | string;
  targetFormat?: "openai" | "claude" | "gemini" | "kiro" | string;
  model?: string;
  clientTool?: string;
  [key: string]: any;
}

export interface TokenSaverResult {
  methodId: string;
  applied: boolean;
  tokensSaved: number;
  originalTokens?: number;
  compressedTokens?: number;
  details?: any;
}

export interface TokenSaverConfig {
  enabled?: boolean;
  level?: string;
  [key: string]: any;
}

export interface ITokenSaverMethod {
  readonly id: string;
  readonly name: string;
  readonly type: TokenSaverMethodType;
  readonly description: string;
  process(body: any, config: TokenSaverConfig, context?: TokenSaverContext): TokenSaverResult;
}

export interface TokenSaverSettings {
  rtkEnabled: boolean;
  cavemanEnabled: boolean;
  cavemanLevel: string;
  ponytailEnabled: boolean;
  ponytailLevel: string;
  [key: string]: any;
}

export const DEFAULT_TOKEN_SAVER_SETTINGS: TokenSaverSettings = {
  rtkEnabled: true,
  cavemanEnabled: false,
  cavemanLevel: "lite",
  ponytailEnabled: false,
  ponytailLevel: "lite",
};

export interface TokenSaverCoordinatorSummary {
  tokensSaved: number;
  originalTokens: number;
  compressedTokens: number;
  results: TokenSaverResult[];
}
