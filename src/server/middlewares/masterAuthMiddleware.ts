import type { Request, Response, NextFunction } from "express";
import { MasterAuth } from "../auth/masterAuth.js";

/**
 * Extract master session token from Authorization header, custom header, or query param
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
  const queryToken = req.query?.token;
  if (typeof queryToken === "string" && queryToken.trim()) {
    return queryToken.trim();
  }
  return null;
}

/**
 * Middleware that guards management /api/* routes when master password protection is enabled.
 * If no master password is set, all requests pass through freely (zero friction).
 */
export function masterAuthMiddleware(req: Request, res: Response, next: NextFunction): void {
  // If master password is not configured, everything passes
  if (!MasterAuth.isPasswordSet()) {
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
