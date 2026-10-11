import chalk from "chalk";
import { DEFAULT_PORT } from "../../shared/constants/index.js";
import { ApiClient } from "../client/apiClient.js";
import { showTable } from "../ui/display.js";

export interface ModelsOptions {
  port?: string | number;
}

export async function runModels(options: ModelsOptions = {}): Promise<void> {
  const port = Number(options.port) || DEFAULT_PORT;
  ApiClient.configure({ port });

  const [modelsRes, combosRes] = await Promise.all([
    ApiClient.getModels(),
    ApiClient.getCombos(),
  ]);

  console.log(`\n${chalk.bold("Configured Routing Rules & Models:")}\n`);
  const modelRules = (modelsRes.success && Array.isArray(modelsRes.data)) ? modelsRes.data : [];
  if (modelRules.length > 0) {
    const headers = ["Alias", "Target Model", "Provider", "Default"];
    const rows = modelRules.map((m) => [
      m.alias,
      m.targetModel,
      m.targetProviderId,
      m.isDefault ? "YES" : "NO",
    ]);
    showTable(headers, rows);
  } else {
    console.log(chalk.gray("No custom model routing rules configured."));
  }

  console.log(`\n${chalk.bold("Configured Combos & Fallback Chains:")}\n`);
  const combos = (combosRes.success && Array.isArray(combosRes.data)) ? combosRes.data : [];
  if (combos.length > 0) {
    const headers = ["Combo Name", "Strategy", "Model Chain", "Active"];
    const rows = combos.map((c) => [
      c.name,
      c.strategy || "fallback",
      (c.models || []).join(" -> "),
      c.isActive !== false ? "YES" : "NO",
    ]);
    showTable(headers, rows);
  } else {
    console.log(chalk.gray("No combos configured."));
  }
  console.log();
}
