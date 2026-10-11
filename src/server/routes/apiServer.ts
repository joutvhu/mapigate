import { Router, type Request, type Response } from "express";
import { serverLifecycle } from "../lifecycle.js";

export const serverRouter = Router();

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

serverRouter.post("/shutdown", handleShutdownRequest);
