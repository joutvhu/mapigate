/**
 * Extract bearer token or API key from an account object,
 * safely unpacking JSON tokens from OAuth flows.
 */
export function extractTokenFromAccount(account?: any): string {
  let token = (account?.rawApiKey || "").trim();
  const psd = (account?.providerSpecificData || {}) as Record<string, any>;

  if (token.startsWith("{") && token.endsWith("}")) {
    try {
      const parsed = JSON.parse(token);
      token = String(
        parsed.accessToken ||
        parsed.access_token ||
        parsed.token ||
        parsed.apiKey ||
        parsed.api_key ||
        parsed.key ||
        token
      ).trim();
    } catch {}
  }

  if (!token && psd.accessToken) {
    token = String(psd.accessToken).trim();
  }
  return token;
}

export function extractHeader(req: any, headerName: string): string | undefined {
  if (!req?.headers) return undefined;
  const val = req.headers[headerName.toLowerCase()];
  if (!val) return undefined;
  if (Array.isArray(val)) return val.join(",");
  return String(val);
}
