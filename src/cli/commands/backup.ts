import fs from "node:fs";
import path from "node:path";
import chalk from "chalk";
import { BackupService, type BackupPayload } from "../../storage/backupService.js";

export interface BackupExportCliOptions {
  output?: string;
  includeKeys?: boolean;
  password?: string;
}

export interface BackupImportCliOptions {
  password?: string;
  overwrite?: boolean;
}

export async function runBackupExport(options: BackupExportCliOptions = {}): Promise<void> {
  const dateStr = new Date().toISOString().split("T")[0];
  const defaultFile = `mapigate-backup-${dateStr}.json`;
  const targetPath = path.resolve(process.cwd(), options.output || defaultFile);

  console.log(chalk.bold("\n[Backup] Exporting Mapigate Configuration..."));

  try {
    const backup = await BackupService.exportConfig({
      includeCredentials: Boolean(options.includeKeys),
      password: options.password,
    });

    fs.writeFileSync(targetPath, JSON.stringify(backup, null, 2), "utf8");

    console.log(chalk.green(`✓ Configuration successfully exported to: ${chalk.bold(targetPath)}`));
    console.log(`  • Providers: ${backup.data.providers.length}`);
    console.log(`  • Combos: ${backup.data.combos.length}`);
    console.log(`  • Model Mappings: ${backup.data.mappings.length}`);
    console.log(`  • Includes Credentials: ${backup.includesCredentials ? chalk.yellow("YES") : chalk.gray("NO (Zero-Secrets Template)")}`);
    if (backup.encrypted) {
      console.log(`  • Password Encryption: ${chalk.green("AES-256-GCM (Protected)")}`);
    }
    console.log();
  } catch (err: any) {
    console.error(chalk.red(`\n❌ Failed to export backup: ${err.message}\n`));
    process.exitCode = 1;
  }
}

export async function runBackupImport(filePath: string, options: BackupImportCliOptions = {}): Promise<void> {
  if (!filePath) {
    console.error(chalk.red("\n❌ Error: Please specify the path to the backup JSON file.\n"));
    process.exitCode = 1;
    return;
  }

  const resolvedPath = path.resolve(process.cwd(), filePath);
  if (!fs.existsSync(resolvedPath)) {
    console.error(chalk.red(`\n❌ Error: Backup file not found: ${resolvedPath}\n`));
    process.exitCode = 1;
    return;
  }

  console.log(chalk.bold(`\n[Backup] Importing configuration from: ${chalk.cyan(resolvedPath)}...`));

  try {
    const raw = fs.readFileSync(resolvedPath, "utf8");
    const payload: BackupPayload = JSON.parse(raw);

    const result = await BackupService.importConfig(payload, {
      password: options.password,
      mode: options.overwrite ? "overwrite" : "merge",
    });

    console.log(chalk.green("\n✓ Configuration successfully restored:"));
    console.log(`  • Providers imported: ${result.restored.providersCount}`);
    console.log(`  • Accounts imported: ${result.restored.accountsCount}`);
    console.log(`  • Combos imported: ${result.restored.combosCount}`);
    console.log(`  • Mappings imported: ${result.restored.mappingsCount}`);

    if (result.warnings && result.warnings.length > 0) {
      console.log(chalk.yellow("\n⚠️ Warnings:"));
      for (const w of result.warnings) {
        console.log(chalk.yellow(`  - ${w}`));
      }
    }
    console.log();
  } catch (err: any) {
    console.error(chalk.red(`\n❌ Failed to import backup: ${err.message}\n`));
    process.exitCode = 1;
  }
}
