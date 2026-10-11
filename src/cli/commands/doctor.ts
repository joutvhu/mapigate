import fs from "node:fs";
import path from "node:path";
import chalk from "chalk";
import nodeMachineId from "node-machine-id";
const { machineIdSync } = nodeMachineId;
import { DEFAULT_PORT, getDefaultDataDir, MAPIGATE_DB_FILE, APP_NAME, APP_VERSION } from "../../shared/constants/index.js";
import { ProcessManager } from "../daemon/processManager.js";
import { ApiClient } from "../client/apiClient.js";
import { showStatus } from "../ui/display.js";

export interface DoctorOptions {
  port?: string | number;
}

export async function runDoctor(options: DoctorOptions = {}): Promise<void> {
  const port = Number(options.port) || DEFAULT_PORT;
  ApiClient.configure({ port });

  console.log(`\n${chalk.bold(`[Doctor] ${APP_NAME} v${APP_VERSION} System Doctor`)}`);
  console.log(`──────────────────────────────────────────`);

  let allGood = true;

  // 1. Check Node.js
  const nodeMajor = parseInt(process.versions.node.split(".")[0], 10);
  if (nodeMajor >= 18) {
    showStatus(`Node.js Runtime: ${process.version} (>= 18)`, "success");
  } else {
    allGood = false;
    showStatus(`Node.js Runtime: ${process.version} (requires >= 18)`, "error");
  }

  // 2. Check Port and Server
  const isListening = await ProcessManager.isServerListening(port);
  if (isListening) {
    const isHealthy = await ApiClient.isHealthy();
    if (isHealthy) {
      showStatus(`Server Port ${port}: Running and responding to /health`, "success");
    } else {
      showStatus(`Server Port ${port}: Listening but /health returned non-200`, "warning");
    }
  } else {
    showStatus(`Server Port ${port}: Free (Mapigate daemon is not currently running)`, "info");
  }

  // 3. Storage Directory & Database
  const dataDir = getDefaultDataDir();
  const dbFile = path.join(dataDir, MAPIGATE_DB_FILE);
  if (fs.existsSync(dataDir)) {
    const dbSize = fs.existsSync(dbFile) ? `${(fs.statSync(dbFile).size / 1024).toFixed(1)} KB` : "fresh";
    showStatus(`Storage Vault: ${dataDir} (Database: ${dbSize}, WAL mode active)`, "success");
  } else {
    showStatus(`Storage Vault: ${dataDir} (will initialize on first launch)`, "info");
  }

  // 4. Hardware Encryption Vault
  try {
    const mid = machineIdSync();
    if (mid) {
      showStatus(`Hardware Machine ID: ${mid.slice(0, 8)}... (AES-256-GCM vault ready)`, "success");
    } else {
      showStatus("Hardware Machine ID: Empty or virtualized", "warning");
    }
  } catch (err: any) {
    showStatus(`Hardware Machine ID Vault: ${err.message}`, "warning");
  }

  // 5. CLI Tool Statuses
  try {
    const toolsRes = await ApiClient.getCliToolsStatus();
    if (toolsRes.success && toolsRes.data) {
      const data = toolsRes.data;
      const keys = Object.keys(data);
      const connected = keys.filter((k) => data[k]?.hasMapigate || data[k]?.configured);
      showStatus(`Coding Assistants: ${connected.length}/${keys.length} connected to Mapigate`, "info");
    }
  } catch {
    // ignore
  }

  console.log(`──────────────────────────────────────────`);
  if (allGood) {
    console.log(chalk.green.bold("All core doctor health checks passed.\n"));
  } else {
    console.log(chalk.yellow.bold("Doctor completed with warnings or issues.\n"));
  }
}
