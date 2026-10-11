import { ProviderRepository } from "../../storage/repositories/providerRepo.js";
import { refreshGoogleOAuthToken } from "../../server/routes/apiOAuth.js";
import {
  ensureFreshCopilotCredentials,
  isCopilotTokenExpiring,
  normalizeExpiryMs,
} from "../auth/copilotToken.js";
import { ensureFreshCredentials } from "../usage/tokenHelper.js";

/** Default periodic check interval: 5 minutes */
export const DEFAULT_SCHEDULER_INTERVAL_MS = 5 * 60 * 1000;

/** Default lead time before token expiry to trigger refresh (10 minutes) */
export const DEFAULT_EXPIRY_LEAD_MS = 10 * 60 * 1000;

export interface TokenSchedulerOptions {
  intervalMs?: number;
  leadMs?: number;
  runImmediately?: boolean;
}

export interface TokenSchedulerTickResult {
  total: number;
  refreshed: number;
  failed: number;
  skipped: number;
  durationMs: number;
}

export class TokenScheduler {
  private timer: NodeJS.Timeout | null = null;
  private isRunningState: boolean = false;
  private isTicking: boolean = false;
  private intervalMs: number = DEFAULT_SCHEDULER_INTERVAL_MS;
  private leadMs: number = DEFAULT_EXPIRY_LEAD_MS;
  private lastTickAt: number | null = null;
  private tickCount: number = 0;

  constructor(options: TokenSchedulerOptions = {}) {
    if (options.intervalMs && options.intervalMs > 0) {
      this.intervalMs = options.intervalMs;
    }
    if (options.leadMs && options.leadMs > 0) {
      this.leadMs = options.leadMs;
    }
  }

  /**
   * Starts the background token refresh scheduler.
   */
  public start(options: TokenSchedulerOptions = {}): void {
    if (this.isRunningState) {
      return;
    }

    if (options.intervalMs && options.intervalMs > 0) {
      this.intervalMs = options.intervalMs;
    }
    if (options.leadMs && options.leadMs > 0) {
      this.leadMs = options.leadMs;
    }

    this.isRunningState = true;

    // Optional immediate execution
    if (options.runImmediately) {
      this.runTick().catch((err) => {
        console.warn("[TokenScheduler] Immediate tick error:", err);
      });
    }

    this.timer = setInterval(() => {
      this.runTick().catch((err) => {
        console.warn("[TokenScheduler] Periodic tick error:", err);
      });
    }, this.intervalMs);

    // Don't keep the Node.js event loop active just for this timer
    if (typeof this.timer?.unref === "function") {
      this.timer.unref();
    }

    console.log(
      `⏰ [TokenScheduler] Started background token refresh worker (interval: ${Math.round(
        this.intervalMs / 1000
      )}s, lead: ${Math.round(this.leadMs / 1000)}s)`
    );
  }

  /**
   * Stops the background token refresh scheduler.
   */
  public stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    this.isRunningState = false;
    console.log("🛑 [TokenScheduler] Background token refresh worker stopped");
  }

  /**
   * Checks whether the scheduler is actively running.
   */
  public isRunning(): boolean {
    return this.isRunningState;
  }

  /**
   * Returns current status information about the scheduler.
   */
  public getStatus(): {
    isRunning: boolean;
    isTicking: boolean;
    intervalMs: number;
    leadMs: number;
    lastTickAt: number | null;
    tickCount: number;
  } {
    return {
      isRunning: this.isRunningState,
      isTicking: this.isTicking,
      intervalMs: this.intervalMs,
      leadMs: this.leadMs,
      lastTickAt: this.lastTickAt,
      tickCount: this.tickCount,
    };
  }

  /**
   * Runs a single scan and refresh tick across all active accounts.
   * Fail-open: errors on individual accounts will not halt processing.
   */
  public async runTick(deps?: {
    accounts?: any[];
    now?: number;
  }): Promise<TokenSchedulerTickResult> {
    if (this.isTicking) {
      return { total: 0, refreshed: 0, failed: 0, skipped: 0, durationMs: 0 };
    }

    this.isTicking = true;
    const startTime = Date.now();
    const now = deps?.now ?? startTime;
    let refreshed = 0;
    let failed = 0;
    let skipped = 0;

    try {
      const accounts =
        deps?.accounts ??
        ProviderRepository.getAllAccounts().filter((a) => a.isActive);

      for (const account of accounts) {
        try {
          const didRefresh = await this.refreshAccountIfExpiring(account, now);
          if (didRefresh) {
            refreshed++;
          } else {
            skipped++;
          }
        } catch (accountErr) {
          failed++;
          console.warn(
            `[TokenScheduler] Failed checking/refreshing account ${account.id} (${account.providerId}):`,
            accountErr
          );
        }
      }

      this.lastTickAt = Date.now();
      this.tickCount++;

      return {
        total: accounts.length,
        refreshed,
        failed,
        skipped,
        durationMs: Date.now() - startTime,
      };
    } finally {
      this.isTicking = false;
    }
  }

  /**
   * Evaluates an individual account and refreshes credentials ahead of expiration if needed.
   */
  private async refreshAccountIfExpiring(account: any, now: number): Promise<boolean> {
    const pId = (account.providerId || "").toLowerCase();
    const psd = account.providerSpecificData || {};

    // 1. GitHub Copilot
    if (pId === "github") {
      const expiresAt = psd.copilotTokenExpiresAt;
      const isExpiring = isCopilotTokenExpiring(expiresAt, this.leadMs);

      if (isExpiring) {
        const result = await ensureFreshCopilotCredentials(account, {
          force: true,
          bufferMs: this.leadMs,
        });
        if (result?.copilotToken) {
          console.log(
            `🔄 [TokenScheduler] Refreshed GitHub Copilot token for account ${account.id} (${account.name})`
          );
          return true;
        }
      }
      return false;
    }

    // 2. Google OAuth / Antigravity
    if (pId === "antigravity") {
      let refreshToken = psd.refreshToken;
      let expiresAt = psd.expiresAt;
      let oauthJson: any = null;

      if (account.rawApiKey && account.rawApiKey.trim().startsWith("{")) {
        try {
          oauthJson = JSON.parse(account.rawApiKey);
          if (!refreshToken && oauthJson.refreshToken) {
            refreshToken = oauthJson.refreshToken;
          }
          if (!expiresAt && oauthJson.expiresAt) {
            expiresAt = oauthJson.expiresAt;
          }
        } catch {}
      }

      const normalizedExp = normalizeExpiryMs(expiresAt);
      const isExpiring = !normalizedExp || normalizedExp <= now + this.leadMs;

      if (isExpiring && refreshToken) {
        const refreshed = await refreshGoogleOAuthToken(refreshToken);
        if (refreshed?.accessToken) {
          const newExpiresAt = now + (refreshed.expiresIn || 3600) * 1000;
          const updatedJson = oauthJson
            ? {
                ...oauthJson,
                accessToken: refreshed.accessToken,
                refreshToken: refreshed.refreshToken || refreshToken,
                expiresAt: newExpiresAt,
              }
            : {
                accessToken: refreshed.accessToken,
                refreshToken: refreshed.refreshToken || refreshToken,
                expiresAt: newExpiresAt,
              };

          ProviderRepository.updateAccount(account.id, {
            rawApiKey: JSON.stringify(updatedJson),
            providerSpecificData: {
              ...psd,
              refreshToken: refreshed.refreshToken || refreshToken,
              expiresAt: newExpiresAt,
            },
          });

          console.log(
            `🔄 [TokenScheduler] Refreshed Google OAuth token for account ${account.id} (${account.name})`
          );
          return true;
        }
      }
      return false;
    }

    // 3. Other OAuth providers (Gemini, Claude, Codex, Kiro) via ensureFreshCredentials
    if (["gemini-cli", "gemini", "claude", "codex", "kiro"].includes(pId)) {
      const refreshed = await ensureFreshCredentials(
        account.id,
        account.providerId,
        account.rawApiKey,
        account.providerSpecificData
      );
      return Boolean(refreshed && refreshed.accessToken);
    }

    return false;
  }
}

/** Global singleton instance */
export const tokenScheduler = new TokenScheduler();
