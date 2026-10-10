import { Router } from "express";
import { MitmRepository } from "../../storage/repositories/mitmRepo.js";

export const mitmRouter = Router();

// GET MITM status
mitmRouter.get("/status", (_req, res) => {
  res.json({
    running: MitmRepository.getMitmServerRunning(),
    certExists: true,
    certTrusted: true,
    serverOk: true,
    dnsStatus: MitmRepository.getAllToolDnsStatus(),
    routerBaseUrl: "http://localhost:20127",
  });
});

// POST toggle MITM server
mitmRouter.post("/toggle-server", (req, res) => {
  let isRunning: boolean;
  if (req.body.running !== undefined) {
    isRunning = Boolean(req.body.running);
  } else {
    isRunning = !MitmRepository.getMitmServerRunning();
  }
  MitmRepository.setMitmServerRunning(isRunning);
  res.json({ running: isRunning });
});

// POST toggle DNS redirection for an IDE / tool
mitmRouter.post("/toggle-dns", (req, res) => {
  const tool = req.body.tool || req.body.ide;
  if (!tool || typeof tool !== "string") {
    res.status(400).json({ error: "Missing tool or ide parameter" });
    return;
  }
  const toolKey = tool.toLowerCase();
  const currentStatus = MitmRepository.getToolDnsStatus(toolKey);
  const newStatus = req.body.active !== undefined ? Boolean(req.body.active) : !currentStatus;

  MitmRepository.setToolDnsStatus(toolKey, newStatus);
  const allDnsStatus = MitmRepository.getAllToolDnsStatus();

  res.json({
    tool: toolKey,
    ide: toolKey,
    active: newStatus,
    dnsStatus: allDnsStatus,
  });
});

// Per-tool Hosts endpoints
mitmRouter.post("/hosts/:tool/reset", (req, res) => {
  const { tool } = req.params;
  const entries = MitmRepository.resetToolHosts(tool);
  res.json({ success: true, tool, entries });
});

mitmRouter.get("/hosts/:tool", (req, res) => {
  const { tool } = req.params;
  const entries = MitmRepository.getToolHosts(tool);
  res.json({ tool, entries });
});

mitmRouter.post("/hosts/:tool", (req, res) => {
  const { tool } = req.params;
  const { entries } = req.body;
  if (typeof entries === "string") {
    MitmRepository.saveToolHosts(tool, entries);
  }
  res.json({ success: true, tool, entries: MitmRepository.getToolHosts(tool) });
});

// Legacy backward-compatible hosts endpoints
mitmRouter.get("/hosts", (_req, res) => {
  const entries = MitmRepository.getHostsEntries();
  res.json({ entries });
});

mitmRouter.post("/hosts", (req, res) => {
  const { entries } = req.body;
  if (typeof entries === "string") {
    MitmRepository.saveHostsEntries(entries);
  }
  res.json({ success: true, entries: MitmRepository.getHostsEntries() });
});

mitmRouter.post("/hosts/reset", (_req, res) => {
  const entries = MitmRepository.resetHostsEntries();
  res.json({ success: true, entries });
});

// GET mappings for an IDE / tool
mitmRouter.get("/mappings/:ide", (req, res) => {
  const mappings = MitmRepository.getMappings(req.params.ide);
  res.json(mappings);
});

// POST update mapping
mitmRouter.post("/mappings", (req, res) => {
  const { ide, sourceModel, targetModel } = req.body;
  if (!ide || !sourceModel || !targetModel) {
    res.status(400).json({ error: "Missing required mapping fields" });
    return;
  }
  MitmRepository.updateMapping(ide, sourceModel, targetModel);
  res.json({ success: true });
});

// POST reset mappings to default
mitmRouter.post("/mappings/reset", (req, res) => {
  const ide = req.body.ide || req.body.tool || "kiro";
  const mappings = MitmRepository.resetMappings(ide);
  res.json({ success: true, ide, mappings });
});

// DELETE mapping: supports query parameter (?sourceModel=...), request body ({ sourceModel }), and path parameter
mitmRouter.delete("/mappings/:ide", (req, res) => {
  const ide = req.params.ide;
  const sourceModel = (req.query.sourceModel as string) || req.body?.sourceModel;
  if (!sourceModel) {
    res.status(400).json({ error: "Missing sourceModel parameter" });
    return;
  }
  MitmRepository.deleteMapping(ide, sourceModel);
  res.json({ success: true });
});

mitmRouter.delete("/mappings/:ide/*", (req, res) => {
  const ide = req.params.ide;
  const sourceModel = (req.params as any)[0] || (req.params as any).sourceModel;
  if (!sourceModel) {
    res.status(400).json({ error: "Missing sourceModel parameter" });
    return;
  }
  MitmRepository.deleteMapping(ide, sourceModel);
  res.json({ success: true });
});
