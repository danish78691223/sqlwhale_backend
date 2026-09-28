import crypto from "crypto";
import type { Request, Response } from "express";
import db from "../config/database";

export const LOCAL_SESSION_COOKIE = "sqlwhale_local_session";
const SESSION_DAYS = 30;

function hash(value: string): string {
  return crypto.scryptSync(value, "sqlwhale-local-auth", 64).toString("hex");
}

function readCookie(req: Request): string | null {
  const header = req.headers.cookie || "";
  for (const part of header.split(";")) {
    const [key, ...value] = part.trim().split("=");
    if (key === LOCAL_SESSION_COOKIE) return decodeURIComponent(value.join("="));
  }
  return null;
}

export function getLocalUser(req: Request) {
  const token = readCookie(req);
  if (!token) return null;

  return db.prepare(`
    SELECT id, local_user_id AS localUserId, name, email, role, current_plan AS currentPlan
    FROM sqlwhale_local_users
    WHERE local_user_id = (
      SELECT local_user_id FROM local_auth_sessions
      WHERE session_hash = ? AND expires_at > CURRENT_TIMESTAMP LIMIT 1
    )
  `).get(hash(token)) as
    | { id: number; localUserId: string; name: string; email: string; role: string; currentPlan: string }
    | undefined || null;
}

export function createLocalSession(res: Response, localUserId: string) {
  const token = crypto.randomBytes(48).toString("base64url");
  db.prepare(`
    INSERT INTO local_auth_sessions (session_hash, local_user_id, expires_at)
    VALUES (?, ?, ?)
  `).run(hash(token), localUserId, new Date(Date.now() + SESSION_DAYS * 86400000).toISOString());

  const cookie = [
    `${LOCAL_SESSION_COOKIE}=${encodeURIComponent(token)}`,
    `Max-Age=${SESSION_DAYS * 86400}`,
    "Path=/", "HttpOnly",
    process.env.NODE_ENV === "production" ? "Secure" : "",
    process.env.NODE_ENV === "production" ? "SameSite=None" : "SameSite=Lax",
  ].filter(Boolean).join("; ");

  res.setHeader("Set-Cookie", cookie);
}

export function clearLocalSession(req: Request, res: Response) {
  const token = readCookie(req);
  if (token) db.prepare("DELETE FROM local_auth_sessions WHERE session_hash = ?").run(hash(token));
  const existing = res.getHeader("Set-Cookie");
  const values = Array.isArray(existing) ? existing.map(String) : existing ? [String(existing)] : [];
  values.push(`${LOCAL_SESSION_COOKIE}=; Max-Age=0; Path=/; HttpOnly`);
  res.setHeader("Set-Cookie", values);
}
