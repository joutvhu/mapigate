export interface OAuthAuthorizeParams {
  provider: string;
  redirectUri: string;
  appPort?: number | string;
  codeVerifier?: string;
  codeChallenge?: string;
  state?: string;
  [key: string]: any;
}

export interface OAuthAuthorizeResult {
  authUrl?: string | null;
  redirectUri?: string;
  state?: string;
  codeVerifier?: string;
  codeChallenge?: string;
  flowType?: "authorization_code" | "authorization_code_pkce" | "device_code" | string;
  error?: string;
  [key: string]: any;
}

export interface OAuthExchangeParams {
  provider: string;
  code: string;
  redirectUri: string;
  codeVerifier?: string;
  state?: string;
  appPort?: number | string;
  [key: string]: any;
}

export interface OAuthAccountResult {
  id: string;
  name: string;
  providerId?: string;
  [key: string]: any;
}

export interface OAuthExchangeResult {
  success: boolean;
  account?: OAuthAccountResult;
  error?: string;
  [key: string]: any;
}

export interface DeviceCodeParams {
  provider?: string;
  [key: string]: any;
}

export interface DeviceCodeResult {
  device_code: string;
  user_code?: string;
  verification_uri?: string;
  verification_uri_complete?: string;
  expires_in?: number;
  interval?: number;
  _zcodePollToken?: string;
  error?: string;
  [key: string]: any;
}

export interface DevicePollParams {
  deviceCode?: string;
  device_code?: string;
  extraData?: Record<string, any>;
  [key: string]: any;
}

export interface DevicePollResult {
  ok: boolean;
  success?: boolean;
  account?: OAuthAccountResult;
  error?: string;
  error_description?: string;
  [key: string]: any;
}

export interface IdeAutoImportResult {
  found: boolean;
  error?: string;
  accessToken?: string | null;
  refreshToken?: string | null;
  machineId?: string | null;
  clientId?: string | null;
  clientSecret?: string | null;
  region?: string;
  authMethod?: string;
  profileArn?: string | null;
  [key: string]: any;
}

export interface OAuthRefreshTokenParams {
  refreshToken: string;
  rawApiKey?: string;
  providerSpecificData?: Record<string, any>;
  providerId?: string;
  accountId?: string;
  forceRefresh?: boolean;
}

export interface OAuthRefreshTokenResult {
  accessToken: string;
  refreshToken?: string;
  expiresIn?: number;
  expiresAt?: number;
  providerSpecificData?: Record<string, any>;
  rawApiKey?: string;
  [key: string]: any;
}

export interface ProviderOAuthHandler {
  readonly id?: string;
  authorize?(params: OAuthAuthorizeParams): Promise<OAuthAuthorizeResult> | OAuthAuthorizeResult;
  deviceCode?(params?: DeviceCodeParams): Promise<DeviceCodeResult> | DeviceCodeResult;
  poll?(params: DevicePollParams): Promise<DevicePollResult> | DevicePollResult;
  exchange?(params: OAuthExchangeParams): Promise<OAuthExchangeResult> | OAuthExchangeResult;
  refreshToken?(params: OAuthRefreshTokenParams): Promise<OAuthRefreshTokenResult | null> | OAuthRefreshTokenResult | null;
  autoImport?(): Promise<IdeAutoImportResult> | IdeAutoImportResult;
  importAccount?(params: any): Promise<any> | any;
  [key: string]: any;
}
