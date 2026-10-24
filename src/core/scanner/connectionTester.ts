import { ProviderRepository } from "../../storage/repositories/providerRepo.js";
import { getRegistryProvider } from "../../shared/constants/providerRegistry.js";
import { scanProviderModels } from "./modelScanner.js";

export interface TestConnectionOptions {
  providerId: string;
  accountId?: string;
  timeoutMs?: number;
}

export interface TestConnectionResult {
  success: boolean;
  message: string;
  latencyMs?: number;
  modelsCount?: number;
  error?: string;
  accountName?: string;
  providerName?: string;
}

/**
 * Tests an upstream AI provider or specific account connection using real network probing.
 * Never uses mocks or fake status codes.
 */
export async function testProviderConnection(options: TestConnectionOptions): Promise<TestConnectionResult> {
  const { providerId, accountId, timeoutMs = 6000 } = options;

  const provider =
    ProviderRepository.getProviderById(providerId) ||
    ProviderRepository.getProviderWithDefaults(providerId);

  if (!provider) {
    return {
      success: false,
      message: `Provider "${providerId}" not found.`,
      error: "Provider not found",
    };
  }

  const reg = getRegistryProvider(provider.id);
  const isZeroAuth =
    Boolean(reg?.noAuth) ||
    reg?.requiresApiKey === false ||
    reg?.authType === "none" ||
    Boolean(reg?.isLocal) ||
    provider.id === "opencode" ||
    provider.id === "oc" ||
    provider.id === "ollama-local" ||
    provider.id === "lm-studio" ||
    provider.id === "jan" ||
    provider.id === "local-device";

  let accounts = ProviderRepository.getAllAccountsByProvider(provider.id);
  if (accountId) {
    accounts = accounts.filter((a) => a.id === accountId);
    if (accounts.length === 0 && !isZeroAuth) {
      return {
        success: false,
        message: `Account with ID "${accountId}" not found for provider "${provider.name}".`,
        error: "Account not found",
        providerName: provider.name,
      };
    }
  }

  if (accounts.length === 0 && !isZeroAuth) {
    return {
      success: false,
      message: `No active accounts or API keys configured for "${provider.name}". Please add an account first.`,
      error: "No active accounts configured",
      providerName: provider.name,
    };
  }

  const targetAccount = accountId ? accounts[0] : undefined;
  const startTime = Date.now();

  try {
    const scanRes = await scanProviderModels({
      providerId: provider.id,
      accountId: targetAccount?.id,
      timeoutMs,
    });

    const latencyMs = Math.max(1, Date.now() - startTime);

    if (scanRes.success) {
      const count = scanRes.models.length;
      const primaryAcc = targetAccount || scanRes.scannedAccounts?.[0] || accounts[0];
      const accountLabel = primaryAcc?.name ? ` (${primaryAcc.name})` : "";
      return {
        success: true,
        message: count > 0
          ? `Connected to ${provider.name}${accountLabel} successfully (${count} models verified, ${latencyMs}ms)`
          : `Connected to ${provider.name}${accountLabel} successfully (${latencyMs}ms)`,
        latencyMs,
        modelsCount: count,
        accountName: primaryAcc?.name,
        providerName: provider.name,
      };
    }

    const failedMsg =
      scanRes.failedAccounts?.[0]?.error ||
      scanRes.error ||
      `Connection to ${provider.name} failed.`;

    return {
      success: false,
      message: failedMsg,
      latencyMs,
      error: failedMsg,
      accountName: targetAccount?.name,
      providerName: provider.name,
    };
  } catch (err: unknown) {
    const latencyMs = Math.max(1, Date.now() - startTime);
    const msg = err instanceof Error ? err.message : String(err);
    return {
      success: false,
      message: `Failed to connect to ${provider.name}: ${msg}`,
      latencyMs,
      error: msg,
      accountName: targetAccount?.name,
      providerName: provider.name,
    };
  }
}

/**
 * Tests multiple providers in parallel with bounded concurrency.
 */
export async function testMultipleConnections(
  providerIds: string[],
  timeoutMs: number = 6000,
  concurrency: number = 4
): Promise<Record<string, TestConnectionResult>> {
  const results: Record<string, TestConnectionResult> = {};
  const queue = [...providerIds];

  const workers = Array.from({ length: Math.min(concurrency, queue.length) }, async () => {
    while (queue.length > 0) {
      const id = queue.shift();
      if (!id) break;
      results[id] = await testProviderConnection({ providerId: id, timeoutMs });
    }
  });

  await Promise.all(workers);
  return results;
}
