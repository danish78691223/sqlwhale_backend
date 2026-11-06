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
const persistenceQueues = new Map<string, Promise<void>>();
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

/**
 * MongoDB is the durable source of truth. Local SQLite files are disposable
 * working copies only and may disappear whenever the hosting container rolls.
 */
async function openWorkspace(key: string): Promise<Database.Database> {
  const cached = databases.get(key);
  if (cached) return cached;

  const filename = workspacePath(key);
  const saved = await SQLWorkspace.findOne({ workspaceKey: key }).lean().exec() as any;

  // Never prefer a leftover container file over the durable MongoDB snapshot.
  // WAL/SHM sidecars must be removed together before restoring a snapshot.
  for (const suffix of ["", "-wal", "-shm"]) {
    const target = filename + suffix;
    if (fs.existsSync(target)) fs.rmSync(target, { force: true });
  }

  if (saved?.data) {
    fs.writeFileSync(filename, Buffer.from(saved.data));
  }

  const database = new Database(filename);
  database.pragma("foreign_keys = ON");
  database.pragma("journal_mode = WAL");
  databases.set(key, database);

  // Defaults and schema migrations run only inside this isolated workspace.
  // The seeder is guarded and does not drop user-created tables.
  runWithDatabase(database, () => seedDatabase({
    allowLegacyMigration: false,
    seedDefaults: !saved?.data,
  }));

  if (!saved?.data) await persistWorkspace(key, database);
  return database;
}

/**
 * Serialize snapshots per workspace. Concurrent SQL requests cannot race and
 * overwrite a newer MongoDB snapshot with an older SQLite image.
 */
export async function persistWorkspace(key: string, database: Database.Database): Promise<void> {
  const previous = persistenceQueues.get(key) ?? Promise.resolve();
  const next = previous.catch(() => undefined).then(async () => {
    const checkpoint = database.pragma("wal_checkpoint(TRUNCATE)") as Array<{ busy: number; log: number; checkpointed: number }>;
    if (checkpoint?.[0]?.busy) {
      throw new Error(`SQLite workspace checkpoint is busy for ${key}; refusing to save an incomplete snapshot.`);
    }
    const data = fs.readFileSync(workspacePath(key));
    if (data.length < 16 || data.subarray(0, 16).toString("binary") !== "SQLite format 3\\0") {
      throw new Error(`SQLite workspace snapshot is invalid for ${key}; MongoDB snapshot was not updated.`);
    }
    await SQLWorkspace.updateOne(
      { workspaceKey: key },
      { $set: { data } },
      { upsert: true },
    ).exec();
  });
  persistenceQueues.set(key, next);
  try {
    await next;
  } finally {
    if (persistenceQueues.get(key) === next) persistenceQueues.delete(key);
  }
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
  if (guestDatabase) {
    await persistWorkspace(guestKey, guestDatabase);
    guestDatabase.close();
    databases.delete(guestKey);
  }
  const guestSnapshot = await SQLWorkspace.findOne({ workspaceKey: guestKey }).lean().exec() as any;
  if (!guestSnapshot?.data) return;

  // Build the account copy from the durable snapshot rather than depending on
  // a local rename, which is not reliable across container restarts.
  fs.writeFileSync(accountPath, Buffer.from(guestSnapshot.data));
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
