import chalk from "chalk";
import ora from "ora";
import { DEFAULT_PORT, DEFAULT_HOST, APP_NAME } from "../../shared/constants/index.js";
import { ProcessManager } from "../daemon/processManager.js";
import { PortHelper } from "../daemon/portHelper.js";

export interface RestartOptions {
  port?: string | number;
}

export async function runRestart(options: RestartOptions = {}): Promise<void> {
  const port = Number(options?.port) || DEFAULT_PORT;
  const spinner = ora(`Restarting ${APP_NAME} daemon...`).start();

  ProcessManager.stopDaemon(port);
  PortHelper.cleanPort(port);
  await PortHelper.waitForPortRelease(port, 3000);

  const startRes = await ProcessManager.startDaemon(port);
  if (startRes.success) {
    spinner.succeed(chalk.green(`Restarted ${APP_NAME} (PID: ${startRes.pid || "running"}) on port ${port}.`));
    console.log(chalk.gray(`→ Web Dashboard: http://${DEFAULT_HOST === "0.0.0.0" ? "localhost" : DEFAULT_HOST}:${port}`));
  } else {
    spinner.fail(chalk.red(`Failed to restart ${APP_NAME}: ${startRes.message}`));
    process.exitCode = 1;
  }
}
