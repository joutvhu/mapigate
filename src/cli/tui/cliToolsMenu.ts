import { ApiClient } from "../client/apiClient.js";
import { showMenuWithBack } from "../ui/menuHelper.js";
import { prompt, confirm, pause } from "../ui/input.js";
import { COLORS, showStatus, showBox } from "../ui/display.js";
import { copyToClipboard } from "../ui/clipboard.js";
import { CLI_TOOLS } from "../../shared/constants/cliTools.js";

export async function showCliToolsMenu(breadcrumb: string[] = ["Mapigate", "CLI Tools"]): Promise<void> {
  await showMenuWithBack({
    title: "AI Coding Tools Integration",
    breadcrumb,
    refresh: async () => {
      const res = await ApiClient.getCliToolsStatus();
      return res.success && res.data ? res.data : {};
    },
    headerContent: (statusMap: Record<string, any>) => {
      const toolKeys = Object.keys(CLI_TOOLS);
      const connectedCount = toolKeys.filter((k) => statusMap[k]?.hasMapigate || statusMap[k]?.configured).length;
      return `Total Tools: ${COLORS.cyan}${toolKeys.length}${COLORS.reset} | Connected to Mapigate: ${COLORS.green}${connectedCount}${COLORS.reset}`;
    },
    items: Object.keys(CLI_TOOLS).map((toolId) => {
      const toolDef = CLI_TOOLS[toolId];
      return {
        label: (statusMap: Record<string, any>) => {
          const st = statusMap[toolId];
          const isConn = st?.hasMapigate || st?.configured;
          const statusBadge = isConn ? `${COLORS.green}[Connected]${COLORS.reset}` : `${COLORS.dim}[${st?.status || "Not configured"}]${COLORS.reset}`;
          return `${toolDef.name} ${statusBadge}`;
        },
        action: async (statusMap: Record<string, any>) => {
          await showSingleToolDetails(toolId, statusMap[toolId], [...breadcrumb, toolDef.name]);
        },
      };
    }),
  });
}

async function showSingleToolDetails(toolId: string, status: any, breadcrumb: string[]): Promise<void> {
  const tool = CLI_TOOLS[toolId];
  if (!tool) return;

  const isConnected = status?.hasMapigate || status?.configured;

  await showMenuWithBack({
    title: `Tool: ${tool.name}`,
    breadcrumb,
    headerContent: [
      `Status:      ${isConnected ? `${COLORS.green}Connected to Mapigate${COLORS.reset}` : `${COLORS.yellow}${status?.status || "Not Configured"}${COLORS.reset}`}`,
      `Config Type: ${tool.configType}`,
      tool.configPath || tool.settingsFile ? `Config Path: ${tool.configPath || tool.settingsFile}` : "",
      tool.baseUrlPath !== undefined ? `Target Base: ${ApiClient.getBaseUrl()}${tool.baseUrlPath}` : "",
    ]
      .filter(Boolean)
      .join("\n"),
    items: [
      {
        label: "Quick Setup (Configure Tool for Mapigate)",
        action: async () => {
          console.log(`\nConfiguring ${tool.name} to route through Mapigate...`);
          let model: string | undefined;
          if (tool.id === "claude") {
            const chosen = await prompt("Custom Model (default: claude-sonnet-4-6): ");
            model = chosen || "claude-sonnet-4-6";
          }
          const res = await ApiClient.applyCliTool(toolId, model ? { model } : undefined);
          if (res.success) {
            showStatus(`${tool.name} successfully configured for Mapigate!`, "success");
          } else {
            showStatus(res.error || "Failed to configure tool.", "error");
          }
          await pause();
        },
      },
      {
        label: "Reset Tool Configuration (Remove Mapigate)",
        action: async () => {
          const confirmed = await confirm(`Remove Mapigate configuration for ${tool.name}?`);
          if (confirmed) {
            const res = await ApiClient.resetCliTool(toolId);
            if (res.success) {
              showStatus(`Reset configuration for ${tool.name}.`, "success");
            } else {
              showStatus(res.error || "Failed to reset tool.", "error");
            }
            await pause();
          }
        },
      },
      {
        label: "View Manual Setup Guide & Copy Env",
        action: async () => {
          console.log(`\n${COLORS.bold}Manual Setup Instructions for ${tool.name}:${COLORS.reset}`);
          const endpoint = ApiClient.getBaseUrl();

          if (tool.powershellTemplate) {
            console.log(`\n${COLORS.yellow}PowerShell (Windows):${COLORS.reset}`);
            console.log(tool.powershellTemplate.replace(/http:\/\/127\.0\.0\.1:2012[78]/g, endpoint));
          }

          if (tool.bashTemplate) {
            console.log(`\n${COLORS.yellow}Bash / Zsh (Linux & macOS):${COLORS.reset}`);
            console.log(tool.bashTemplate.replace(/http:\/\/127\.0\.0\.1:2012[78]/g, endpoint));
          }

          if (tool.guideSteps && tool.guideSteps.length > 0) {
            console.log(`\n${COLORS.bold}Guide Steps:${COLORS.reset}`);
            tool.guideSteps.forEach((s) => {
              console.log(`  ${s.step}. ${s.title}${s.desc ? ` - ${s.desc}` : ""}`);
              if (s.value) console.log(`     Value: ${COLORS.cyan}${s.value}${COLORS.reset}`);
            });
          }

          const copyCmd = process.platform === "win32" ? tool.powershellTemplate : tool.bashTemplate;
          if (copyCmd) {
            const shouldCopy = await confirm("Copy setup command to clipboard?", true);
            if (shouldCopy) {
              copyToClipboard(copyCmd.replace(/http:\/\/127\.0\.0\.1:2012[78]/g, endpoint));
              showStatus("Command copied to clipboard!", "success");
            }
          }
          await pause();
        },
      },
    ],
  });
}
