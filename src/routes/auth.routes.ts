import { Router, type Request, type Response } from "express";
import db from "../config/database";
import crypto from "crypto";
import {
  beginWebXWhaleLogin,
  completeWebXWhaleLogin,
  getCurrentUser,
  logoutWebXWhale,
} from "../services/webxwhaleAuth";
import { getLocalUser, clearLocalSession } from "../services/localAuth";


const LOCAL_SESSION_COOKIE = "sqlwhale_local_session";
const LOCAL_SESSION_DAYS = 30;

function localCookieOptions(maxAge: number): string {
  return [
    `Max-Age=${Math.floor(maxAge / 1000)}`,
    "Path=/",
    "HttpOnly",
    process.env.NODE_ENV === "production" ? "Secure" : "",
    process.env.NODE_ENV === "production" ? "SameSite=None" : "SameSite=Lax",
  ].filter(Boolean).join("; ");
}

function readAuthCookie(req: Request, name: string): string | null {
  const header = req.headers.cookie || "";
  for (const part of header.split(";")) {
    const [key, ...value] = part.trim().split("=");
    if (key === name) return decodeURIComponent(value.join("="));
  }
  return null;
}

function passwordHash(password: string): string {
  return crypto.scryptSync(password, "sqlwhale-local-auth", 64).toString("hex");
}

function localUser(req: Request) {
  const token = readAuthCookie(req, LOCAL_SESSION_COOKIE);
  if (!token) return null;

  return db.prepare(`
    SELECT id, local_user_id AS localUserId, name, email, role, current_plan AS currentPlan
    FROM sqlwhale_local_users
    WHERE local_user_id = (
      SELECT local_user_id
      FROM local_auth_sessions
      WHERE session_hash = ? AND expires_at > CURRENT_TIMESTAMP
      LIMIT 1
    )
  `).get(passwordHash(token)) as
    | { id: number; localUserId: string; name: string; email: string; role: string; currentPlan: string }
    | undefined || null;
}

function createLocalSession(res: Response, localUserId: string) {
  const token = crypto.randomBytes(48).toString("base64url");
  const hash = passwordHash(token);
  const expiresAt = new Date(Date.now() + LOCAL_SESSION_DAYS * 86400000).toISOString();

  db.prepare(`
    INSERT INTO local_auth_sessions (session_hash, local_user_id, expires_at)
    VALUES (?, ?, ?)
  `).run(hash, localUserId, expiresAt);

  res.setHeader("Set-Cookie",
    `${LOCAL_SESSION_COOKIE}=${encodeURIComponent(token)}; ${localCookieOptions(LOCAL_SESSION_DAYS * 86400000)}`
  );
}


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


router.post("/local/signup", (req: Request, res: Response) => {
  const name = typeof req.body?.name === "string" ? req.body.name.trim() : "";
  const email = typeof req.body?.email === "string" ? req.body.email.trim().toLowerCase() : "";
  const password = typeof req.body?.password === "string" ? req.body.password : "";

  if (name.length < 2 || !/^\S+@\S+\.\S+$/.test(email) || password.length < 8) {
    res.status(400).json({ success: false, error: "Name, valid email and an 8+ character password are required." });
    return;
  }

  const existing = db.prepare("SELECT id FROM sqlwhale_local_users WHERE email = ?").get(email);
  if (existing) {
    res.status(409).json({ success: false, error: "A SQLWhale account with this email already exists." });
    return;
  }

  const localUserId = `sqlwhale_${crypto.randomBytes(16).toString("hex")}`;
  db.prepare(`
    INSERT INTO sqlwhale_local_users
      (local_user_id, name, email, password_hash)
    VALUES (?, ?, ?, ?)
  `).run(localUserId, name, email, passwordHash(password));

  createLocalSession(res, localUserId);
  res.status(201).json({ success: true, accountType: "sqlwhale" });
});

router.post("/local/login", (req: Request, res: Response) => {
  const email = typeof req.body?.email === "string" ? req.body.email.trim().toLowerCase() : "";
  const password = typeof req.body?.password === "string" ? req.body.password : "";

  const account = db.prepare(`
    SELECT local_user_id AS localUserId, name, email, role, current_plan AS currentPlan
    FROM sqlwhale_local_users
    WHERE email = ? AND password_hash = ?
    LIMIT 1
  `).get(email, passwordHash(password)) as
    | { localUserId: string; name: string; email: string; role: string; currentPlan: string }
    | undefined;

  if (!account) {
    res.status(401).json({ success: false, error: "Invalid SQLWhale email or password." });
    return;
  }

  createLocalSession(res, account.localUserId);
  res.json({ success: true, authenticated: true, user: account, accountType: "sqlwhale" });
});

router.get("/local/me", (req: Request, res: Response) => {
  const user = localUser(req);
  if (!user) {
    res.status(401).json({ success: false, authenticated: false });
    return;
  }
  res.json({ success: true, authenticated: true, user, accountType: "sqlwhale" });
});

router.post("/local/logout", (req: Request, res: Response) => {
  const token = readAuthCookie(req, LOCAL_SESSION_COOKIE);
  if (token) {
    db.prepare("DELETE FROM local_auth_sessions WHERE session_hash = ?").run(passwordHash(token));
  }
  res.setHeader("Set-Cookie", `${LOCAL_SESSION_COOKIE}=; ${localCookieOptions(0)}`);
  res.json({ success: true });
});

router.get("/me", (req: Request, res: Response) => {
  const user = getCurrentUser(req);
  const local = getLocalUser(req);

  if (!user && !local) {
    res.status(401).json({ success: false, authenticated: false });
    return;
  }

  res.json({
    success: true,
    authenticated: true,
    user: user || local,
    accountType: user ? "webxwhale" : "sqlwhale",
  });
});

router.get("/query-history", (req: Request, res: Response) => {
  const user = getCurrentUser(req);
  const local = getLocalUser(req);

  if (!user && !local) {
    res.status(401).json({ success: false, authenticated: false, error: "Authentication required." });
    return;
  }

  const rawLimit = Number(req.query.limit);
  const limit = Number.isInteger(rawLimit) ? Math.min(Math.max(rawLimit, 1), 100) : 50;

  if (local) {
    const history = db.prepare(
      "SELECT id, query, command, status, execution_time_ms AS executionTimeMs, rows_returned AS rowsReturned, error_message AS errorMessage, created_at AS createdAt FROM local_query_history WHERE local_user_id = ? ORDER BY id DESC LIMIT ?"
    ).all(local.localUserId, limit);
    res.json({ success: true, history });
    return;
  }

  const history = db.prepare(
    "SELECT id, query, command, status, execution_time_ms AS executionTimeMs, rows_returned AS rowsReturned, error_message AS errorMessage, created_at AS createdAt FROM query_history WHERE webxwhale_user_id = ? ORDER BY id DESC LIMIT ?"
  ).all(user!.webxwhaleUserId, limit);

  res.json({ success: true, history });
});

router.get("/learning-dashboard", (req: Request, res: Response) => {
  const user = getCurrentUser(req);
  const local = getLocalUser(req);

  if (!user && !local) {
    res.status(401).json({ success: false, authenticated: false, error: "Authentication required." });
    return;
  }

  const id = user?.webxwhaleUserId || local?.localUserId;
  const queryTable = user ? "query_history" : "local_query_history";
  const progressTable = user ? "learning_progress" : "local_learning_progress";
  const activityTable = user ? "learning_activity" : "local_learning_activity";
  const queryColumn = user ? "webxwhale_user_id" : "local_user_id";

  const stats = db.prepare(
    `SELECT COUNT(*) AS totalQueries,
      COALESCE(SUM(CASE WHEN status = 'success' THEN 1 ELSE 0 END), 0) AS successfulQueries,
      COALESCE(SUM(CASE WHEN status = 'error' THEN 1 ELSE 0 END), 0) AS failedQueries,
      COALESCE(ROUND(AVG(execution_time_ms)), 0) AS averageExecutionTimeMs,
      COALESCE(SUM(CASE WHEN status = 'success' THEN rows_returned ELSE 0 END), 0) AS totalRowsReturned
      FROM ${queryTable} WHERE ${queryColumn} = ?`
  ).get(id) as any;

  const progress = db.prepare(
    `SELECT section_id AS sectionId, completed_at AS completedAt
     FROM ${progressTable} WHERE ${queryColumn} = ? ORDER BY completed_at DESC`
  ).all(id) as Array<{ sectionId: string; completedAt: string }>;

  const activities = db.prepare(
    `SELECT activity_date AS activityDate FROM ${activityTable}
     WHERE ${queryColumn} = ? ORDER BY activity_date DESC LIMIT 365`
  ).all(id) as Array<{ activityDate: string }>;

  const activitySet = new Set(activities.map((item) => item.activityDate));
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
      lastActivity: activities[0]?.activityDate || null,
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
  clearLocalSession(req, res);
  res.json({ success: true });
});

export default router;
