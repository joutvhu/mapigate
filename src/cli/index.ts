import { Command } from "commander";
import chalk from "chalk";
import { APP_NAME, APP_VERSION, DEFAULT_PORT, DEFAULT_HOST } from "../shared/constants/index.js";
import { ProcessManager } from "./daemon/processManager.js";
import { PidFileManager } from "./daemon/pidFile.js";
import { startTerminalUI } from "./tui/terminalUI.js";
import { selectMenu, pause } from "./ui/input.js";
import { clearScreen } from "./ui/display.js";
import { openBrowser, runStart } from "./commands/start.js";
import { runStop } from "./commands/stop.js";
import { runRestart } from "./commands/restart.js";
import { runStatus } from "./commands/status.js";
import { runLogs } from "./commands/logs.js";
import { runConnect } from "./commands/connect.js";
import { runShow } from "./commands/show.js";
import { runDoctor } from "./commands/doctor.js";
import { runProviders } from "./commands/providers.js";
import { runModels } from "./commands/models.js";

async function showLauncherMenu(port: number, isListening: boolean, pid: number | null): Promise<string> {
  clearScreen();
  const host = DEFAULT_HOST === "0.0.0.0" ? "localhost" : DEFAULT_HOST;
  const webUrl = `http://${host}:${port}`;

  const statusBadge = isListening
    ? `\x1b[32m[RUNNING]\x1b[0m (PID: ${pid ?? "unknown"}, Port: ${port})`
    : `\x1b[90m[STOPPED]\x1b[0m (Port: ${port})`;

  const subtitle = `Status: ${statusBadge}${isListening ? `\n  URL:    \x1b[36m${webUrl}\x1b[0m` : ""}`;

  const menuItems = [
    { label: "Start Server (Foreground)" },
    { label: "Start Server (Background Daemon)" },
    { label: "Stop Background Server" },
    { label: "Open Dashboard (Web UI)" },
    { label: "Terminal UI (Interactive CLI)" },
    { label: "Status & RTK Metrics" },
    { label: "Exit CLI (keep background server running)" },
    { label: "Exit CLI and Stop Server" },
  ];

  const selected = await selectMenu(
    `${APP_NAME} Launcher (v${APP_VERSION})`,
    menuItems,
    isListening ? 3 : 0,
    subtitle
  );

  switch (selected) {
    case 0:
      return "start-fg";
    case 1:
      return "start-bg";
    case 2:
      return "stop";
    case 3:
      return "web";
    case 4:
      return "terminal";
    case 5:
      return "status";
    case 6:
      return "exit-keep";
    case 7:
      return "exit-stop";
    default:
      return "exit-keep";
  }
}

async function runInteractiveLauncher(port: number = DEFAULT_PORT): Promise<void> {
  const host = DEFAULT_HOST === "0.0.0.0" ? "localhost" : DEFAULT_HOST;
  const webUrl = `http://${host}:${port}`;

  while (true) {
    const isListening = await ProcessManager.isServerListening(port);
    const pid = PidFileManager.readPid();
    const choice = await showLauncherMenu(port, isListening, pid);

    if (choice === "start-fg") {
      clearScreen();
      if (isListening) {
        console.log(chalk.yellow(`\n[!] Server is already running on port ${port} (PID: ${pid ?? "unknown"}).`));
        console.log(chalk.gray(`    Stop the running instance first if you wish to run in foreground.\n`));
        await pause();
        continue;
      }
      console.log(chalk.cyan(`\nStarting ${APP_NAME} in foreground on port ${port}...`));
      await runStart({ port, daemon: false, noBrowser: false });
      return;
    } else if (choice === "start-bg") {
      clearScreen();
      if (isListening) {
        console.log(chalk.yellow(`\n[!] Server is already running on port ${port} (PID: ${pid ?? "unknown"}).\n`));
      } else {
        console.log(chalk.cyan(`\nStarting ${APP_NAME} background daemon on port ${port}...`));
        const res = await ProcessManager.startDaemon(port);
        if (res.success) {
          console.log(chalk.green(`[OK] ${res.message}\n`));
        } else {
          console.log(chalk.red(`[ERR] ${res.message}\n`));
        }
      }
      await pause();
    } else if (choice === "stop") {
      clearScreen();
      console.log(chalk.cyan(`\nStopping ${APP_NAME} on port ${port}...`));
      const res = ProcessManager.stopDaemon(port);
      console.log(res.success ? chalk.green(`[OK] ${res.message}\n`) : chalk.red(`[ERR] ${res.message}\n`));
      await pause();
    } else if (choice === "web") {
      if (!isListening) {
        console.log(chalk.cyan(`\nServer is not running. Starting background daemon first...`));
        const res = await ProcessManager.startDaemon(port);
        if (res.success) {
          await ProcessManager.waitForReady(port, 5000);
        } else {
          console.log(chalk.red(`[ERR] Could not start server: ${res.message}`));
          await pause();
          continue;
        }
      }
      openBrowser(webUrl);
      await pause("\nPress Enter to return to launcher menu...");
    } else if (choice === "terminal") {
      await startTerminalUI(port);
    } else if (choice === "status") {
      clearScreen();
      await runStatus({ port });
      await pause("\nPress Enter to return to launcher menu...");
    } else if (choice === "exit-keep") {
      clearScreen();
      if (isListening) {
        console.log(`\nExiting CLI. ${APP_NAME} remains running in background on port ${port} (PID: ${pid ?? "unknown"}).\n`);
      } else {
        console.log(`\nExiting CLI.\n`);
      }
      process.exit(0);
    } else if (choice === "exit-stop") {
      clearScreen();
      if (isListening) {
        console.log(chalk.cyan(`Stopping ${APP_NAME} on port ${port}...`));
        const res = ProcessManager.stopDaemon(port);
        console.log(res.success ? chalk.green(`[OK] ${res.message}\n`) : chalk.red(`[ERR] ${res.message}\n`));
      }
      console.log(`Exited CLI.\n`);
      process.exit(0);
    } else {
      process.exit(0);
    }
  }
}

const program = new Command();

program
  .name("mapigate")
  .alias("mpg")
  .description("AI Model API Gateway & Token Optimizer for coding assistants")
  .version(APP_VERSION);

program
  .command("start")
  .description(`Start the ${APP_NAME} gateway server`)
  .option("-d, --daemon", "Run as a background daemon process")
  .option("-p, --port <number>", "Port to listen on", String(DEFAULT_PORT))
  .option("-H, --host <host>", "Host to bind on", DEFAULT_HOST)
  .option("-n, --no-browser", "Don't open browser automatically")
  .option("-l, --log", "Show server logs")
  .action(async (options) => {
    await runStart(options);
  });

program
  .command("stop")
  .description(`Stop running ${APP_NAME} daemon`)
  .option("-p, --port <number>", "Port to check and stop", String(DEFAULT_PORT))
  .action((options) => {
    runStop(options);
  });

program
  .command("restart")
  .description(`Restart ${APP_NAME} daemon process`)
  .option("-p, --port <number>", "Port to restart on", String(DEFAULT_PORT))
  .action(async (options) => {
    await runRestart(options);
  });

program
  .command("status")
  .description(`Check ${APP_NAME} server status and RTK savings metrics`)
  .option("-p, --port <number>", "Port to check", String(DEFAULT_PORT))
  .action(async (options) => {
    await runStatus(options);
  });

program
  .command("logs")
  .description(`Inspect server logs and console outputs`)
  .option("-f, --follow", "Follow log output continuously")
  .option("-n, --lines <number>", "Number of recent lines to display", "50")
  .option("-p, --port <number>", "Port to query API logs from", String(DEFAULT_PORT))
  .action(async (options) => {
    await runLogs(options);
  });

program
  .command("connect [target]")
  .description("Configure local CLI tools (claude, codex, opencode, cline, etc.) for Mapigate")
  .option("--tools <list>", "Comma-separated tools to configure (or 'all')")
  .option("--api-key <key>", "API key to set (default: 'mapigate-local')")
  .option("--model <model>", "Model for non-Claude tools")
  .option("--sonnet <model>", "Override Claude Sonnet model")
  .option("--opus <model>", "Override Claude Opus model")
  .option("--haiku <model>", "Override Claude Haiku model")
  .option("--reset", "Reset selected tools back to default configuration")
  .option("--print-env", "Print environment variables for PowerShell and Bash")
  .action(async (target, options) => {
    await runConnect(target, options);
  });

program
  .command("show [tools...]")
  .description("Inspect local AI coding tools configuration files and models")
  .option("--tools <list>", "Comma-separated tools list")
  .option("--json", "Output machine-readable JSON format")
  .action(async (tools, options) => {
    const list = options.tools ? options.tools.split(",").map((s: string) => s.trim()) : tools;
    await runShow(list, options);
  });

program
  .command("doctor")
  .description("Validate system runtime, port, SQLite WAL, machine ID, and tools")
  .option("-p, --port <number>", "Port to check", String(DEFAULT_PORT))
  .action(async (options) => {
    await runDoctor(options);
  });

program
  .command("providers")
  .description("List configured providers and accounts")
  .option("-p, --port <number>", "Port to query", String(DEFAULT_PORT))
  .action(async (options) => {
    await runProviders(options);
  });

program
  .command("models")
  .description("List available routing models and combos")
  .option("-p, --port <number>", "Port to query", String(DEFAULT_PORT))
  .action(async (options) => {
    await runModels(options);
  });

// When run without arguments in an interactive terminal, launch the Interactive Menu
if (process.argv.length <= 2 && process.stdin.isTTY) {
  runInteractiveLauncher(DEFAULT_PORT).catch((err) => {
    console.error(chalk.red("Launcher error:"), err.message || err);
    process.exit(1);
  });
} else {
  program.parse(process.argv);
}
