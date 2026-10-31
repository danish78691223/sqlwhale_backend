import type { NextFunction, Request, Response } from "express";

const WINDOW_MS = 15 * 60 * 1000;
const MAX_FAILED_ATTEMPTS = 5;

type LoginAttemptBucket = {
  count: number;
  resetAt: number;
};

const attempts = new Map<string, LoginAttemptBucket>();
let lastCleanup = 0;

function getClientKey(req: Request): string {
  // Express req.ip respects the trusted proxy configuration in server.ts.
  return req.ip || req.socket.remoteAddress || "unknown";
}

export function loginRateLimit(req: Request, res: Response, next: NextFunction) {
  const now = Date.now();

  // Opportunistically remove expired buckets without creating a background timer.
  if (now - lastCleanup > 60_000) {
    for (const [key, bucket] of attempts) {
      if (bucket.resetAt <= now) attempts.delete(key);
    }
    lastCleanup = now;
  }

  const key = getClientKey(req);
  let bucket = attempts.get(key);

  if (!bucket || bucket.resetAt <= now) {
    bucket = { count: 0, resetAt: now + WINDOW_MS };
    attempts.set(key, bucket);
  }

  if (bucket.count >= MAX_FAILED_ATTEMPTS) {
    const retryAfter = Math.max(1, Math.ceil((bucket.resetAt - now) / 1000));
    res.setHeader("Retry-After", String(retryAfter));
    res.setHeader("RateLimit-Limit", String(MAX_FAILED_ATTEMPTS));
    res.setHeader("RateLimit-Remaining", "0");
    res.setHeader("RateLimit-Reset", String(Math.ceil(bucket.resetAt / 1000)));
    return res.status(429).json({
      success: false,
      code: "LOGIN_RATE_LIMITED",
      error: "Too many unsuccessful login attempts. Please try again in 15 minutes.",
      retryAfter,
    });
  }

  res.setHeader("RateLimit-Limit", String(MAX_FAILED_ATTEMPTS));
  res.setHeader("RateLimit-Remaining", String(Math.max(0, MAX_FAILED_ATTEMPTS - bucket.count)));

  // Only failed login responses consume an attempt. Successful login clears the
  // bucket so legitimate users are not penalized for signing in again.
  res.once("finish", () => {
    if (res.statusCode >= 200 && res.statusCode < 400) {
      attempts.delete(key);
      return;
    }
    if (res.statusCode === 401 || res.statusCode === 400) {
      const current = attempts.get(key);
      if (current) current.count += 1;
    }
  });

  next();
}
