import { ApiClient } from "../client/apiClient.js";
import { showMenuWithBack } from "../ui/menuHelper.js";
import { prompt, confirm, pause } from "../ui/input.js";
import { COLORS, showStatus, maskKey } from "../ui/display.js";
import { copyToClipboard } from "../ui/clipboard.js";

export async function showApiKeysMenu(breadcrumb: string[] = ["Mapigate", "API Keys"]): Promise<void> {
  await showMenuWithBack({
    title: "🔑 Gateway API Keys",
    breadcrumb,
    refresh: async () => {
      const res = await ApiClient.getApiKeys();
      return res.success && Array.isArray(res.data) ? res.data : [];
    },
    headerContent: (keys: any[]) => {
      const activeCount = keys.filter((k) => k.isActive).length;
      return `Total Keys: ${COLORS.cyan}${keys.length}${COLORS.reset} | Active: ${COLORS.green}${activeCount}${COLORS.reset}`;
    },
    items: [
      {
        label: "+ Generate New Gateway API Key",
        action: async () => {
          await promptCreateApiKey();
        },
      },
      {
        label: (keys: any[]) => `Manage Existing Keys (${keys.length})`,
        action: async (keys: any[]) => {
          await showManageKeysList(keys, [...breadcrumb, "Keys"]);
        },
      },
    ],
  });
}

async function promptCreateApiKey(): Promise<void> {
  console.log(`\n${COLORS.bold}Generate Gateway API Key:${COLORS.reset}`);
  const name = await prompt("Key Name (default: 'CLI Key'): ");
  const res = await ApiClient.createApiKey(name || "CLI Key");
  if (res.success && res.data) {
    showStatus("API Key generated successfully!", "success");
    console.log(`\nKey:  ${COLORS.cyan}${res.data.key}${COLORS.reset}`);
    console.log(`Name: ${res.data.name}`);
    const copied = copyToClipboard(res.data.key);
    if (copied) {
      showStatus("Copied key to clipboard!", "success");
    }
  } else {
    showStatus(res.error || "Failed to generate key.", "error");
  }
  await pause();
}

async function showManageKeysList(keys: any[], breadcrumb: string[]): Promise<void> {
  if (!keys.length) {
    showStatus("No API keys found. Generate a key first.", "warning");
    await pause();
    return;
  }

  await showMenuWithBack({
    title: "🔑 Select API Key",
    breadcrumb,
    items: keys.map((k) => ({
      label: `${k.name} [${maskKey(k.key)}] ${k.isActive ? `${COLORS.green}●${COLORS.reset}` : `${COLORS.dim}○${COLORS.reset}`}`,
      action: async () => {
        await showKeyDetails(k, [...breadcrumb, k.name]);
      },
    })),
  });
}

async function showKeyDetails(k: any, breadcrumb: string[]): Promise<void> {
  await showMenuWithBack({
    title: `Key: ${k.name}`,
    breadcrumb,
    headerContent: [
      `Token:  ${COLORS.cyan}${k.key}${COLORS.reset}`,
      `Status: ${k.isActive ? `${COLORS.green}Active${COLORS.reset}` : `${COLORS.red}Disabled${COLORS.reset}`}`,
      `Created: ${new Date(k.createdAt).toLocaleString()}`,
    ].join("\n"),
    items: [
      {
        label: "Copy Key to Clipboard",
        action: async () => {
          const copied = copyToClipboard(k.key);
          if (copied) {
            showStatus("Copied API key to clipboard!", "success");
          } else {
            showStatus("Could not access clipboard.", "warning");
          }
          await pause();
        },
      },
      {
        label: k.isActive ? "Disable Key" : "Enable Key",
        action: async () => {
          const res = await ApiClient.toggleApiKey(k.id);
          if (res.success) {
            showStatus(`Key ${k.isActive ? "disabled" : "enabled"}.`, "success");
          } else {
            showStatus(res.error || "Failed to toggle key.", "error");
          }
          await pause();
          return false;
        },
      },
      {
        label: `${COLORS.red}Delete Key${COLORS.reset}`,
        action: async () => {
          const confirmed = await confirm(`Are you sure you want to delete key "${k.name}"?`);
          if (confirmed) {
            const res = await ApiClient.deleteApiKey(k.id);
            if (res.success) {
              showStatus("API Key deleted.", "success");
            } else {
              showStatus(res.error || "Failed to delete key.", "error");
            }
            await pause();
            return false;
          }
        },
      },
    ],
  });
}
