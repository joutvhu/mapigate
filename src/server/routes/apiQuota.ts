import { Router } from "express";
import { QuotaService } from "../../core/usage/quotaService.js";
import { ProviderRepository } from "../../storage/repositories/providerRepo.js";

export const quotaRouter = Router();
const quotaService = QuotaService.getInstance();

// GET /api/quota - List cached/current quota for all accounts
quotaRouter.get("/", async (req, res) => {
  const force = req.query.force === "true";
  const cachedOnly = req.query.cached === "true";
  try {
    if (cachedOnly) {
      const cached = quotaService.getCachedQuotasForAllAccounts();
      res.json(cached);
      return;
    }
    const results = await quotaService.fetchQuotaForAllAccounts(force);
    res.json(results);
  } catch (err: any) {
    res.status(500).json({ error: err.message || "Failed to fetch quotas" });
  }
});

// GET /api/quota/:accountId - Force refresh quota for a specific account
quotaRouter.get("/:accountId", async (req, res) => {
  const { accountId } = req.params;
  const force = req.query.force !== "false";
  try {
    const result = await quotaService.fetchQuotaForAccount(accountId, force);
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message || "Failed to fetch account quota" });
  }
});

// POST /api/quota/batch-refresh - Force refresh for multiple accounts (or all)
quotaRouter.post("/batch-refresh", async (req, res) => {
  const { accountIds } = req.body || {};
  try {
    const results = await quotaService.batchRefresh(accountIds);
    res.json(results);
  } catch (err: any) {
    res.status(500).json({ error: err.message || "Failed to batch refresh quotas" });
  }
});

// PATCH /api/quota/toggle-batch - Bulk toggle accounts active/inactive (Turn off Empty / Turn on Available)
quotaRouter.patch("/toggle-batch", (req, res) => {
  const { accountIds, isActive } = req.body || {};
  if (!Array.isArray(accountIds) || typeof isActive !== "boolean") {
    res.status(400).json({ error: "accountIds must be an array and isActive must be boolean" });
    return;
  }

  try {
    quotaService.bulkToggle(accountIds, isActive);
    res.json({ success: true, count: accountIds.length, isActive });
  } catch (err: any) {
    res.status(500).json({ error: err.message || "Failed to bulk toggle accounts" });
  }
});

// PATCH /api/quota/accounts/:accountId/toggle - Toggle single account active state
quotaRouter.patch("/accounts/:accountId/toggle", (req, res) => {
  const { accountId } = req.params;
  const { isActive } = req.body || {};

  try {
    const nextState = quotaService.toggleAccount(accountId, isActive);
    res.json({ success: true, accountId, isActive: nextState });
  } catch (err: any) {
    res.status(500).json({ error: err.message || "Failed to toggle account" });
  }
});

// PUT /api/quota/accounts/:accountId - Update account details (name, API key, isActive, providerSpecificData)
quotaRouter.put("/accounts/:accountId", async (req, res) => {
  const { accountId } = req.params;
  const { name, apiKey, isActive, providerSpecificData } = req.body || {};

  try {
    const existing = ProviderRepository.getAccountById(accountId);
    if (!existing) {
      res.status(404).json({ error: "Account not found" });
      return;
    }

    ProviderRepository.updateAccount(accountId, {
      name,
      rawApiKey: apiKey !== undefined ? apiKey : undefined,
      isActive,
      providerSpecificData,
    });

    // Re-fetch updated quota for this account
    const updatedQuota = await quotaService.fetchQuotaForAccount(accountId, true);
    res.json({ success: true, account: updatedQuota });
  } catch (err: any) {
    res.status(500).json({ error: err.message || "Failed to update account" });
  }
});
