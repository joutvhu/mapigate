export interface RegistryModel {
  id: string;
  name: string;
  upstreamModelId?: string;
  isDefault?: boolean;
  capabilities?: string[];
  kind?: "llm" | "image" | "embedding" | "systemone" | "video" | string;
  contextLength?: number;
}

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
  image?: string;
  website?: string;
  notice?: ProviderNotice;
  deprecated?: boolean;
  deprecationNotice?: string;
  category: "oauth" | "freeTier" | "apikey" | "free" | "webCookie" | "custom" | string;
  authType?: string;
  authModes?: string[];
  noAuth?: boolean;
  baseUrl: string;
  baseUrls?: string[];
  validateUrl?: string;
  format: "openai" | "claude" | "antigravity" | "kiro" | "vertex" | "grok-web" | "ollama" | string;
  defaultHeaders: Record<string, string>;
  thinkingMode?: string;
  thinkingOptions?: string[];
  regions?: ProviderRegion[];
  defaultRegion?: string;
  credentialForm?: "aws" | string;
  apiKeyOptionalWith?: string;
  hasProviderSpecificData?: boolean;
  oauth?: ProviderOAuthConfig;
  models: RegistryModel[];
  passthroughModels?: boolean;
}
