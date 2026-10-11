import { ApiClient } from "../client/apiClient.js";
import { showMenuWithBack } from "../ui/menuHelper.js";
import { COLORS } from "../ui/display.js";
import { showProvidersMenu } from "./providersMenu.js";
import { showApiKeysMenu } from "./apiKeysMenu.js";
import { showCombosMenu } from "./combosMenu.js";
import { showCliToolsMenu } from "./cliToolsMenu.js";
import { showSettingsMenu } from "./settingsMenu.js";
import { APP_NAME, APP_VERSION } from "../../shared/constants/index.js";

let cachedHeader = "";
let fetchingHeader = false;

function renderHeader(port: number, keys: any[], stats: any): string {
  const lines: string[] = [];
  lines.push(`Endpoint:     ${COLORS.cyan}http://localhost:${port}/v1${COLORS.reset}`);

  if (stats && stats.totalTokensSaved !== undefined) {
    const savedStr = `${stats.totalTokensSaved.toLocaleString()} tokens`;
    lines.push(`Tokens Saved: ${COLORS.green}${savedStr}${COLORS.reset} (~$${stats.estimatedCostSavedUsd || 0})`);
  } else {
    lines.push(`Tokens Saved: ${COLORS.green}0 tokens${COLORS.reset}`);
  }

  if (!keys || keys.length === 0) {
    lines.push(`Gateway Key:  ${COLORS.dim}No keys generated yet${COLORS.reset}`);
  } else {
    lines.push(`Gateway Key:  ${COLORS.cyan}${keys[0].key}${COLORS.reset}`);
    if (keys.length > 1) {
      lines.push(`              ${COLORS.dim}(+${keys.length - 1} more key${keys.length > 2 ? "s" : ""})${COLORS.reset}`);
    }
  }

  return lines.join("\n");
}

async function refreshHeaderBg(port: number): Promise<void> {
  if (fetchingHeader) return;
  fetchingHeader = true;
  try {
    const [keysResult, statsResult] = await Promise.all([
      ApiClient.getApiKeys(),
      ApiClient.getStats(),
    ]);

    const keys = keysResult.success && Array.isArray(keysResult.data) ? keysResult.data : [];
    const stats = statsResult.success ? statsResult.data : {};
    cachedHeader = renderHeader(port, keys, stats);
  } finally {
    fetchingHeader = false;
  }
}

function getHeader(port: number): string {
  refreshHeaderBg(port);
  return (
    cachedHeader ||
    `Endpoint:     http://localhost:${port}/v1\nTokens Saved: ${COLORS.dim}...${COLORS.reset}\nGateway Key:  ${COLORS.dim}...${COLORS.reset}`
  );
}

export async function startTerminalUI(port: number): Promise<void> {
  ApiClient.configure({ port });
  const basePath = [APP_NAME];

  await refreshHeaderBg(port);

  await showMenuWithBack({
    title: `📡 ${APP_NAME} Terminal UI (v${APP_VERSION})`,
    breadcrumb: basePath,
    headerContent: () => getHeader(port),
    items: [
      {
        label: "Providers",
        icon: "⚡",
        action: async () => {
          await showProvidersMenu([...basePath, "Providers"]);
        },
      },
      {
        label: "Gateway API Keys",
        icon: "🔑",
        action: async () => {
          await showApiKeysMenu([...basePath, "API Keys"]);
        },
      },
      {
        label: "Combos & Fallback Chains",
        icon: "🔀",
        action: async () => {
          await showCombosMenu([...basePath, "Combos"]);
        },
      },
      {
        label: "AI Coding Tools Integration",
        icon: "🛠️",
        action: async () => {
          await showCliToolsMenu([...basePath, "CLI Tools"]);
        },
      },
      {
        label: "Settings & System Diagnostics",
        icon: "⚙️",
        action: async () => {
          await showSettingsMenu([...basePath, "Settings"]);
        },
      },
    ],
    backLabel: "← Back to Interface Menu",
  });
}
