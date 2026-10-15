#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, "..");

// Color helpers for terminal output without external dependency requirement
const colors = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  dim: "\x1b[2m",
  green: "\x1b[32m",
  cyan: "\x1b[36m",
  yellow: "\x1b[33m",
  red: "\x1b[31m",
  magenta: "\x1b[35m",
};

function log(msg = "") {
  console.log(msg);
}

function info(msg) {
  console.log(`${colors.cyan}[INFO]${colors.reset} ${msg}`);
}

function success(msg) {
  console.log(`${colors.green}[SUCCESS]${colors.reset} ${msg}`);
}

function warn(msg) {
  console.log(`${colors.yellow}[WARN]${colors.reset} ${msg}`);
}

function error(msg) {
  console.error(`${colors.red}[ERROR]${colors.reset} ${msg}`);
}

function run(cmd, args, options = {}) {
  const isWindows = process.platform === "win32";
  let result;

  if (isWindows) {
    // Quote arguments with spaces if necessary
    const formattedArgs = args.map((arg) => (arg.includes(" ") ? `"${arg}"` : arg));
    const fullCmd = [cmd, ...formattedArgs].join(" ");
    result = spawnSync(fullCmd, {
      cwd: projectRoot,
      stdio: options.silent ? "pipe" : "inherit",
      shell: true,
      encoding: "utf-8",
      ...options,
    });
  } else {
    result = spawnSync(cmd, args, {
      cwd: projectRoot,
      stdio: options.silent ? "pipe" : "inherit",
      shell: false,
      encoding: "utf-8",
      ...options,
    });
  }

  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0 && !options.ignoreError) {
    const errMsg = result.stderr ? result.stderr.trim() : `Command failed with exit code ${result.status}`;
    throw new Error(errMsg);
  }
  return result;
}

function showHelp() {
  log(`
${colors.bold}${colors.cyan}Mapigate Local Publisher${colors.reset}
Build final production artifacts and test locally via npm without publishing to the public registry.

${colors.bold}USAGE:${colors.reset}
  node scripts/publish-local.mjs [options]
  npm run local:publish [-- options]

${colors.bold}OPTIONS:${colors.reset}
  ${colors.green}--install-global, -g${colors.reset}   (Default) Build, pack tarball, and install globally in local npm (mapigate / mpg)
  ${colors.green}--pack-only, -p${colors.reset}        Only build and produce the .tgz tarball in root directory
  ${colors.green}--registry <url>, -r${colors.reset}   Publish to a local private npm registry (e.g. Verdaccio at http://localhost:4873)
  ${colors.green}--skip-build, -s${colors.reset}       Skip the 'npm run build' step and use existing dist/ artifacts
  ${colors.green}--clean, -c${colors.reset}            Clean up generated .tgz tarball after installation
  ${colors.green}--help, -h${colors.reset}             Show this help message

${colors.bold}EXAMPLES:${colors.reset}
  ${colors.dim}# Build and install to global npm (test 'mpg' / 'mapigate' anywhere):${colors.reset}
  npm run local:publish

  ${colors.dim}# Only create local .tgz tarball for manual inspection or npx testing:${colors.reset}
  npm run local:pack

  ${colors.dim}# Publish to local Verdaccio registry:${colors.reset}
  npm run local:publish -- --registry http://localhost:4873
`);
}

async function checkLocalRegistry(url = "http://localhost:4873") {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 400);
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timer);
    return res.ok;
  } catch {
    return false;
  }
}

async function main() {
  const args = process.argv.slice(2);

  if (args.includes("--help") || args.includes("-h")) {
    showHelp();
    process.exit(0);
  }

  const isPackOnly = args.includes("--pack-only") || args.includes("-p");
  const skipBuild = args.includes("--skip-build") || args.includes("-s");
  const shouldClean = args.includes("--clean") || args.includes("-c");
  
  let registryUrl = null;
  const regIdx = args.findIndex((a) => a === "--registry" || a === "-r");
  if (regIdx !== -1 && args[regIdx + 1]) {
    registryUrl = args[regIdx + 1];
  }

  // Read package.json
  const pkgPath = path.resolve(projectRoot, "package.json");
  const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf-8"));
  const pkgName = pkg.name;
  const pkgVersion = pkg.version;

  log(`\n${colors.bold}${colors.magenta}=== Mapigate Local Build & Publish ===${colors.reset}`);
  log(`Package: ${colors.bold}${pkgName}@${pkgVersion}${colors.reset}\n`);

  // Step 1: Verify files configuration in package.json
  if (!pkg.files || !pkg.files.includes("dist") || !pkg.files.includes("bin")) {
    warn("package.json is missing 'files': ['dist', 'bin']. Adding it temporarily or permanently ensures clean packaging.");
  }

  // Step 2: Build final production bundle
  if (!skipBuild) {
    info("Step 1/3: Building final production bundle (codegen, server, web)...");
    try {
      run("npm", ["run", "build"]);
      success("Build completed successfully (dist/ is ready).\n");
    } catch (err) {
      error(`Build failed: ${err.message}`);
      process.exit(1);
    }
  } else {
    info("Skipping build step (--skip-build specified).\n");
  }

  // Verify dist folder exists
  const distPath = path.resolve(projectRoot, "dist");
  if (!fs.existsSync(distPath)) {
    error("dist directory does not exist! Please run build first.");
    process.exit(1);
  }

  // Step 3: Run npm pack to create tarball
  info("Step 2/3: Packaging into local tarball (.tgz)...");
  let tarballFilename = "";
  try {
    const packResult = run("npm", ["pack"], { silent: true });
    const outputLines = packResult.stdout.trim().split("\n");
    tarballFilename = outputLines[outputLines.length - 1].trim();

    if (!tarballFilename.endsWith(".tgz")) {
      // Fallback matching
      tarballFilename = `${pkgName}-${pkgVersion}.tgz`;
    }
    const tarballPath = path.resolve(projectRoot, tarballFilename);
    const stats = fs.statSync(tarballPath);
    const sizeInMB = (stats.size / (1024 * 1024)).toFixed(2);

    success(`Package created: ${colors.bold}${tarballFilename}${colors.reset} (${sizeInMB} MB)\n`);
  } catch (err) {
    error(`Failed to pack package: ${err.message}`);
    process.exit(1);
  }

  const tarballPath = path.resolve(projectRoot, tarballFilename);

  // Step 4: Publish or Install
  if (registryUrl) {
    info(`Step 3/3: Publishing to local npm registry at ${colors.cyan}${registryUrl}${colors.reset}...`);
    try {
      run("npm", ["publish", tarballFilename, "--registry", registryUrl]);
      success(`Successfully published ${pkgName}@${pkgVersion} to ${registryUrl}!\n`);
      log(`You can now test installing from this registry:`);
      log(`  ${colors.green}npm install -g ${pkgName} --registry ${registryUrl}${colors.reset}\n`);
    } catch (err) {
      error(`Publish to ${registryUrl} failed: ${err.message}`);
      process.exit(1);
    }
  } else if (isPackOnly) {
    success(`Tarball is ready for manual testing: ${colors.bold}${tarballPath}${colors.reset}`);
    log("\nHow to test this package:");
    log(`  1. Test directly with npx:`);
    log(`     ${colors.cyan}npx ./${tarballFilename} --version${colors.reset}`);
    log(`  2. Install in another local project:`);
    log(`     ${colors.cyan}npm install ${tarballPath}${colors.reset}`);
    log(`  3. Install globally on this machine:`);
    log(`     ${colors.cyan}npm install -g ./${tarballFilename}${colors.reset}\n`);
  } else {
    // Default: Install globally into local npm directory
    info(`Step 3/3: Installing into local global npm directory (${colors.bold}npm install -g ./${tarballFilename}${colors.reset})...`);
    try {
      run("npm", ["install", "-g", `./${tarballFilename}`]);
      success(`Successfully installed ${colors.bold}${pkgName}@${pkgVersion}${colors.reset} into your local npm global directory!\n`);

      // Resolve global npm root & prefix
      let globalRoot = "";
      let globalPrefix = "";
      try {
        const rootRes = run("npm", ["root", "-g"], { silent: true });
        globalRoot = rootRes.stdout.trim();
        const prefixRes = run("npm", ["prefix", "-g"], { silent: true });
        globalPrefix = prefixRes.stdout.trim();
      } catch {
        // Fallback
      }

      if (globalRoot) {
        const installedPkgDir = path.join(globalRoot, pkgName);
        log(`${colors.bold}Installed Directory:${colors.reset} ${colors.cyan}${installedPkgDir}${colors.reset}`);
        if (fs.existsSync(installedPkgDir)) {
          const contents = fs.readdirSync(installedPkgDir);
          log(`${colors.dim}Files in package: [ ${contents.join(", ")} ]${colors.reset}`);
        }
      }
      if (globalPrefix) {
        log(`${colors.bold}Global CLI Binaries:${colors.reset}  ${colors.cyan}${globalPrefix}${colors.reset} (mpg.cmd, mapigate.cmd)\n`);
      }

      // Verify installed CLI execution
      info("Verifying global command execution...");
      try {
        const verCheck = run("mpg", ["--version"], { silent: true });
        const installedVer = verCheck.stdout.trim();
        log(`Verified ${colors.bold}mpg --version${colors.reset}: ${colors.green}${installedVer}${colors.reset}`);
      } catch {
        try {
          const verCheck = run("mapigate", ["--version"], { silent: true });
          log(`Verified ${colors.bold}mapigate --version${colors.reset}: ${colors.green}${verCheck.stdout.trim()}${colors.reset}`);
        } catch {
          warn("CLI command is installed. If 'mpg' or 'mapigate' is not immediately recognized, open a new terminal session.");
        }
      }

      log(`\n${colors.bold}${colors.green}Ready to test!${colors.reset}`);
      log(`You can now run any of the following commands in any terminal:`);
      log(`  ${colors.cyan}mpg --help${colors.reset}          - View all available commands`);
      log(`  ${colors.cyan}mpg doctor${colors.reset}          - Health check runtime & SQLite`);
      log(`  ${colors.cyan}mpg start${colors.reset}           - Start gateway server on port 20127`);
      log(`  ${colors.cyan}mpg status${colors.reset}          - Check server status & RTK savings`);
      log(`\nTo uninstall this test version from local npm when done:`);
      log(`  ${colors.yellow}npm run local:uninstall${colors.reset}  (hoặc npm uninstall -g ${pkgName})\n`);

      // Clean up temporary tarball by default
      if (!args.includes("--keep-pack")) {
        try {
          if (fs.existsSync(tarballPath)) {
            fs.unlinkSync(tarballPath);
            info(`Cleaned up temporary tarball: ${tarballFilename}`);
          }
        } catch {
          // Ignore
        }
      }
    } catch (err) {
      error(`Global install failed: ${err.message}`);
      log(`You can still test manually with:`);
      log(`  ${colors.cyan}npm install -g ./${tarballFilename}${colors.reset}`);
      process.exit(1);
    }
  }
}

main().catch((err) => {
  error(`Unexpected error: ${err.message}`);
  process.exit(1);
});
