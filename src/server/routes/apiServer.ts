import { Router, type Request, type Response } from "express";
import { spawn } from "node:child_process";
import { serverLifecycle } from "../lifecycle.js";
import { checkForUpdates } from "../../shared/utils/versionChecker.js";
import { APP_NAME, APP_VERSION } from "../../shared/constants/index.js";

export const serverRouter = Router();

let isUpgradeInProgress = false;

export const handleShutdownRequest = async (_req: Request, res: Response): Promise<void> => {
  res.json({
    success: true,
    message: "Mapigate server is shutting down...",
  });

  const isTest =
    process.env.NODE_ENV === "test" ||
    Boolean(process.env.NODE_TEST_CONTEXT) ||
    process.argv.some((arg) => arg.includes("test"));

  // Gracefully initiate server shutdown after flushing HTTP response
  serverLifecycle.shutdownServer({ delayMs: 150, exitProcess: !isTest }).catch((err) => {
    console.error("[Lifecycle] Server shutdown error:", err);
  });
};

export const handleRestartRequest = async (_req: Request, res: Response): Promise<void> => {
  res.json({
    success: true,
    message: "Mapigate server is restarting...",
  });

  const isTest =
    process.env.NODE_ENV === "test" ||
    Boolean(process.env.NODE_TEST_CONTEXT) ||
    process.argv.some((arg) => arg.includes("test"));

  // Gracefully initiate server restart after flushing HTTP response
  serverLifecycle.restartServer({ delayMs: 150, exitProcess: !isTest }).catch((err) => {
    console.error("[Lifecycle] Server restart error:", err);
  });
};

export const handleUpgradeRequest = async (req: Request, res: Response): Promise<void> => {
  if (isUpgradeInProgress) {
    res.status(409).json({
      success: false,
      error: "An upgrade is already in progress.",
    });
    return;
  }

  isUpgradeInProgress = true;

  const isTest =
    process.env.NODE_ENV === "test" ||
    Boolean(process.env.NODE_TEST_CONTEXT) ||
    process.argv.some((arg) => arg.includes("test"));

  try {
    if (isTest && req.body?.mockTest) {
      isUpgradeInProgress = false;
      res.json({
        success: true,
        message: "Test upgrade completed successfully.",
        fromVersion: APP_VERSION,
        toVersion: req.body.mockVersion || "99.9.9",
      });
      return;
    }

    const updateInfo = await checkForUpdates(true);

    if (!updateInfo.latestVersion) {
      isUpgradeInProgress = false;
      res.status(502).json({
        success: false,
        error: "Could not fetch latest version from npm registry. Please check your internet connection.",
      });
      return;
    }

    if (!updateInfo.hasUpdate && !req.body?.force) {
      isUpgradeInProgress = false;
      res.json({
        success: true,
        message: `You are already running the latest version of ${APP_NAME} (v${APP_VERSION}).`,
        currentVersion: APP_VERSION,
        latestVersion: updateInfo.latestVersion,
        alreadyLatest: true,
      });
      return;
    }

    const target = `mapigate@${updateInfo.latestVersion}`;
    const isWindows = process.platform === "win32";
    const npmCmd = isWindows ? "npm.cmd" : "npm";

    await new Promise<void>((resolve, reject) => {
      let stderr = "";
      let stdout = "";

      const child = spawn(npmCmd, ["install", "-g", target], {
        shell: isWindows,
        windowsHide: true,
      });

      child.stdout?.on("data", (data) => {
        stdout += data.toString();
        if (stdout.length > 4000) stdout = stdout.slice(-4000);
      });

      child.stderr?.on("data", (data) => {
        stderr += data.toString();
        if (stderr.length > 4000) stderr = stderr.slice(-4000);
      });

      const timer = setTimeout(() => {
        try {
          child.kill();
        } catch {}
        reject(new Error("Upgrade timed out after 180 seconds."));
      }, 180000);

      child.on("close", (code) => {
        clearTimeout(timer);
        if (code === 0) {
          resolve();
        } else {
          const detail = (stderr || stdout).trim();
          reject(new Error(`Upgrade failed with exit code ${code}${detail ? `: ${detail}` : ""}`));
        }
      });

      child.on("error", (err) => {
        clearTimeout(timer);
        reject(err);
      });
    });

    isUpgradeInProgress = false;

    res.json({
      success: true,
      message: `Successfully upgraded ${APP_NAME} to v${updateInfo.latestVersion}! Server is restarting...`,
      fromVersion: APP_VERSION,
      toVersion: updateInfo.latestVersion,
    });

    // Gracefully restart the server to load newly installed package
    serverLifecycle.restartServer({ delayMs: 400, exitProcess: !isTest }).catch((err) => {
      console.error("[Lifecycle] Server restart after upgrade error:", err);
    });
  } catch (err: any) {
    isUpgradeInProgress = false;
    res.status(500).json({
      success: false,
      error: err?.message || "Failed to upgrade Mapigate.",
    });
  }
};

serverRouter.post("/shutdown", handleShutdownRequest);
serverRouter.post("/restart", handleRestartRequest);
serverRouter.post("/upgrade", handleUpgradeRequest);
