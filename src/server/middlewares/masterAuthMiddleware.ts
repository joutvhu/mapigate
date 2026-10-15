import type { Request, Response, NextFunction } from "express";
import { MasterAuth } from "../auth/masterAuth.js";

/**
 * Extract master session token from Authorization or custom header
 */
export function extractMasterToken(req: Request): string | null {
  const authHeader = req.headers["authorization"];
  if (typeof authHeader === "string" && authHeader.trim()) {
    if (authHeader.startsWith("Bearer ")) {
      return authHeader.slice(7).trim();
    }
    return authHeader.trim();
  }
  const customHeader = req.headers["x-master-token"];
  if (typeof customHeader === "string" && customHeader.trim()) {
    return customHeader.trim();
  }
  return null;
}

/**
 * Middleware that guards management /api/* routes when master password protection is enabled.
 * If no master password is set, all requests pass through freely (zero friction).
 * Public endpoints like /api/auth/status and /api/auth/login are always exempt.
 */
export function masterAuthMiddleware(req: Request, res: Response, next: NextFunction): void {
  // If master password is not configured, everything passes
  if (!MasterAuth.isPasswordSet()) {
    return next();
  }

  // Exempt public auth endpoints
  const path = req.originalUrl ? req.originalUrl.split("?")[0] : req.path;
  if (path === "/api/auth/status" || path === "/api/auth/login" || path === "/api/auth/logout") {
    return next();
  }

  const token = extractMasterToken(req);
  if (token && MasterAuth.verifySessionToken(token)) {
    return next();
  }

  res.status(401).json({
    error: "Master password authorization required",
    code: "AUTH_REQUIRED",
  });
}
