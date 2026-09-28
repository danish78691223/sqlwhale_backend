import { Router, type Request, type Response } from "express";
import db from "../config/database";
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

router.get("/query-history", (req: Request, res: Response) => {
  const user = getCurrentUser(req);

  if (!user) {
    res.status(401).json({
      success: false,
      authenticated: false,
      error: "Authentication required.",
    });
    return;
  }

  const rawLimit = Number(req.query.limit);
  const limit = Number.isInteger(rawLimit)
    ? Math.min(Math.max(rawLimit, 1), 100)
    : 50;

  const rows = db.prepare(`
    SELECT
      id,
      query,
      command,
      status,
      execution_time_ms AS executionTimeMs,
      rows_returned AS rowsReturned,
      error_message AS errorMessage,
      created_at AS createdAt
    FROM query_history
    WHERE webxwhale_user_id = ?
    ORDER BY id DESC
    LIMIT ?
  `).all(user.webxwhaleUserId, limit);

  res.json({ success: true, history: rows });
});



router.get("/learning-dashboard", (req: Request, res: Response) => {
  const user = getCurrentUser(req);

  if (!user) {
    res.status(401).json({
      success: false,
      authenticated: false,
      error: "Authentication required.",
    });
    return;
  }

  const stats = db.prepare(`
    SELECT
      COUNT(*) AS totalQueries,
      COALESCE(SUM(CASE WHEN status = 'success' THEN 1 ELSE 0 END), 0) AS successfulQueries,
      COALESCE(SUM(CASE WHEN status = 'error' THEN 1 ELSE 0 END), 0) AS failedQueries,
      COALESCE(ROUND(AVG(execution_time_ms)), 0) AS averageExecutionTimeMs,
      COALESCE(SUM(CASE WHEN status = 'success' THEN rows_returned ELSE 0 END), 0) AS totalRowsReturned
    FROM query_history
    WHERE webxwhale_user_id = ?
  `).get(user.webxwhaleUserId) as {
    totalQueries: number;
    successfulQueries: number;
    failedQueries: number;
    averageExecutionTimeMs: number;
    totalRowsReturned: number;
  };

  const progress = db.prepare(`
    SELECT section_id AS sectionId, completed_at AS completedAt
    FROM learning_progress
    WHERE webxwhale_user_id = ?
    ORDER BY completed_at DESC
  `).all(user.webxwhaleUserId);

  const lastActivity = db.prepare(`
    SELECT MAX(activity_date) AS lastActivity
    FROM learning_activity
    WHERE webxwhale_user_id = ?
  `).get(user.webxwhaleUserId) as { lastActivity: string | null };

  const activityDates = db.prepare(`
    SELECT activity_date AS activityDate
    FROM learning_activity
    WHERE webxwhale_user_id = ?
    ORDER BY activity_date DESC
    LIMIT 365
  `).all(user.webxwhaleUserId) as Array<{ activityDate: string }>;

  const activitySet = new Set(activityDates.map((item) => item.activityDate));
  let streak = 0;
  const cursor = new Date();
  cursor.setUTCHours(0, 0, 0, 0);

  while (activitySet.has(cursor.toISOString().slice(0, 10))) {
    streak += 1;
    cursor.setUTCDate(cursor.getUTCDate() - 1);
  }

  const totalConcepts = 20;
  const completedConcepts = progress.length;
  const successRate = stats.totalQueries > 0
    ? Math.round((stats.successfulQueries / stats.totalQueries) * 100)
    : 0;

  res.json({
    success: true,
    stats: {
      totalQueries: stats.totalQueries,
      successfulQueries: stats.successfulQueries,
      failedQueries: stats.failedQueries,
      successRate,
      averageExecutionTimeMs: stats.averageExecutionTimeMs,
      totalRowsReturned: stats.totalRowsReturned,
      completedConcepts,
      totalConcepts,
      progressPercent: Math.round((completedConcepts / totalConcepts) * 100),
      learningStreak: streak,
      lastActivity: lastActivity.lastActivity,
    },
    progress,
  });
});

router.get("/learning-progress", (req: Request, res: Response) => {
  const user = getCurrentUser(req);

  if (!user) {
    res.status(401).json({
      success: false,
      authenticated: false,
      error: "Authentication required.",
    });
    return;
  }

  const progress = db.prepare(`
    SELECT section_id AS sectionId, completed_at AS completedAt
    FROM learning_progress
    WHERE webxwhale_user_id = ?
    ORDER BY completed_at DESC
  `).all(user.webxwhaleUserId);

  res.json({ success: true, progress });
});

router.post("/learning-progress/:sectionId", (req: Request, res: Response) => {
  const user = getCurrentUser(req);
  const sectionId = typeof req.params.sectionId === "string"
    ? req.params.sectionId.trim()
    : "";

  if (!user) {
    res.status(401).json({
      success: false,
      authenticated: false,
      error: "Authentication required.",
    });
    return;
  }

  if (!sectionId || !/^[a-z0-9-]+$/.test(sectionId)) {
    res.status(400).json({
      success: false,
      error: "Invalid learning section.",
    });
    return;
  }

  db.prepare(`
    INSERT OR IGNORE INTO learning_progress
      (webxwhale_user_id, section_id)
    VALUES (?, ?)
  `).run(user.webxwhaleUserId, sectionId);

  const progress = db.prepare(`
    SELECT section_id AS sectionId, completed_at AS completedAt
    FROM learning_progress
    WHERE webxwhale_user_id = ? AND section_id = ?
  `).get(user.webxwhaleUserId, sectionId);

  res.status(200).json({ success: true, progress });
});

router.post("/logout", (req: Request, res: Response) => {
  logoutWebXWhale(req, res);
  res.json({ success: true });
});

export default router;
