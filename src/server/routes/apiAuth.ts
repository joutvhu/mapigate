import { Router } from "express";
import { MasterAuth } from "../auth/masterAuth.js";
import { extractMasterToken } from "../middlewares/masterAuthMiddleware.js";

export const authRouter = Router();

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
      return res.status(401).json({
        error: "Invalid master password",
        code: "INVALID_PASSWORD",
      });
    }

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
