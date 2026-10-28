import { Router } from "express";
import { MasterAuth } from "../auth/masterAuth.js";
import { extractMasterToken } from "../middlewares/masterAuthMiddleware.js";

export const authRouter = Router();

interface LoginAttemptRecord {
  attempts: number;
  lockedUntil: number;
}

export const loginAttempts = new Map<string, LoginAttemptRecord>();
const MAX_LOGIN_ATTEMPTS = 5;
const LOGIN_LOCKOUT_MS = 60 * 1000; // 60 seconds lockout after 5 failed attempts
const MAX_ATTEMPTS_ENTRIES = 500;

function sweepExpiredAttempts(): void {
  const now = Date.now();
  for (const [ip, record] of loginAttempts.entries()) {
    if (record.lockedUntil > 0 && now >= record.lockedUntil) {
      loginAttempts.delete(ip);
    }
  }
}

function getAttempt(ip: string): LoginAttemptRecord | undefined {
  const attempt = loginAttempts.get(ip);
  if (!attempt) return undefined;
  if (attempt.lockedUntil > 0 && Date.now() >= attempt.lockedUntil) {
    loginAttempts.delete(ip);
    return undefined;
  }
  return attempt;
}

function getClientIp(req: any): string {
  return String(req.ip || req.socket?.remoteAddress || "127.0.0.1");
}

// GET /api/auth/status - Get master password status and authentication state
authRouter.get("/status", (req, res) => {
  try {
    const enabled = MasterAuth.isPasswordSet();
    if (!enabled) {
      return res.json({
        enabled: false,
        authenticated: true,
      });
    }

    const token = extractMasterToken(req);
    const authenticated = token ? MasterAuth.verifySessionToken(token) : false;

    res.json({
      enabled: true,
      authenticated,
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message || "Failed to get auth status" });
  }
});

// POST /api/auth/login - Verify master password and generate session token
authRouter.post("/login", async (req, res) => {
  try {
    const clientIp = getClientIp(req);
    const now = Date.now();
    const attempt = getAttempt(clientIp);

    if (attempt && attempt.lockedUntil > now) {
      const waitSec = Math.ceil((attempt.lockedUntil - now) / 1000);
      return res.status(429).json({
        error: `Too many failed login attempts. Please wait ${waitSec}s before retrying.`,
        code: "RATE_LIMITED",
      });
    }

    if (loginAttempts.size > MAX_ATTEMPTS_ENTRIES) {
      sweepExpiredAttempts();
    }

    const { password } = req.body || {};
    if (!MasterAuth.isPasswordSet()) {
      return res.json({
        success: true,
        message: "No master password configured",
        token: "",
      });
    }

    if (!password || typeof password !== "string") {
      return res.status(400).json({
        error: "Password is required",
        code: "PASSWORD_REQUIRED",
      });
    }

    const isValid = await MasterAuth.verifyPassword(password);
    if (!isValid) {
      const currentAttempts = (attempt?.attempts || 0) + 1;
      const isLocked = currentAttempts >= MAX_LOGIN_ATTEMPTS;
      loginAttempts.set(clientIp, {
        attempts: currentAttempts,
        lockedUntil: isLocked ? now + LOGIN_LOCKOUT_MS : 0,
      });

      return res.status(401).json({
        error: "Invalid master password",
        code: "INVALID_PASSWORD",
        remainingAttempts: Math.max(0, MAX_LOGIN_ATTEMPTS - currentAttempts),
      });
    }

    // Success: clear failed attempts
    loginAttempts.delete(clientIp);

    const token = MasterAuth.createSessionToken();
    res.json({
      success: true,
      token,
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message || "Login failed" });
  }
});

// POST /api/auth/logout - Logout current session
authRouter.post("/logout", (_req, res) => {
  res.json({ success: true, message: "Logged out successfully" });
});

// POST /api/auth/setup - Initialize master password
authRouter.post("/setup", async (req, res) => {
  try {
    if (MasterAuth.isPasswordSet()) {
      return res.status(400).json({
        error: "Master password is already configured. Use change-password instead.",
        code: "ALREADY_CONFIGURED",
      });
    }

    const { password } = req.body || {};
    if (!password || typeof password !== "string" || password.length < 4) {
      return res.status(400).json({
        error: "Password must be at least 4 characters long",
        code: "INVALID_PASSWORD_LENGTH",
      });
    }

    await MasterAuth.setPassword(password);
    const token = MasterAuth.createSessionToken();

    res.json({
      success: true,
      message: "Master password configured successfully",
      token,
    });
  } catch (error: any) {
    res.status(400).json({ error: error.message || "Failed to setup master password" });
  }
});

// PUT /api/auth/change-password - Change existing master password
authRouter.put("/change-password", async (req, res) => {
  try {
    if (!MasterAuth.isPasswordSet()) {
      return res.status(400).json({
        error: "Master password is not configured",
        code: "NOT_CONFIGURED",
      });
    }

    const { currentPassword, newPassword } = req.body || {};
    if (!currentPassword || !newPassword) {
      return res.status(400).json({
        error: "Current password and new password are required",
        code: "MISSING_PASSWORDS",
      });
    }

    if (typeof newPassword !== "string" || newPassword.length < 4) {
      return res.status(400).json({
        error: "New password must be at least 4 characters long",
        code: "INVALID_PASSWORD_LENGTH",
      });
    }

    const success = await MasterAuth.changePassword(currentPassword, newPassword);
    if (!success) {
      return res.status(401).json({
        error: "Incorrect current password",
        code: "INVALID_CURRENT_PASSWORD",
      });
    }

    const token = MasterAuth.createSessionToken();
    res.json({
      success: true,
      message: "Master password updated successfully",
      token,
    });
  } catch (error: any) {
    res.status(400).json({ error: error.message || "Failed to change master password" });
  }
});

// DELETE /api/auth/remove-password - Disable master password
authRouter.delete("/remove-password", async (req, res) => {
  try {
    if (!MasterAuth.isPasswordSet()) {
      return res.status(400).json({
        error: "Master password is not configured",
        code: "NOT_CONFIGURED",
      });
    }

    const { currentPassword } = req.body || {};
    if (!currentPassword) {
      return res.status(400).json({
        error: "Current password is required to disable master password",
        code: "MISSING_PASSWORD",
      });
    }

    const success = await MasterAuth.removePassword(currentPassword);
    if (!success) {
      return res.status(401).json({
        error: "Incorrect current password",
        code: "INVALID_CURRENT_PASSWORD",
      });
    }

    res.json({
      success: true,
      message: "Master password removed successfully",
    });
  } catch (error: any) {
    res.status(400).json({ error: error.message || "Failed to remove master password" });
  }
});
