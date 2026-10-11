import { ApiClient } from "../client/apiClient.js";
import { showMenuWithBack } from "../ui/menuHelper.js";
import { pause } from "../ui/input.js";
import { COLORS, showStatus, showBox } from "../ui/display.js";
import { getDefaultDataDir, MAPIGATE_DB_FILE } from "../../shared/constants/index.js";
import nodeMachineId from "node-machine-id";
const { machineIdSync } = nodeMachineId;
import path from "node:path";
import fs from "node:fs";

export async function showSettingsMenu(breadcrumb: string[] = ["Mapigate", "Settings & Diagnostics"]): Promise<void> {
  await showMenuWithBack({
    title: "Settings & Diagnostics",
    breadcrumb,
    items: [
      {
        label: "Server Environment & Data Directory",
        action: async () => {
          await showServerEnvDetails();
        },
      },
      {
        label: "Token Saver (RTK) Metrics & Stats",
        action: async () => {
          await showStatsDetails();
        },
      },
      {
        label: "Run System Doctor Diagnostics",
        action: async () => {
          await runDoctorDiagnostics();
        },
      },
    ],
  });
}

async function showServerEnvDetails(): Promise<void> {
  const dataDir = getDefaultDataDir();
  const dbPath = path.join(dataDir, MAPIGATE_DB_FILE);
  let machineId = "unknown";
  try {
    machineId = machineIdSync();
  } catch {
    // ignore
  }

  const dbExists = fs.existsSync(dbPath);
  const dbSize = dbExists ? `${(fs.statSync(dbPath).size / 1024).toFixed(1)} KB` : "Not created yet";

  const content = [
    `Endpoint:    ${COLORS.cyan}${ApiClient.getBaseUrl()}${COLORS.reset}`,
    `Data Dir:    ${dataDir}`,
    `Database:    ${dbPath} (${dbSize})`,
    `WAL Mode:    Enabled`,
    `Machine ID:  ${machineId ? machineId.slice(0, 16) + "…" : "N/A"}`,
    `Platform:    ${process.platform} (${process.arch})`,
    `Node.js:     ${process.version}`,
  ].join("\n");

  console.log();
  showBox("System & Storage Environment", content);
  console.log();
  await pause();
}

async function showStatsDetails(): Promise<void> {
  const res = await ApiClient.getStats();
  if (!res.success || !res.data) {
    showStatus("Could not fetch stats from server.", "error");
    await pause();
    return;
  }

  const s = res.data;
  const content = [
    `Total Requests:      ${s.totalRequests ?? 0}`,
    `Successful Requests: ${COLORS.green}${s.successfulRequests ?? 0}${COLORS.reset}`,
    `Failed Requests:     ${s.failedRequests ? `${COLORS.red}${s.failedRequests}${COLORS.reset}` : "0"}`,
    `Tokens Consumed:     ${(s.totalTokensConsumed || 0).toLocaleString()} tokens`,
    `Tokens Saved (RTK):  ${COLORS.green}${(s.totalTokensSaved || 0).toLocaleString()} tokens${COLORS.reset}`,
    `Estimated Savings:   ${COLORS.green}$${(s.estimatedCostSavedUsd || 0).toFixed(4)}${COLORS.reset}`,
    `Average Latency:     ${s.averageLatencyMs ? `${Math.round(s.averageLatencyMs)}ms` : "N/A"}`,
  ].join("\n");

  console.log();
  showBox("RTK Token Optimizer Performance", content);
  console.log();
  await pause();
}

async function runDoctorDiagnostics(): Promise<void> {
  console.log(`\n${COLORS.bold}Running Mapigate Doctor Diagnostics...${COLORS.reset}\n`);

  // 1. Check Node.js version
  const nodeMajor = parseInt(process.versions.node.split(".")[0], 10);
  if (nodeMajor >= 18) {
    showStatus(`Node.js Runtime: ${process.version} (supported >= 18)`, "success");
  } else {
    showStatus(`Node.js Runtime: ${process.version} (requires >= 18)`, "error");
  }

  // 2. Check Server Health
  const isHealthy = await ApiClient.isHealthy();
  if (isHealthy) {
    showStatus(`Mapigate Server on Port ${ApiClient.getPort()}: Healthy & Responding`, "success");
  } else {
    showStatus(`Mapigate Server on Port ${ApiClient.getPort()}: Not reachable or stopped`, "warning");
  }

  // 3. Check Storage & WAL
  const dataDir = getDefaultDataDir();
  const dbPath = path.join(dataDir, MAPIGATE_DB_FILE);
  if (fs.existsSync(dataDir)) {
    showStatus(`Data Storage Directory: ${dataDir} (OK)`, "success");
  } else {
    showStatus(`Data Storage Directory: ${dataDir} (Will be created on first launch)`, "info");
  }

  // 4. Hardware Machine ID
  try {
    const mid = machineIdSync();
    if (mid) {
      showStatus(`Hardware Machine ID Vault: Salt active (${mid.slice(0, 8)}...)`, "success");
    } else {
      showStatus("Hardware Machine ID: Empty", "warning");
    }
  } catch (err: any) {
    showStatus(`Hardware Machine ID: ${err.message}`, "warning");
  }

  // 5. CLI Tool Statuses
  const cliRes = await ApiClient.getCliToolsStatus();
  if (cliRes.success && cliRes.data) {
    const data = cliRes.data;
    const keys = Object.keys(data);
    const connected = keys.filter((k) => data[k]?.hasMapigate || data[k]?.configured);
    showStatus(`Coding Assistant Integration: ${connected.length}/${keys.length} tools connected`, "info");
  }

  console.log(`\n${COLORS.green}Doctor diagnostics complete.${COLORS.reset}\n`);
  await pause();
}
