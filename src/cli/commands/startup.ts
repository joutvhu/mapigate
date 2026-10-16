import chalk from "chalk";
import ora from "ora";
import { APP_NAME } from "../../shared/constants/index.js";
import {
  enableAutoStart,
  disableAutoStart,
  getAutoStartInfo,
} from "../daemon/autostart.js";

export async function runStartup(action?: string): Promise<void> {
  const normAction = action?.toLowerCase().trim();

  if (normAction === "enable" || normAction === "on") {
    const spinner = ora(`Enabling autostart for ${APP_NAME}...`).start();
    const success = enableAutoStart();
    const info = getAutoStartInfo();
    if (success) {
      spinner.succeed(chalk.green(`Enabled ${APP_NAME} to launch automatically on system boot.`));
      if (info.targetPath) {
        console.log(chalk.gray(`→ Startup Entry: ${info.targetPath}`));
      }
    } else {
      spinner.fail(chalk.red(`Failed to configure autostart on ${info.platform}.`));
      process.exitCode = 1;
    }
    return;
  }

  if (normAction === "disable" || normAction === "off") {
    const spinner = ora(`Disabling autostart for ${APP_NAME}...`).start();
    const success = disableAutoStart();
    if (success) {
      spinner.succeed(chalk.green(`Disabled ${APP_NAME} from launching automatically on system boot.`));
    } else {
      spinner.fail(chalk.red(`Failed to remove autostart entry.`));
      process.exitCode = 1;
    }
    return;
  }

  // Status / default display
  const info = getAutoStartInfo();
  console.log(`\n${chalk.bold(APP_NAME)} System Startup Configuration:`);
  console.log(`──────────────────────────────────────────`);
  console.log(`  Platform:       ${chalk.white(info.platform)}`);
  console.log(
    `  Autostart:      ${
      info.enabled ? chalk.green.bold("ENABLED (Active on boot)") : chalk.yellow.bold("DISABLED (Manual only)")
    }`
  );
  if (info.targetPath) {
    console.log(`  Startup Path:   ${chalk.gray(info.targetPath)}`);
  }
  console.log(`──────────────────────────────────────────`);
  console.log(chalk.dim(`\nUsage:`));
  console.log(chalk.gray(`  mpg startup enable    - Launch Mapigate automatically when computer starts`));
  console.log(chalk.gray(`  mpg startup disable   - Disable automatic launch on computer start\n`));
}
