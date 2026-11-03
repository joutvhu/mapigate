import { spawn } from "node:child_process";
import chalk from "chalk";
import ora from "ora";
import { checkForUpdates } from "../../shared/utils/versionChecker.js";
import { APP_NAME, APP_VERSION } from "../../shared/constants/index.js";

export interface UpgradeOptions {
  force?: boolean;
}

export async function runUpgrade(options: UpgradeOptions = {}): Promise<void> {
  const spinner = ora(`Checking for ${APP_NAME} updates on npm...`).start();
  const updateInfo = await checkForUpdates(true);

  if (!updateInfo.latestVersion) {
    spinner.fail(chalk.yellow(`Could not fetch latest version from npm registry. Please check your internet connection.`));
    return;
  }

  if (!updateInfo.hasUpdate && !options.force) {
    spinner.succeed(chalk.green(`You are already running the latest version of ${APP_NAME} (v${APP_VERSION}).`));
    return;
  }

  spinner.info(
    chalk.cyan(
      `Update found: ${chalk.dim(`v${APP_VERSION}`)} → ${chalk.bold.green(`v${updateInfo.latestVersion}`)}`
    )
  );

  const installSpinner = ora(`Running 'npm install -g mapigate@latest'...`).start();

  const isWindows = process.platform === "win32";
  const npmCmd = isWindows ? "npm.cmd" : "npm";

  await new Promise<void>((resolve, reject) => {
    const child = spawn(npmCmd, ["install", "-g", "mapigate@latest"], {
      stdio: "inherit",
      shell: isWindows,
    });

    child.on("close", (code) => {
      if (code === 0) {
        installSpinner.succeed(chalk.green(`Successfully upgraded ${APP_NAME} to v${updateInfo.latestVersion}!`));
        console.log(chalk.gray(`\nRun '${chalk.cyan("mpg restart")}' if the gateway daemon is currently active.\n`));
        resolve();
      } else {
        installSpinner.fail(chalk.red(`Upgrade failed with exit code ${code}.`));
        console.log(chalk.yellow(`\nTry upgrading manually by running:\n  ${chalk.cyan("npm install -g mapigate@latest")}\n`));
        reject(new Error(`npm install failed with exit code ${code}`));
      }
    });

    child.on("error", (err) => {
      installSpinner.fail(chalk.red(`Failed to execute npm: ${err.message}`));
      reject(err);
    });
  });
}
