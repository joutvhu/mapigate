import chalk from "chalk";
import ora from "ora";
import { DEFAULT_PORT, APP_NAME } from "../../shared/constants/index.js";
import { ProcessManager } from "../daemon/processManager.js";
import { PidFileManager } from "../daemon/pidFile.js";

export interface StopOptions {
  port?: string | number;
}

export function runStop(options: StopOptions = {}): void {
  const recordedPort = PidFileManager.readPort();
  const port = Number(options?.port) || recordedPort || (process.env.PORT ? Number(process.env.PORT) : DEFAULT_PORT);
  const spinner = ora(`Stopping ${APP_NAME} daemon...`).start();
  const res = ProcessManager.stopDaemon(port);
  if (res.success) {
    spinner.succeed(chalk.green(res.message));
  } else {
    spinner.warn(chalk.yellow(res.message));
  }
}
