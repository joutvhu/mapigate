import { BaseProvider } from "../../core/base/baseProvider.js";
import type { ProviderRequestContext } from "../../core/types.js";
import type { ProviderUsageContext, RawProviderQuotaResult } from "../../../core/usage/types.js";
import { getAntigravityUsage } from "./quota.js";
import { refreshGoogleOAuthToken } from "./oauth.js";
import { ProviderRepository } from "../../../storage/repositories/providerRepo.js";
import { logger, LogSymbol } from "../../../shared/logger.js";

export class AntigravityProvider extends BaseProvider {
  public readonly id = "antigravity";
  public readonly name = "Google Antigravity";
  public readonly defaultFormat = "openai";

  public override supportsQuota(): boolean {
    return true;
  }

  public async fetchQuota(context: ProviderUsageContext): Promise<RawProviderQuotaResult> {
    return await getAntigravityUsage(
      context.account.rawApiKey,
      context.account.providerSpecificData,
      { force: context.force }
    );
  }

  public async handleAuthRefresh(
    context: ProviderRequestContext,
    status: number
  ): Promise<boolean> {
    if (status !== 401 || !context.account) return false;

    const psd = context.account.providerSpecificData || {};
    let refreshToken = psd.refreshToken;
    let oauthJson: any = null;

    if (context.account.rawApiKey.startsWith("{") && context.account.rawApiKey.includes("accessToken")) {
      try {
        oauthJson = JSON.parse(context.account.rawApiKey);
        refreshToken = oauthJson.refreshToken || refreshToken;
      } catch {}
    }

    if (!refreshToken) return false;

    try {
      const refreshed = await refreshGoogleOAuthToken(refreshToken);
      if (refreshed?.accessToken) {
        logger.line(
          context.reqTag || "AUTH",
          LogSymbol.KEY,
          `Google OAuth token refreshed on 401 retry · ${this.id}/${context.targetModel}`
        );
        const now = Date.now();
        const updatedJson = {
          accessToken: refreshed.accessToken,
          refreshToken: refreshed.refreshToken || refreshToken,
          expiresAt: now + (refreshed.expiresIn || 3600) * 1000,
        };
        context.account.rawApiKey = refreshed.accessToken;
        ProviderRepository.updateAccount(context.account.id, {
          rawApiKey: JSON.stringify(updatedJson),
          providerSpecificData: {
            ...psd,
            refreshToken: updatedJson.refreshToken,
            expiresAt: updatedJson.expiresAt,
          },
        });
        return true;
      }
    } catch (err: any) {
      logger.warn(
        "ANTIGRAVITY",
        `Antigravity token refresh failed: ${err.message}`
      );
    }
    return false;
  }
}

export default AntigravityProvider;
