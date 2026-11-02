import chalk from "chalk";
import { DEFAULT_PORT, DEFAULT_HOST, APP_NAME, APP_VERSION } from "../../shared/constants/index.js";
import { ProcessManager } from "../daemon/processManager.js";
import { PidFileManager } from "../daemon/pidFile.js";
import { ApiClient } from "../client/apiClient.js";

export interface StatusOptions {
  port?: string | number;
}

export async function runStatus(options: StatusOptions = {}): Promise<void> {
  const recordedPort = PidFileManager.readPort();
  const port = Number(options.port) || recordedPort || (process.env.PORT ? Number(process.env.PORT) : DEFAULT_PORT);
  const pid = PidFileManager.readPid();
  const isListening = await ProcessManager.isServerListening(port);

  ApiClient.configure({ port });

  console.log(`\n${chalk.bold(APP_NAME)} ${chalk.dim(`v${APP_VERSION}`)} Status:`);
  console.log(`──────────────────────────────────────────`);

  if (isListening) {
    console.log(`  State:        ${chalk.green.bold("RUNNING")}`);
    console.log(`  PID:          ${chalk.white(pid || "external/running")}`);
    console.log(`  Endpoint:     ${chalk.cyan(`http://${DEFAULT_HOST === "0.0.0.0" ? "localhost" : DEFAULT_HOST}:${port}`)}`);
    console.log(`  API v1:       ${chalk.cyan(`http://${DEFAULT_HOST === "0.0.0.0" ? "localhost" : DEFAULT_HOST}:${port}/v1`)}`);

    try {
      const statsRes = await ApiClient.getStats();
      if (statsRes.success && statsRes.data) {
        const stats = statsRes.data;
        console.log(`  Requests:     ${chalk.white(stats.totalRequests ?? 0)}`);
        console.log(
          `  Tokens Saved: ${chalk.green(`${(stats.totalTokensSaved || 0).toLocaleString()} tokens`)} (~$${(stats.estimatedCostSavedUsd || 0).toFixed(4)} saved)`
        );
      }
    } catch {
      // ignore
    }
  } else {
    console.log(`  State:        ${chalk.red.bold("STOPPED")}`);
    console.log(`  Port:         ${chalk.white(port)} (not listening)`);
  }
  console.log(`──────────────────────────────────────────\n`);
}
