import { Router, type Request, type Response } from "express";
import { UsageRepository, usageEventEmitter } from "../../storage/repositories/usageRepo.js";
import { RequestDetailsRepository } from "../../storage/repositories/requestDetailsRepo.js";

export const usageRouter = Router();

const VALID_PERIODS = new Set(["today", "24h", "7d", "30d", "60d", "90d", "all"]);

// GET /api/usage/stats?period=today|24h|7d|30d|60d|all
usageRouter.get("/stats", (req: Request, res: Response) => {
  try {
    const periodParam = String(req.query.period || "7d").toLowerCase();
    const period = VALID_PERIODS.has(periodParam) ? periodParam : "7d";
    const stats = UsageRepository.getUsageStats(period);
    res.json(stats);
  } catch (error: any) {
    console.error("[apiUsage] Failed to get usage stats:", error);
    res.status(500).json({ error: "Failed to fetch usage stats" });
  }
});

// GET /api/usage/chart?period=today|24h|7d|30d|60d|all
usageRouter.get("/chart", (req: Request, res: Response) => {
  try {
    const periodParam = String(req.query.period || "7d").toLowerCase();
    const period = VALID_PERIODS.has(periodParam) ? periodParam : "7d";
    const chartData = UsageRepository.getChartData(period);
    res.json(chartData);
  } catch (error: any) {
    console.error("[apiUsage] Failed to get chart data:", error);
    res.status(500).json({ error: "Failed to fetch chart data" });
  }
});

// GET /api/usage/request-details
usageRouter.get("/request-details", (req: Request, res: Response) => {
  try {
    const page = Math.max(1, parseInt(String(req.query.page), 10) || 1);
    const pageSize = Math.min(100, Math.max(1, parseInt(String(req.query.pageSize), 10) || 20));
    const provider = req.query.provider ? String(req.query.provider) : undefined;
    const model = req.query.model ? String(req.query.model) : undefined;
    const status = req.query.status ? String(req.query.status) : undefined;
    const search = req.query.search ? String(req.query.search) : undefined;
    const startDate = req.query.startDate ? String(req.query.startDate) : undefined;
    const endDate = req.query.endDate ? String(req.query.endDate) : undefined;

    const result = RequestDetailsRepository.getRequestDetails({
      page,
      pageSize,
      provider,
      model,
      status,
      search,
      startDate,
      endDate,
    });

    res.json(result);
  } catch (error: any) {
    console.error("[apiUsage] Failed to get request details:", error);
    res.status(500).json({ error: "Failed to fetch request details" });
  }
});

// GET /api/usage/providers
usageRouter.get("/providers", (_req: Request, res: Response) => {
  try {
    const providers = RequestDetailsRepository.getDistinctProviders();
    res.json(providers);
  } catch (error: any) {
    console.error("[apiUsage] Failed to get distinct providers:", error);
    res.status(500).json({ error: "Failed to fetch providers" });
  }
});

// GET /api/usage/request-details/:id
usageRouter.get("/request-details/:id", (req: Request, res: Response) => {
  try {
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    if (!id) {
      res.status(400).json({ error: "Missing id parameter" });
      return;
    }
    const detail = RequestDetailsRepository.getRequestDetailById(id);
    if (!detail) {
      res.status(404).json({ error: "Request detail not found" });
      return;
    }
    res.json(detail);
  } catch (error: any) {
    console.error("[apiUsage] Failed to get request detail by id:", error);
    res.status(500).json({ error: "Failed to fetch request detail" });
  }
});

// GET /api/usage/stream - Real-time SSE Telemetry
usageRouter.get("/stream", (req: Request, res: Response) => {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");

  const rawPeriod = String(req.query.period || "7d").toLowerCase();
  const period = VALID_PERIODS.has(rawPeriod) ? rawPeriod : "7d";

  let isClosed = false;
  let cachedStats: any = null;

  const sendEvent = (event: string, data: any) => {
    if (isClosed) return;
    try {
      res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    } catch {
      isClosed = true;
    }
  };

  const handleUpdate = () => {
    if (isClosed) return;
    try {
      const stats = UsageRepository.getUsageStats(period);
      cachedStats = stats;
      sendEvent("stats", stats);
    } catch {}
  };

  const handlePending = () => {
    if (isClosed) return;
    try {
      const activeRequests = UsageRepository.getActiveRequests();
      sendEvent("pending", { activeRequests });
    } catch {}
  };

  // Push immediate initial stats
  try {
    cachedStats = UsageRepository.getUsageStats(period);
    sendEvent("stats", cachedStats);
  } catch {}

  usageEventEmitter.on("update", handleUpdate);
  usageEventEmitter.on("pending", handlePending);

  const keepAlive = setInterval(() => {
    if (isClosed) {
      clearInterval(keepAlive);
      return;
    }
    try {
      res.write(": keep-alive\n\n");
    } catch {
      isClosed = true;
      clearInterval(keepAlive);
    }
  }, 20_000);

  req.on("close", () => {
    isClosed = true;
    clearInterval(keepAlive);
    usageEventEmitter.off("update", handleUpdate);
    usageEventEmitter.off("pending", handlePending);
  });
});
