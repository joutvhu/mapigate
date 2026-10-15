import { ApiClient } from "../client/apiClient.js";
import { showMenuWithBack } from "../ui/menuHelper.js";
import { prompt, confirm, pause, selectMenu } from "../ui/input.js";
import { COLORS, showStatus, showBox } from "../ui/display.js";
import { copyToClipboard } from "../ui/clipboard.js";
import { PROVIDER_REGISTRY, getRegistryProvider } from "../../shared/constants/providerRegistry.js";

export async function showProvidersMenu(breadcrumb: string[] = ["Mapigate", "Providers"]): Promise<void> {
  await showMenuWithBack({
    title: "Providers Management",
    breadcrumb,
    refresh: async () => {
      const res = await ApiClient.getProviders();
      return res.success && res.data ? res.data : [];
    },
    headerContent: (providers: any[]) => {
      const activeCount = providers.filter((p) => p.isActive).length;
      const totalAccounts = providers.reduce((acc, p) => acc + (p.accountsCount || 0), 0);
      return `Configured: ${COLORS.cyan}${providers.length}${COLORS.reset} | Active: ${COLORS.green}${activeCount}${COLORS.reset} | Accounts: ${COLORS.yellow}${totalAccounts}${COLORS.reset}`;
    },
    items: [
      {
        label: (providers: any[]) => `View Configured Providers (${providers.length})`,
        action: async (providers: any[]) => {
          await showConfiguredProvidersList(providers, [...breadcrumb, "Configured"]);
        },
      },
      {
        label: "Add Account from Provider Catalog",
        action: async () => {
          await showAddAccountCatalog([...breadcrumb, "Add Account"]);
        },
      },
    ],
  });
}

async function showConfiguredProvidersList(providers: any[], breadcrumb: string[]): Promise<void> {
  if (!providers.length) {
    showStatus("No providers configured yet. Add an account from the catalog.", "warning");
    await pause();
    return;
  }

  await showMenuWithBack({
    title: "Configured Providers",
    breadcrumb,
    items: providers.map((prov) => ({
      label: `${prov.name || prov.id} (${prov.accountsCount || 0} accounts) ${prov.isActive ? `${COLORS.green}●${COLORS.reset}` : `${COLORS.dim}○${COLORS.reset}`}`,
      action: async () => {
        await showProviderDetails(prov.id, [...breadcrumb, prov.name || prov.id]);
      },
    })),
  });
}

async function showProviderDetails(providerId: string, breadcrumb: string[]): Promise<void> {
  const fetchProvider = async () => {
    const res = await ApiClient.getProvider(providerId);
    return res.success ? res.data : null;
  };

  await showMenuWithBack({
    title: `Provider: ${providerId}`,
    breadcrumb,
    refresh: fetchProvider,
    headerContent: (p: any) => {
      if (!p) return "";
      return [
        `Base URL: ${COLORS.cyan}${p.baseUrl || "Default"}${COLORS.reset}`,
        `Accounts: ${p.accounts?.length || 0} | Format: ${p.format || "openai"}`,
      ].join("\n");
    },
    items: [
      {
        label: "Test Provider Connection",
        action: async () => {
          console.log(`\nTesting connection to ${providerId}...`);
          const testRes = await ApiClient.testProvider(providerId);
          if (testRes.success && testRes.data?.success) {
            showStatus(testRes.data.message || "Connection successful!", "success");
          } else {
            showStatus(testRes.data?.message || testRes.error || "Connection failed", "error");
          }
          await pause();
        },
      },
      {
        label: (p: any) => `Manage Accounts (${p?.accounts?.length || 0})`,
        action: async (p: any) => {
          await showManageAccounts(providerId, p?.accounts || [], [...breadcrumb, "Accounts"]);
        },
      },
      {
        label: "View Supported Models",
        action: async () => {
          await showSupportedModels(providerId, [...breadcrumb, "Models"]);
        },
      },
      {
        label: "Add New Account",
        action: async () => {
          await promptAddAccount(providerId);
        },
      },
    ],
  });
}

async function showManageAccounts(providerId: string, accounts: any[], breadcrumb: string[]): Promise<void> {
  if (!accounts.length) {
    showStatus("No accounts for this provider.", "warning");
    await pause();
    return;
  }

  await showMenuWithBack({
    title: `Accounts for ${providerId}`,
    breadcrumb,
    items: accounts.map((acc) => ({
      label: `${acc.name} ${acc.isActive ? `${COLORS.green}[ACTIVE]${COLORS.reset}` : `${COLORS.dim}[DISABLED]${COLORS.reset}`}`,
      action: async () => {
        await showAccountActions(providerId, acc, [...breadcrumb, acc.name]);
      },
    })),
  });
}

async function showAccountActions(providerId: string, acc: any, breadcrumb: string[]): Promise<void> {
  await showMenuWithBack({
    title: `Account: ${acc.name}`,
    breadcrumb,
    headerContent: [
      `Status: ${acc.isActive ? `${COLORS.green}Active${COLORS.reset}` : `${COLORS.red}Disabled${COLORS.reset}`}`,
      `Rate Limit Hits: ${acc.rateLimitHits || 0}`,
    ].join("\n"),
    items: [
      {
        label: acc.isActive ? "Disable Account" : "Enable Account",
        action: async () => {
          const res = await ApiClient.toggleAccount(providerId, acc.id, !acc.isActive);
          if (res.success) {
            showStatus(`Account ${acc.isActive ? "disabled" : "enabled"}.`, "success");
          } else {
            showStatus(res.error || "Failed to toggle account.", "error");
          }
          await pause();
          return false; // Exit back
        },
      },
      {
        label: `${COLORS.red}Delete Account${COLORS.reset}`,
        action: async () => {
          const confirmed = await confirm(`Are you sure you want to delete account "${acc.name}"?`);
          if (confirmed) {
            const res = await ApiClient.deleteAccount(providerId, acc.id);
            if (res.success) {
              showStatus("Account deleted.", "success");
            } else {
              showStatus(res.error || "Failed to delete account.", "error");
            }
            await pause();
            return false; // Exit back
          }
        },
      },
    ],
  });
}

async function showSupportedModels(providerId: string, breadcrumb: string[]): Promise<void> {
  const reg = getRegistryProvider(providerId);
  const models = reg?.models || [];

  if (!models.length) {
    showStatus(`No predefined models found for ${providerId}. Passthrough models are supported.`, "info");
    await pause();
    return;
  }

  await showMenuWithBack({
    title: `Models for ${providerId}`,
    breadcrumb,
    items: models.map((m) => ({
      label: `${m.id} ${COLORS.dim}(${m.name})${COLORS.reset}`,
      action: async () => {
        console.log(`\nModel ID: ${COLORS.cyan}${m.id}${COLORS.reset}`);
        console.log(`Name:     ${m.name}`);
        if (m.contextLength) {
          console.log(`Context:  ${m.contextLength.toLocaleString()} tokens`);
        }
        const copied = copyToClipboard(m.id);
        if (copied) {
          showStatus(`Copied "${m.id}" to clipboard!`, "success");
        }
        await pause();
      },
    })),
  });
}

async function showAddAccountCatalog(breadcrumb: string[]): Promise<void> {
  const sorted = Object.values(PROVIDER_REGISTRY).sort((a, b) => a.name.localeCompare(b.name));

  await showMenuWithBack({
    title: "Select Provider Catalog",
    breadcrumb,
    items: sorted.map((p) => ({
      label: `${p.name} ${COLORS.dim}(${p.id})${COLORS.reset}`,
      action: async () => {
        await promptAddAccount(p.id);
      },
    })),
  });
}

async function promptAddAccount(providerId: string): Promise<void> {
  const reg = getRegistryProvider(providerId);
  const isNoAuth =
    providerId === "opencode" ||
    providerId === "oc" ||
    Boolean(reg?.noAuth) ||
    reg?.requiresApiKey === false ||
    reg?.authType === "none";
  const isLocal =
    Boolean(reg?.isLocal) ||
    providerId === "ollama-local" ||
    providerId === "lm-studio" ||
    providerId === "jan" ||
    providerId === "local-device";
  const defaultAccountName = isNoAuth
    ? (providerId === "opencode" || providerId === "oc" ? "OpenCode Free" : `${reg?.name || providerId} Default`)
    : isLocal
    ? `${reg?.name || providerId} Local`
    : "Work";

  console.log(`\n${COLORS.bold}Add Account for ${reg?.name || providerId}:${COLORS.reset}`);
  if (isNoAuth || isLocal) {
    console.log(`${COLORS.dim}${reg?.name || providerId} does not require a paid API key.${COLORS.reset}`);
  }
  const name =
    (await prompt(`Account Name (default: ${defaultAccountName}): `)) ||
    (isNoAuth || isLocal ? defaultAccountName : "");
  if (!name && !isNoAuth && !isLocal) {
    showStatus("Account creation cancelled (empty name).", "warning");
    await pause();
    return;
  }

  let apiKey = "";
  if (!isNoAuth && !isLocal) {
    apiKey = await prompt("API Key: ");
    if (!apiKey) {
      showStatus("API Key is required.", "error");
      await pause();
      return;
    }
  } else {
    apiKey = (providerId === "opencode" || providerId === "oc") ? "public" : "";
  }

  console.log("Saving account...");
  const res = await ApiClient.addAccount(providerId, { name: name || defaultAccountName, apiKey });
  if (res.success) {
    showStatus(`Account "${name || defaultAccountName}" added successfully!`, "success");
  } else {
    showStatus(res.error || "Failed to add account.", "error");
  }
  await pause();
}
