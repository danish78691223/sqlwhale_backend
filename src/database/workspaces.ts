import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import type { Request, Response } from "express";
import Database from "better-sqlite3";
import { runWithDatabase } from "./databaseContext";
import { seedDatabase } from "./seed";

export const GUEST_WORKSPACE_COOKIE = "sqlwhale_guest_workspace";
const workspaceDirectory = path.join(process.cwd(), "data", "workspaces");
const databases = new Map<string, Database>();

if (!fs.existsSync(workspaceDirectory)) {
  fs.mkdirSync(workspaceDirectory, { recursive: true });
}

function cookieValue(req: Request, name: string): string | null {
  for (const part of (req.headers.cookie || "").split(";")) {
    const [key, ...value] = part.trim().split("=");
    if (key === name) {
      try { return decodeURIComponent(value.join("=")); } catch { return null; }
    }
  }
  return null;
}

function setGuestCookie(res: Response, id: string): void {
  res.append("Set-Cookie", [
    `${GUEST_WORKSPACE_COOKIE}=${encodeURIComponent(id)}`,
    "Max-Age=15552000",
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    process.env.NODE_ENV === "production" ? "Secure" : "",
  ].filter(Boolean).join("; "));
}

function workspacePath(key: string): string {
  const safeId = crypto.createHash("sha256").update(key).digest("hex");
  return path.join(workspaceDirectory, `${safeId}.sqlite`);
}

function openWorkspace(key: string): Database {
  const existing = databases.get(key);
  if (existing) return existing;
  const filename = workspacePath(key);
  const isNew = !fs.existsSync(filename);
  const database = new Database(filename);
  database.pragma("foreign_keys = ON");
  database.pragma("journal_mode = WAL");
  databases.set(key, database);
  if (isNew) runWithDatabase(database, () => seedDatabase());
  return database;
}

export async function resolveWorkspace(req: Request, res: Response, localUserId?: string | null) {
  if (localUserId) {
    return { database: openWorkspace(`account:${localUserId}`), guestId: null as string | null, isGuest: false };
  }

  let guestId = cookieValue(req, GUEST_WORKSPACE_COOKIE);
  if (!guestId || !/^[0-9a-f-]{36}$/i.test(guestId)) {
    guestId = crypto.randomUUID();
    setGuestCookie(res, guestId);
  }
  return { database: openWorkspace(`guest:${guestId}`), guestId, isGuest: true };
}

/** Adopt a guest workspace on signup without overwriting an existing account workspace. */
export function getGuestWorkspaceId(req: Request): string | null {\n  const id = cookieValue(req, GUEST_WORKSPACE_COOKIE);\n  return id && /^[0-9a-f-]{36}$/i.test(id) ? id : null;\n}\n\nexport function adoptGuestWorkspace(guestId: string | null, localUserId: string): void {
  if (!guestId || !/^[0-9a-f-]{36}$/i.test(guestId)) return;
  const guestKey = `guest:${guestId}`;
  const accountKey = `account:${localUserId}`;
  const guestPath = workspacePath(guestKey);
  const accountPath = workspacePath(accountKey);
  if (!fs.existsSync(guestPath) || fs.existsSync(accountPath)) return;

  const guestDatabase = databases.get(guestKey);
  if (guestDatabase) { guestDatabase.close(); databases.delete(guestKey); }
  try { fs.renameSync(guestPath, accountPath); } catch (error) {
    console.error("Unable to transfer guest SQL workspace:", error);
    return;
  }
  const accountDatabase = new Database(accountPath);
  accountDatabase.pragma("foreign_keys = ON");
  accountDatabase.pragma("journal_mode = WAL");
  databases.set(accountKey, accountDatabase);
}

export function clearGuestWorkspaceCookie(res: Response): void {
  res.append("Set-Cookie", `${GUEST_WORKSPACE_COOKIE}=; Max-Age=0; Path=/; HttpOnly; SameSite=Lax${process.env.NODE_ENV === "production" ? "; Secure" : ""}`);
}