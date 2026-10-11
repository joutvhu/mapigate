#!/usr/bin/env node
import { Command } from "commander";
import chalk from "chalk";
import { Migrator } from "./migration/migrator.js";
import type { MigrationStats, EntityCount } from "./migration/types.js";

const program = new Command();

program
  .name("migrate-from-9router")
  .description("Migrate data from 9router SQLite database to Mapigate SQLite database")
  .option("-s, --source <path>", "Path to source 9router data.sqlite file")
  .option("-d, --dest <path>", "Path to destination Mapigate mapigate.sqlite file")
  .option("--dry-run", "Preview migration plan and record counts without writing changes")
  .option("--no-backup", "Skip automatic timestamped backup of destination database")
  .option("--skip-logs", "Skip migrating request usage logs and details")
  .option("--replace", "Upsert and overwrite conflicts in destination database")
  .option("-v, --verbose", "Display verbose diagnostic output");

program.parse(process.argv);

const options = program.opts();

function formatRow(label: string, count: EntityCount, detail?: string): string {
  const readStr = chalk.cyan(count.read.toString().padStart(6));
  const migratedStr = count.migrated > 0 ? chalk.green(count.migrated.toString().padStart(6)) : chalk.dim("     0");
  const skippedStr = count.skipped > 0 ? chalk.yellow(count.skipped.toString().padStart(6)) : chalk.dim("     0");
  const detailStr = detail ? chalk.dim(` (${detail})`) : "";
  return `  ${label.padEnd(20)} : ${readStr} found  |  ${migratedStr} ready  |  ${skippedStr} skipped${detailStr}`;
}

async function run() {
  console.log(chalk.bold("\n========================================================"));
  console.log(chalk.bold.magenta("  Mapigate — 9router to Mapigate Data Migration Tool"));
  console.log(chalk.bold("========================================================\n"));

  if (options.dryRun) {
    console.log(chalk.yellow.bold("  [DRY-RUN MODE] No changes will be written to destination database.\n"));
  }

  const migrator = new Migrator({
    source: options.source,
    dest: options.dest,
    dryRun: options.dryRun,
    noBackup: options.backup === false,
    skipLogs: options.skipLogs,
    replace: options.replace,
    verbose: options.verbose,
  });

  const sourcePath = migrator.resolveSourcePath();
  const destPath = migrator.resolveDestPath();

  console.log(chalk.bold("Source Database      :"), chalk.cyan(sourcePath));
  console.log(chalk.bold("Destination Database :"), chalk.cyan(destPath));

  const stats: MigrationStats = migrator.migrate();

  if (stats.backupPath) {
    console.log(chalk.bold("Backup Created At    :"), chalk.green(stats.backupPath));
  }

  console.log(chalk.bold("\n--- Migration Summary ----------------------------------\n"));
  console.log(formatRow("Providers", stats.providers, "with defaults & strategies"));
  console.log(formatRow("Accounts", stats.accounts, "AES-256 vault re-encrypted"));
  console.log(formatRow("Combos", stats.combos, "fallback/round-robin mapped"));
  console.log(formatRow("Model Rules", stats.modelRules, "from 9router modelAliases"));
  console.log(formatRow("MITM Mappings", stats.mitmMappings, "from 9router mitmAlias"));
  console.log(formatRow("Settings", stats.settings, "DNS, MITM & RTK flags"));
  console.log(formatRow("Gateway API Keys", stats.gatewayApiKeys, "client keys migrated"));

  if (options.skipLogs) {
    console.log(chalk.dim("  Request Logs         : [SKIPPED via --skip-logs]"));
    console.log(chalk.dim("  Request Details      : [SKIPPED via --skip-logs]"));
  } else {
    console.log(formatRow("Request Logs", stats.requestLogs, "from usageHistory"));
    console.log(formatRow("Request Details", stats.requestDetails, "from requestDetails"));
  }

  if (stats.warnings.length > 0) {
    console.log(chalk.bold.yellow(`\nWarnings (${stats.warnings.length}):`));
    for (const w of stats.warnings) {
      console.log(chalk.yellow(`  - ${w}`));
    }
  }

  if (stats.errors.length > 0) {
    console.log(chalk.bold.red(`\nErrors (${stats.errors.length}):`));
    for (const e of stats.errors) {
      console.log(chalk.red(`  - ${e}`));
    }
    console.log(chalk.bold.red("\nMigration completed with errors.\n"));
    process.exit(1);
  }

  if (options.dryRun) {
    console.log(chalk.bold.green("\nDry-run completed successfully! All records verified for migration.\n"));
  } else {
    console.log(chalk.bold.green("\nMigration completed successfully! Destination database is ready.\n"));
  }
}

run().catch((err) => {
  console.error(chalk.red("\nFatal migration error:"), err);
  process.exit(1);
});
