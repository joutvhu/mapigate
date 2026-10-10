import { Router } from "express";
import { LogRepository } from "../../storage/repositories/logRepo.js";

export const statsRouter = Router();

// GET token savings & aggregate stats
statsRouter.get("/", (_req, res) => {
  const summary = LogRepository.getTokenStats();
  res.json(summary);
});

// GET recent request logs
statsRouter.get("/logs", (req, res) => {
  const limit = Number(req.query.limit) || 50;
  const logs = LogRepository.getRecentLogs(limit);
  res.json(logs);
});
