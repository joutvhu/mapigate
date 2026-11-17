import { exec } from "node:child_process";
import chalk from "chalk";
import ora from "ora";
import { DEFAULT_PORT, DEFAULT_HOST, APP_NAME } from "../../shared/constants/index.js";
import { ProcessManager } from "../daemon/processManager.js";

export function openBrowser(url: string): void {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return;
  } catch {
    return;
  }
  if (/["`$;&|<>]/.test(url)) return;

  const platform = process.platform;
  let cmd = `xdg-open "${url}"`;
  if (platform === "win32") {
    cmd = `start "" "${url}"`;
  } else if (platform === "darwin") {
    cmd = `open "${url}"`;
  }

  exec(cmd, { windowsHide: true }, () => {
    // ignore errors
  });
}

export interface StartOptions {
  daemon?: boolean;
  port?: string | number;
  host?: string;
  noBrowser?: boolean;
  log?: boolean;
}

export async function runStart(options: StartOptions = {}): Promise<void> {
  let targetPort = options.port ? Number(options.port) : undefined;
  let targetHost = options.host;
  if (!targetPort || !targetHost) {
    try {
      const { SettingsRepository } = await import("../../storage/repositories/settingsRepo.js");
      const dbSettings = SettingsRepository.getEndpointSettings();
      if (!targetPort && dbSettings.port) targetPort = dbSettings.port;
      if (!targetHost && dbSettings.host) targetHost = dbSettings.host;
    } catch {}
  }
  const port = targetPort || DEFAULT_PORT;
  const host = targetHost || DEFAULT_HOST;
  const webUrl = `http://${host === "0.0.0.0" ? "localhost" : host}:${port}`;

  if (options.daemon) {
    const spinner = ora(`Starting ${APP_NAME} in background...`).start();
    const res = await ProcessManager.startDaemon(port);
    if (res.success) {
      spinner.succeed(chalk.green(res.message));
      console.log(chalk.gray(`→ Web Dashboard: ${webUrl}`));
      console.log(chalk.gray(`→ API Endpoint:  ${webUrl}/v1`));
      if (!options.noBrowser) {
        openBrowser(webUrl);
      }
    } else {
      spinner.fail(chalk.red(res.message));
      process.exitCode = 1;
    }
  } else {
    console.log(chalk.cyan(`Starting ${APP_NAME} in foreground on port ${port}...`));
    process.env.PORT = String(port);
    process.env.HOST = host;

    if (!options.noBrowser) {
      setTimeout(() => {
        openBrowser(webUrl);
      }, 1000);
    }

    await import("../../server/index.js");
  }
}
