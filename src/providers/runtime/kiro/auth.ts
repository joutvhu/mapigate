import { ProviderRepository } from "../../../storage/repositories/providerRepo.js";
import { logger, LogSymbol } from "../../../shared/logger.js";

export async function refreshKiroToken(account: any): Promise<string | null> {
  if (!account) return null;

  const psd = (account.providerSpecificData || {}) as Record<string, any>;
  const authMethod = psd.authMethod || "builder-id";
  const region = (psd.region || "us-east-1").trim();
  const refreshToken = psd.refreshToken;

  if (!refreshToken) return null;

  let newAccessToken: string | null = null;
  let newRefreshToken: string | null = null;
  let expiresInSec = 3600;

  try {
    if (authMethod === "external_idp" && psd.tokenEndpoint) {
      const tokenEndpoint = psd.tokenEndpoint;
      const scope = psd.scope || "https://service.codewhisperer.amazonaws.com/.default offline_access";

      const res = await fetch(tokenEndpoint, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
        body: new URLSearchParams({
          grant_type: "refresh_token",
          client_id: psd.clientId || "",
          refresh_token: refreshToken,
          scope,
        }),
      });
      if (res.ok) {
        const data: any = await res.json();
        newAccessToken = data.access_token || data.accessToken;
        newRefreshToken = data.refresh_token;
        if (data.expires_in) expiresInSec = Number(data.expires_in);
      }
    } else if (psd.clientId && psd.clientSecret) {
      const isIDC = authMethod === "idc";
      const endpoint = isIDC && region
        ? `https://oidc.${region}.amazonaws.com/token`
        : "https://oidc.us-east-1.amazonaws.com/token";

      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({
          refreshToken,
          clientId: psd.clientId,
          clientSecret: psd.clientSecret,
          grantType: "refresh_token",
        }),
      });
      if (res.ok) {
        const data: any = await res.json();
        newAccessToken = data.accessToken || data.access_token;
        newRefreshToken = data.refreshToken;
        if (data.expiresIn) expiresInSec = Number(data.expiresIn);
      }
    } else {
      // Builder ID & Social Kiro accounts refresh via auth.desktop.kiro.dev
      const tokenUrl = "https://prod.us-east-1.auth.desktop.kiro.dev/refreshToken";
      const res = await fetch(tokenUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          "User-Agent": "kiro-cli/1.0.0",
        },
        body: JSON.stringify({ refreshToken }),
      });
      if (res.ok) {
        const data: any = await res.json();
        newAccessToken = data.accessToken || data.access_token;
        newRefreshToken = data.refreshToken;
        if (data.expiresIn) expiresInSec = Number(data.expiresIn);
      }
    }

    if (newAccessToken) {
      const now = Date.now();
      const expiresAt = now + expiresInSec * 1000;
      account.rawApiKey = newAccessToken;
      account.providerSpecificData = {
        ...psd,
        accessToken: newAccessToken,
        ...(newRefreshToken ? { refreshToken: newRefreshToken } : {}),
        expiresAt,
        tokenExpiresAt: expiresAt,
      };

      if (account.id) {
        ProviderRepository.updateAccount(account.id, {
          rawApiKey: newAccessToken,
          providerSpecificData: account.providerSpecificData,
        });
      }

      logger.line(
        "KIRO",
        LogSymbol.KEY,
        `Refreshed Kiro token for account '${account.name || account.id}' (expires in ${expiresInSec}s)`
      );
      return newAccessToken;
    }
  } catch (err: any) {
    logger.warn("KIRO", `Failed to refresh Kiro token: ${err.message}`);
  }

  return null;
}
