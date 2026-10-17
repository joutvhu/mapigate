import chalk from "chalk";
import { DEFAULT_PORT } from "../../shared/constants/index.js";
import { PidFileManager } from "../daemon/pidFile.js";
import { ApiClient } from "../client/apiClient.js";
import { showTable } from "../ui/display.js";

export interface ProvidersOptions {
  port?: string | number;
}

export async function runProviders(options: ProvidersOptions = {}): Promise<void> {
  const recordedPort = PidFileManager.readPort();
  const port = Number(options.port) || recordedPort || (process.env.PORT ? Number(process.env.PORT) : DEFAULT_PORT);
  ApiClient.configure({ port });

  const res = await ApiClient.getProviders();
  if (!res.success || !Array.isArray(res.data)) {
    console.log(chalk.red(`Failed to fetch providers: ${res.error || "Server not reachable"}`));
    process.exitCode = 1;
    return;
  }

  const providers = res.data;
  console.log(`\n${chalk.bold("Configured AI Providers:")}\n`);

  const headers = ["Provider ID", "Name", "Base URL", "Accounts", "Active", "Format"];
  const rows = providers.map((p) => [
    p.id,
    p.name || p.id,
    p.baseUrl || "(default)",
    p.accountsCount ?? (p.accounts?.length || 0),
    p.isActive !== false ? "YES" : "NO",
    p.format || "openai",
  ]);

  showTable(headers, rows);
  console.log();
}
