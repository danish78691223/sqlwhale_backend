import { Router, type Request, type Response } from "express";
import {
  beginWebXWhaleLogin,
  completeWebXWhaleLogin,
  getCurrentUser,
  logoutWebXWhale,
} from "../services/webxwhaleAuth";

const router = Router();

router.get("/webxwhale/start", (req: Request, res: Response) => {
  try {
    beginWebXWhaleLogin(req, res);
  } catch (error) {
    console.error("WEBXWHALE OAuth start error:", error);
    res.status(500).json({ success: false, error: "Unable to start WEBXWHALE login." });
  }
});

router.get("/webxwhale/callback", async (req: Request, res: Response) => {
  const code = typeof req.query.code === "string" ? req.query.code : "";
  const state = typeof req.query.state === "string" ? req.query.state : null;
  const oauthError = typeof req.query.error === "string" ? req.query.error : null;

  if (oauthError) {
    res.redirect(
      `${process.env.FRONTEND_URL || "http://localhost:3000"}/login?error=oauth_cancelled`
    );
    return;
  }

  if (!code) {
    res.redirect(
      `${process.env.FRONTEND_URL || "http://localhost:3000"}/login?error=missing_code`
    );
    return;
  }

  try {
    const frontendUrl = await completeWebXWhaleLogin(req, res, code, state);
    res.redirect(`${frontendUrl}/`);
  } catch (error) {
    console.error("WEBXWHALE OAuth callback error:", error);
    res.redirect(
      `${process.env.FRONTEND_URL || "http://localhost:3000"}/login?error=oauth_failed`
    );
  }
});

router.get("/me", (req: Request, res: Response) => {
  const user = getCurrentUser(req);

  if (!user) {
    res.status(401).json({ success: false, authenticated: false });
    return;
  }

  res.json({ success: true, authenticated: true, user });
});

router.post("/logout", (req: Request, res: Response) => {
  logoutWebXWhale(req, res);
  res.json({ success: true });
});

export default router;
