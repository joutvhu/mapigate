import { Command } from "commander";
import chalk from "chalk";
import ora from "ora";
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
import { runStartup } from "./commands/startup.js";

async function showInterfaceMenu(port: number, pid: number | null): Promise<string> {
  clearScreen();
  const host = DEFAULT_HOST === "0.0.0.0" ? "localhost" : DEFAULT_HOST;
  const webUrl = `http://${host}:${port}`;
  const pidStr = pid ? ` (PID: ${pid})` : "";
  const subtitle = `🚀 Server: \x1b[32m${webUrl}\x1b[0m\x1b[90m${pidStr}\x1b[0m`;

  const menuItems = [
    { label: "Web UI (Open in Browser)", icon: "🌐" },
    { label: "Terminal UI (Interactive CLI)", icon: "💻" },
    { label: "Status & RTK Metrics", icon: "📊" },
    { label: "Hide to Tray (Background)", icon: "🔔" },
    { label: "Exit (Stop Gateway)", icon: "🚪" },
  ];

  const selected = await selectMenu(
    `Choose Interface (v${APP_VERSION})`,
    menuItems,
    0,
    subtitle
  );

  switch (selected) {
    case 0:
      return "web";
    case 1:
      return "terminal";
    case 2:
      return "status";
    case 3:
      return "hide";
    case 4:
    case -1:
      return "exit";
    default:
      return "hide";
  }
}

async function runInteractiveLauncher(port: number = DEFAULT_PORT): Promise<void> {
  const host = DEFAULT_HOST === "0.0.0.0" ? "localhost" : DEFAULT_HOST;
  const webUrl = `http://${host}:${port}`;

  // 1. Auto-start server in background if not already listening
  const isListening = await ProcessManager.isServerListening(port);
  if (!isListening) {
    const spinner = ora(`Starting ${APP_NAME} gateway server on port ${port}...`).start();
    const res = await ProcessManager.startDaemon(port);
    if (res.success) {
      spinner.succeed(chalk.green(`${APP_NAME} gateway ready at ${webUrl}`));
      await new Promise((r) => setTimeout(r, 600));
    } else {
      spinner.fail(chalk.red(`Failed to start ${APP_NAME}: ${res.message}`));
      process.exit(1);
    }
  }

  // 2. Interactive Menu Loop
  while (true) {
    const pid = PidFileManager.readPid();
    const choice = await showInterfaceMenu(port, pid);

    if (choice === "web") {
      openBrowser(webUrl);
      await pause("\nPress Enter to return to menu...");
    } else if (choice === "terminal") {
      await startTerminalUI(port);
    } else if (choice === "status") {
      clearScreen();
      await runStatus({ port });
      await pause("\nPress Enter to return to menu...");
    } else if (choice === "hide") {
      clearScreen();
      const currentPid = PidFileManager.readPid();
      console.log(chalk.cyan(`\n🔔 ${APP_NAME} is running in background (PID: ${currentPid ?? "active"}).`));
      console.log(chalk.gray(`   Web Dashboard: ${webUrl}`));
      console.log(chalk.gray(`   API Endpoint:  ${webUrl}/v1\n`));
      console.log(chalk.green(`💡 Mapigate is running in system tray. You can close this terminal.`));
      console.log(chalk.gray(`   Right-click tray icon or run 'mpg stop' to quit.\n`));
      process.exit(0);
    } else if (choice === "exit") {
      clearScreen();
      console.log(chalk.cyan(`\nStopping ${APP_NAME} on port ${port}...`));
      const res = ProcessManager.stopDaemon(port);
      if (res.success) {
        console.log(chalk.green(`[OK] ${res.message}\n`));
      } else {
        console.log(chalk.yellow(`[!] ${res.message}\n`));
      }
      process.exit(0);
    }
  }
}

const program = new Command();

program
  .name("mapigate")
  .alias("mpg")
  .description("AI Model API Gateway & Token Optimizer for coding assistants")
  .version(APP_VERSION)
  .option("-p, --port <number>", "Port to run the gateway server", String(DEFAULT_PORT))
  .option("-H, --host <host>", "Host to bind on", DEFAULT_HOST)
  .option("-t, --tray", "Run in system tray mode (background)")
  .option("-n, --no-browser", "Don't open browser automatically")
  .action(async (options) => {
    const port = Number(options.port) || DEFAULT_PORT;
    const host = (options.host || DEFAULT_HOST) === "0.0.0.0" ? "localhost" : (options.host || DEFAULT_HOST);

    if (options.tray) {
      const isListening = await ProcessManager.isServerListening(port);
      if (!isListening) {
        const res = await ProcessManager.startDaemon(port);
        if (!res.success) {
          console.error(chalk.red(`Failed to start ${APP_NAME}: ${res.message}`));
          process.exit(1);
        }
      }
      console.log(`\n🚀 ${APP_NAME} v${APP_VERSION}`);
      console.log(`Server: http://${host}:${port}`);
      console.log(chalk.green(`\n💡 Mapigate is running in system tray. You can close this terminal.`));
      console.log(chalk.gray(`   Right-click tray icon or run 'mpg stop' to quit.\n`));
      process.exit(0);
    }

    if (process.stdin.isTTY) {
      await runInteractiveLauncher(port);
    } else {
      await runStatus({ port });
    }
  });

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
  .option("-l, --level <level>", "Filter by minimum log level (trace, debug, info, warn, error)")
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

program
  .command("startup [action]")
  .alias("autostart")
  .description("Configure Mapigate to start automatically on system boot (enable, disable, status)")
  .action(async (action) => {
    await runStartup(action);
  });

program.parseAsync(process.argv).catch((err) => {
  console.error(chalk.red("CLI error:"), err.message || err);
  process.exit(1);
});
