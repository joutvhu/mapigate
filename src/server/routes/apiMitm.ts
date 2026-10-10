import { Router } from "express";
import { MitmRepository } from "../../storage/repositories/mitmRepo.js";

export const mitmRouter = Router();

// Internal state for MITM status & per-tool DNS
let isMitmRunning = true;
const toolDnsStatus: Record<string, boolean> = {
  antigravity: false,
  kiro: true,
  copilot: false,
};

// GET MITM status
mitmRouter.get("/status", (_req, res) => {
  res.json({
    running: isMitmRunning,
    certExists: true,
    certTrusted: true,
    serverOk: true,
    dnsStatus: toolDnsStatus,
    routerBaseUrl: "http://localhost:20127",
  });
});

// POST toggle MITM server
mitmRouter.post("/toggle-server", (req, res) => {
  if (req.body.running !== undefined) {
    isMitmRunning = Boolean(req.body.running);
  } else {
    isMitmRunning = !isMitmRunning;
  }
  res.json({ running: isMitmRunning });
});

// POST toggle DNS redirection for an IDE / tool
mitmRouter.post("/toggle-dns", (req, res) => {
  const tool = req.body.tool || req.body.ide;
  if (!tool || typeof tool !== "string") {
    res.status(400).json({ error: "Missing tool or ide parameter" });
    return;
  }
  const toolKey = tool.toLowerCase();
  if (!(toolKey in toolDnsStatus)) {
    toolDnsStatus[toolKey] = false;
  }
  if (req.body.active !== undefined) {
    toolDnsStatus[toolKey] = Boolean(req.body.active);
  } else {
    toolDnsStatus[toolKey] = !toolDnsStatus[toolKey];
  }
  res.json({
    tool: toolKey,
    ide: toolKey,
    active: toolDnsStatus[toolKey],
    dnsStatus: toolDnsStatus,
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

// DELETE mapping
mitmRouter.delete("/mappings/:ide/:sourceModel", (req, res) => {
  MitmRepository.deleteMapping(req.params.ide, req.params.sourceModel);
  res.json({ success: true });
});
