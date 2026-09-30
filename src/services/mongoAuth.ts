import crypto from "crypto";
import type { Request, Response } from "express";
import User from "../models/User";
import Session from "../models/Session";
import QueryHistory from "../models/QueryHistory";
import LearningProgress from "../models/LearningProgress";
import LearningActivity from "../models/LearningActivity";

export const SQLWHALE_SESSION_COOKIE = "sqlwhale_session";
const SESSION_DAYS = 30;
const SALT = "sqlwhale-mongodb-auth-v1";

function passwordHash(value: string): string {
  return crypto.scryptSync(value, SALT, 64).toString("hex");
}

function sessionHash(value: string): string {
  return crypto.createHash("sha256").update(value, "utf8").digest("hex");
}

function readCookie(req: Request, name: string): string | null {
  const header = req.headers.cookie || "";
  for (const part of header.split(";")) {
    const [key, ...value] = part.trim().split("=");
    if (key === name) return decodeURIComponent(value.join("="));
  }
  return null;
}

function setCookie(res: Response, token: string, maxAge: number): void {
  const value = [
    `${SQLWHALE_SESSION_COOKIE}=${encodeURIComponent(token)}`,
    `Max-Age=${maxAge}`,
    "Path=/",
    "HttpOnly",
    process.env.NODE_ENV === "production" ? "Secure" : "",
    "SameSite=Lax",
  ].filter(Boolean).join("; ");
  res.setHeader("Set-Cookie", value);
}

export function publicUser(user: any) {
  if (!user) return null;
  return {
    id: String(user._id),
    localUserId: user.localUserId,
    name: user.name,
    email: user.email,
    role: user.role,
    currentPlan: user.currentPlan,
  };
}

export async function createAccount(name: string, email: string, password: string) {
  const user = await User.create({
    localUserId: "sqlwhale_" + crypto.randomBytes(16).toString("hex"),
    name,
    email,
    passwordHash: passwordHash(password),
  });
  return user as any;
}

export async function authenticate(email: string, password: string) {
  const user = await User.findOne({ email }).exec() as any;
  if (!user || user.passwordHash !== passwordHash(password)) return null;
  return user;
}

export async function createSession(res: Response, localUserId: string): Promise<void> {
  const token = crypto.randomBytes(48).toString("base64url");
  await Session.create({
    sessionHash: sessionHash(token),
    localUserId,
    expiresAt: new Date(Date.now() + SESSION_DAYS * 86400000),
  });
  await Session.deleteMany({ expiresAt: { $lte: new Date() } });
  setCookie(res, token, SESSION_DAYS * 86400);
}

export async function getCurrentUser(req: Request) {
  const token = readCookie(req, SQLWHALE_SESSION_COOKIE);
  if (!token) return null;

  const session = await Session.findOne({
    sessionHash: sessionHash(token),
    expiresAt: { $gt: new Date() },
  }).exec() as any;

  if (!session) return null;
  return await User.findOne({ localUserId: session.localUserId }).exec() as any;
}

export async function logout(req: Request, res: Response): Promise<void> {
  const token = readCookie(req, SQLWHALE_SESSION_COOKIE);
  if (token) {
    await Session.deleteOne({ sessionHash: sessionHash(token) });
  }
  setCookie(res, "", 0);
}

export async function saveQueryHistory(localUserId: string, payload: {
  query: string;
  command?: string | null;
  status: "success" | "error";
  executionTimeMs: number;
  rowsReturned: number;
  errorMessage?: string | null;
}): Promise<void> {
  await QueryHistory.create({ localUserId, ...payload });
}

export async function markActivity(localUserId: string): Promise<void> {
  const activityDate = new Date().toISOString().slice(0, 10);
  await LearningActivity.updateOne(
    { localUserId, activityDate },
    { $setOnInsert: { localUserId, activityDate } },
    { upsert: true },
  );
}

export async function listQueryHistory(localUserId: string, limit: number) {
  const items = await QueryHistory.find({ localUserId })
    .sort({ createdAt: -1 })
    .limit(limit)
    .lean()
    .exec();

  return items.map((item: any) => ({
    id: String(item._id),
    query: item.query,
    command: item.command ?? null,
    status: item.status,
    executionTimeMs: item.executionTimeMs ?? 0,
    rowsReturned: item.rowsReturned ?? 0,
    errorMessage: item.errorMessage ?? null,
    createdAt: item.createdAt,
  }));
}

export async function learningDashboard(localUserId: string) {
  const [history, progress, activities] = await Promise.all([
    QueryHistory.find({ localUserId }).lean().exec(),
    LearningProgress.find({ localUserId }).sort({ completedAt: -1 }).lean().exec(),
    LearningActivity.find({ localUserId }).sort({ activityDate: -1 }).limit(365).lean().exec(),
  ]);

  const totalQueries = history.length;
  const successfulQueries = history.filter((x: any) => x.status === "success").length;
  const failedQueries = history.filter((x: any) => x.status === "error").length;
  const activitySet = new Set(activities.map((x: any) => x.activityDate));

  let learningStreak = 0;
  const cursor = new Date();
  cursor.setUTCHours(0, 0, 0, 0);
  while (activitySet.has(cursor.toISOString().slice(0, 10))) {
    learningStreak += 1;
    cursor.setUTCDate(cursor.getUTCDate() - 1);
  }

  const totalConcepts = 20;
  const completedConcepts = progress.length;

  return {
    totalQueries,
    successfulQueries,
    failedQueries,
    successRate: totalQueries ? Math.round(successfulQueries / totalQueries * 100) : 0,
    averageExecutionTimeMs: totalQueries
      ? Math.round(history.reduce((sum: number, x: any) => sum + (x.executionTimeMs || 0), 0) / totalQueries)
      : 0,
    totalRowsReturned: history.reduce((sum: number, x: any) => sum + (x.rowsReturned || 0), 0),
    completedConcepts,
    totalConcepts,
    progressPercent: Math.round(completedConcepts / totalConcepts * 100),
    learningStreak,
    lastActivity: activities[0]?.activityDate || null,
  };
}

export async function getLearningProgress(localUserId: string) {
  return LearningProgress.find({ localUserId }).sort({ completedAt: -1 }).lean().exec();
}

export async function completeLearningProgress(localUserId: string, sectionId: string) {
  await LearningProgress.updateOne(
    { localUserId, sectionId },
    { $setOnInsert: { localUserId, sectionId, completedAt: new Date() } },
    { upsert: true },
  );
  return LearningProgress.findOne({ localUserId, sectionId }).lean().exec();
}
