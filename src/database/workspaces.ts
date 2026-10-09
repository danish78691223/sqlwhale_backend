import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import type { Request, Response } from "express";
import Database from "better-sqlite3";
import SQLWorkspace from "../models/SQLWorkspace";
import { runWithDatabase } from "./databaseContext";
import { seedDatabase } from "./seed";

export const GUEST_WORKSPACE_COOKIE = "sqlwhale_guest_workspace";
const workspaceDirectory = path.join(process.cwd(), "data", "workspaces");
const databases = new Map<string, Database.Database>();
if (!fs.existsSync(workspaceDirectory)) fs.mkdirSync(workspaceDirectory, { recursive: true });

function cookieValue(req: Request, name: string): string | null {
  for (const part of (req.headers.cookie || "").split(";")) {
    const [key, ...value] = part.trim().split("=");
    if (key === name) { try { return decodeURIComponent(value.join("=")); } catch { return null; } }
  }
  return null;
}

function setGuestCookie(res: Response, id: string): void {
  res.append("Set-Cookie", [
    `${GUEST_WORKSPACE_COOKIE}=${encodeURIComponent(id)}`, "Max-Age=15552000", "Path=/", "HttpOnly", "SameSite=Lax",
    process.env.NODE_ENV === "production" ? "Secure" : "",
  ].filter(Boolean).join("; "));
}

function workspacePath(key: string): string {
  const safeId = crypto.createHash("sha256").update(key).digest("hex");
  return path.join(workspaceDirectory, `${safeId}.sqlite`);
}

async function openWorkspace(key: string): Promise<Database.Database> {
  const cached = databases.get(key);
  if (cached) return cached;
  const filename = workspacePath(key);
  const saved = await SQLWorkspace.findOne({ workspaceKey: key }).lean().exec() as any;
  if (saved?.data) {
    for (const suffix of ["", "-wal", "-shm"]) {
      const target = filename + suffix;
      if (fs.existsSync(target)) fs.rmSync(target, { force: true });
    }
    fs.writeFileSync(filename, Buffer.from(saved.data));
  }
  const isNew = !fs.existsSync(filename);
  const database = new Database(filename);
  database.pragma("foreign_keys = ON");
  database.pragma("journal_mode = WAL");
  databases.set(key, database);
  if (isNew) {
    runWithDatabase(database, () => seedDatabase());
    await persistWorkspace(key, database);
  }
  return database;
}

export async function persistWorkspace(key: string, database: Database.Database): Promise<void> {
  database.pragma("wal_checkpoint(TRUNCATE)");
  const data = fs.readFileSync(workspacePath(key));
  await SQLWorkspace.updateOne(
    { workspaceKey: key },
    { $set: { data } },
    { upsert: true },
  ).exec();
}

export async function resolveWorkspace(req: Request, res: Response, localUserId?: string | null) {
  if (localUserId) {
    const key = `account:${localUserId}`;
    return { key, database: await openWorkspace(key), guestId: null as string | null, isGuest: false };
  }
  let guestId = cookieValue(req, GUEST_WORKSPACE_COOKIE);
  if (!guestId || !/^[0-9a-f-]{36}$/i.test(guestId)) {
    guestId = crypto.randomUUID();
    setGuestCookie(res, guestId);
  }
  const key = `guest:${guestId}`;
  return { key, database: await openWorkspace(key), guestId, isGuest: true };
}

export function getGuestWorkspaceId(req: Request): string | null {
  const id = cookieValue(req, GUEST_WORKSPACE_COOKIE);
  return id && /^[0-9a-f-]{36}$/i.test(id) ? id : null;
}

/** Transfer a guest workspace on signup when the account has no existing workspace. */
export async function adoptGuestWorkspace(guestId: string | null, localUserId: string): Promise<void> {
  if (!guestId || !/^[0-9a-f-]{36}$/i.test(guestId)) return;
  const guestKey = `guest:${guestId}`;
  const accountKey = `account:${localUserId}`;
  const guestPath = workspacePath(guestKey);
  const accountPath = workspacePath(accountKey);
  const accountSnapshot = await SQLWorkspace.findOne({ workspaceKey: accountKey }).lean().exec();
  if (accountSnapshot || fs.existsSync(accountPath)) return;
  const guestDatabase = databases.get(guestKey);
  if (guestDatabase) { guestDatabase.pragma("wal_checkpoint(TRUNCATE)"); guestDatabase.close(); databases.delete(guestKey); }
  if (fs.existsSync(guestPath)) {
    try { fs.renameSync(guestPath, accountPath); } catch (error) {
      console.error("Unable to transfer guest SQL workspace:", error);
      return;
    }
  } else {
    const guestSnapshot = await SQLWorkspace.findOne({ workspaceKey: guestKey }).lean().exec() as any;
    if (!guestSnapshot?.data) return;
    fs.writeFileSync(accountPath, Buffer.from(guestSnapshot.data));
  }
  const accountDatabase = new Database(accountPath);
  accountDatabase.pragma("foreign_keys = ON");
  accountDatabase.pragma("journal_mode = WAL");
  databases.set(accountKey, accountDatabase);
  await persistWorkspace(accountKey, accountDatabase);
  await SQLWorkspace.deleteOne({ workspaceKey: guestKey }).exec();
}

export function clearGuestWorkspaceCookie(res: Response): void {
  res.append("Set-Cookie", `${GUEST_WORKSPACE_COOKIE}=; Max-Age=0; Path=/; HttpOnly; SameSite=Lax${process.env.NODE_ENV === "production" ? "; Secure" : ""}`);
}