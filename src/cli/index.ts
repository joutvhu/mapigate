import { Command } from "commander";
import chalk from "chalk";
import ora from "ora";
import { APP_NAME, APP_VERSION, DEFAULT_PORT, DEFAULT_HOST } from "../shared/constants/index.js";
import { ProcessManager } from "./daemon/processManager.js";
import { PidFileManager } from "./daemon/pidFile.js";

const program = new Command();

program
  .name("mapigate")
  .alias("mpg")
  .description("AI Model API Gateway & Token Optimizer for coding tools")
  .version(APP_VERSION);

program
  .command("start")
  .description(`Start the ${APP_NAME} gateway server`)
  .option("-d, --daemon", "Run as a background daemon process")
  .option("-p, --port <number>", "Port to listen on", String(DEFAULT_PORT))
  .action(async (options) => {
    const port = Number(options.port) || DEFAULT_PORT;

    if (options.daemon) {
      const spinner = ora(`Starting ${APP_NAME} in background...`).start();
      const res = await ProcessManager.startDaemon(port);
      if (res.success) {
        spinner.succeed(chalk.green(res.message));
        console.log(chalk.gray(`→ Web Dashboard: http://${DEFAULT_HOST}:${port}`));
      } else {
        spinner.fail(chalk.red(res.message));
      }
    } else {
      console.log(chalk.cyan(`Starting ${APP_NAME} in foreground on port ${port}...`));
      process.env.PORT = String(port);
      await import("../server/index.js");
    }
  });

program
  .command("stop")
  .description(`Stop running ${APP_NAME} daemon`)
  .option("-p, --port <number>", "Port to check and stop", String(DEFAULT_PORT))
  .action((options) => {
    const port = Number(options?.port) || DEFAULT_PORT;
    const spinner = ora(`Stopping ${APP_NAME} daemon...`).start();
    const res = ProcessManager.stopDaemon(port);
    if (res.success) {
      spinner.succeed(chalk.green(res.message));
    } else {
      spinner.warn(chalk.yellow(res.message));
    }
  });

program
  .command("status")
  .description(`Check ${APP_NAME} server status and statistics`)
  .action(async () => {
    const pid = PidFileManager.readPid();
    const isRunning = pid ? PidFileManager.isProcessRunning(pid) : false;
    const isListening = await ProcessManager.isServerListening(DEFAULT_PORT);

    console.log(`\n${chalk.bold(APP_NAME)} ${chalk.dim(`v${APP_VERSION}`)} Status:`);
    console.log(`──────────────────────────────────────────`);

    if (isListening) {
      console.log(`  State:       ${chalk.green.bold("RUNNING")}`);
      console.log(`  PID:         ${chalk.white(pid || "unknown")}`);
      console.log(`  Endpoint:    ${chalk.cyan(`http://${DEFAULT_HOST}:${DEFAULT_PORT}`)}`);

      try {
        const statsRes = await fetch(`http://${DEFAULT_HOST}:${DEFAULT_PORT}/api/stats`);
        if (statsRes.ok) {
          const stats: any = await statsRes.json();
          console.log(`  Requests:    ${chalk.white(stats.totalRequests)}`);
          console.log(`  Tokens Saved:${chalk.green(` ${stats.totalTokensSaved?.toLocaleString() || 0} tokens`)} (~$${stats.estimatedCostSavedUsd || 0} saved)`);
        }
      } catch {
        // Ignored
      }
    } else {
      console.log(`  State:       ${chalk.red.bold("STOPPED")}`);
    }
    console.log(`──────────────────────────────────────────\n`);
  });

program
  .command("connect <tool>")
  .description("Show quick setup instructions for AI coding tools (claude, cursor, cline)")
  .action((tool) => {
    const t = tool.toLowerCase();
    const endpoint = `http://${DEFAULT_HOST}:${DEFAULT_PORT}`;

    console.log(`\n${chalk.bold(`Setup ${APP_NAME} for ${tool.toUpperCase()}:`)}`);
    console.log(`──────────────────────────────────────────`);

    if (t === "claude" || t === "claude-code") {
      console.log(chalk.yellow("PowerShell (Windows):"));
      console.log(`  $env:ANTHROPIC_BASE_URL = "${endpoint}"`);
      console.log(`  claude\n`);
      console.log(chalk.yellow("Bash / Linux / macOS:"));
      console.log(`  export ANTHROPIC_BASE_URL="${endpoint}"`);
      console.log(`  claude`);
    } else if (t === "cursor") {
      console.log(`1. Open Cursor Settings -> Models -> OpenAI API Key`);
      console.log(`2. Override Base URL: ${chalk.green(`${endpoint}/v1`)}`);
      console.log(`3. API Key: any string (e.g. ${chalk.gray("mapigate-local")})`);
    } else if (t === "cline") {
      console.log(`1. Open Cline Settings -> API Provider: "OpenAI Compatible"`);
      console.log(`2. Base URL: ${chalk.green(`${endpoint}/v1`)}`);
      console.log(`3. API Key: any string (e.g. ${chalk.gray("mapigate-local")})`);
    } else {
      console.log(`Compatible with any OpenAI-compatible client:`);
      console.log(`  Base URL: ${chalk.green(`${endpoint}/v1`)}`);
      console.log(`  Claude Messages: ${chalk.green(`${endpoint}/v1/messages`)}`);
    }
    console.log(`──────────────────────────────────────────\n`);
  });

program.parse(process.argv);
