import crypto from "crypto";
import type { Request, Response } from "express";
import db from "../config/database";

const CENTRAL_AUTH_URL =
  process.env.WEBXWHALE_AUTH_URL || "https://webxwhale-ebon.vercel.app";
const CLIENT_ID = process.env.WEBXWHALE_CLIENT_ID || "sqlwhale";
const SESSION_COOKIE = "sqlwhale_session";
const STATE_COOKIE = "sqlwhale_oauth_state";
const VERIFIER_COOKIE = "sqlwhale_oauth_verifier";
const SESSION_DAYS = 30;

function isProduction(): boolean {
  return process.env.NODE_ENV === "production";
}

function cookieOptions(maxAge: number) {
  return [
    `Max-Age=${Math.floor(maxAge / 1000)}`,
    "Path=/",
    "HttpOnly",
    isProduction() ? "Secure" : "",
    isProduction() ? "SameSite=None" : "SameSite=Lax",
  ].filter(Boolean).join("; ");
}

function clearCookieOptions() {
  return [
    "Max-Age=0",
    "Path=/",
    "HttpOnly",
    isProduction() ? "Secure" : "",
    isProduction() ? "SameSite=None" : "SameSite=Lax",
  ].filter(Boolean).join("; ");
}

function readCookie(req: Request, name: string): string | null {
  const header = req.headers.cookie || "";

  for (const part of header.split(";")) {
    const [key, ...value] = part.trim().split("=");
    if (key === name) {
      return decodeURIComponent(value.join("="));
    }
  }

  return null;
}

function appendSetCookie(res: Response, value: string) {
  const existing = res.getHeader("Set-Cookie");
  const values = Array.isArray(existing)
    ? existing.map(String)
    : existing
      ? [String(existing)]
      : [];
  res.setHeader("Set-Cookie", [...values, value]);
}

function randomBase64Url(bytes = 32): string {
  return crypto.randomBytes(bytes).toString("base64url");
}

function sha256Base64Url(value: string): string {
  return crypto.createHash("sha256").update(value, "ascii").digest("base64url");
}

function sha256Hex(value: string): string {
  return crypto.createHash("sha256").update(value, "utf8").digest("hex");
}

function getRedirectUri(): string {
  const configured = process.env.WEBXWHALE_REDIRECT_URI;
  if (!configured) {
    throw new Error(
      "WEBXWHALE_REDIRECT_URI must be configured with the exact SQLWhale callback URL."
    );
  }
  return configured;
}

function getFrontendUrl(): string {
  return (process.env.FRONTEND_URL || "http://localhost:3000").replace(/\/$/, "");
}

export function beginWebXWhaleLogin(req: Request, res: Response): void {
  const state = randomBase64Url(32);
  const verifier = randomBase64Url(48);
  const challenge = sha256Base64Url(verifier);

  appendSetCookie(
    res,
    `${STATE_COOKIE}=${encodeURIComponent(state)}; ${cookieOptions(10 * 60 * 1000)}`
  );
  appendSetCookie(
    res,
    `${VERIFIER_COOKIE}=${encodeURIComponent(verifier)}; ${cookieOptions(10 * 60 * 1000)}`
  );

  const authorizeUrl = new URL("/api/oauth/authorize", CENTRAL_AUTH_URL);
  authorizeUrl.searchParams.set("response_type", "code");
  authorizeUrl.searchParams.set("client_id", CLIENT_ID);
  authorizeUrl.searchParams.set("redirect_uri", getRedirectUri());
  authorizeUrl.searchParams.set("state", state);
  authorizeUrl.searchParams.set("code_challenge", challenge);
  authorizeUrl.searchParams.set("code_challenge_method", "S256");

  res.redirect(authorizeUrl.toString());
}

async function exchangeCode(code: string, verifier: string) {
  const tokenResponse = await fetch(new URL("/api/oauth/token", CENTRAL_AUTH_URL), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      grant_type: "authorization_code",
      client_id: CLIENT_ID,
      redirect_uri: getRedirectUri(),
      code,
      code_verifier: verifier,
    }),
  });

  const payload = await tokenResponse.json().catch(() => ({}));

  if (!tokenResponse.ok || !payload.access_token) {
    throw new Error(payload.error_description || "WEBXWHALE token exchange failed.");
  }

  return payload.access_token as string;
}

async function fetchCentralUser(accessToken: string) {
  const response = await fetch(new URL("/api/oauth/userinfo", CENTRAL_AUTH_URL), {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  const payload = await response.json().catch(() => ({}));

  if (!response.ok || !payload.userId) {
    throw new Error(payload.error_description || "Unable to load WEBXWHALE user.");
  }

  return payload as {
    userId: string;
    name: string;
    email: string;
    role: string;
    currentPlan: string;
  };
}

export async function completeWebXWhaleLogin(
  req: Request,
  res: Response,
  code: string,
  returnedState: string | null
): Promise<string> {
  const expectedState = readCookie(req, STATE_COOKIE);
  const verifier = readCookie(req, VERIFIER_COOKIE);

  if (!expectedState || !returnedState || !crypto.timingSafeEqual(
    Buffer.from(expectedState),
    Buffer.from(returnedState)
  )) {
    throw new Error("Invalid OAuth state.");
  }

  if (!verifier) {
    throw new Error("Missing OAuth PKCE verifier.");
  }

  const centralUser = await fetchCentralUser(await exchangeCode(code, verifier));

  db.prepare(`
    INSERT INTO webxwhale_users (
      webxwhale_user_id, name, email, role, current_plan, updated_at
    )
    VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(webxwhale_user_id) DO UPDATE SET
      name = excluded.name,
      email = excluded.email,
      role = excluded.role,
      current_plan = excluded.current_plan,
      updated_at = CURRENT_TIMESTAMP
  `).run(
    centralUser.userId,
    centralUser.name || "WEBXWHALE User",
    centralUser.email,
    centralUser.role || "user",
    centralUser.currentPlan || "Starter"
  );

  const sessionToken = randomBase64Url(48);
  const sessionHash = sha256Hex(sessionToken);
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 86400000).toISOString();

  db.prepare(`
    INSERT INTO auth_sessions (session_hash, webxwhale_user_id, expires_at)
    VALUES (?, ?, ?)
  `).run(sessionHash, centralUser.userId, expiresAt);

  db.prepare("DELETE FROM auth_sessions WHERE expires_at <= CURRENT_TIMESTAMP").run();

  appendSetCookie(
    res,
    `${SESSION_COOKIE}=${encodeURIComponent(sessionToken)}; ${cookieOptions(SESSION_DAYS * 86400000)}`
  );
  appendSetCookie(res, `${STATE_COOKIE}=; ${clearCookieOptions()}`);
  appendSetCookie(res, `${VERIFIER_COOKIE}=; ${clearCookieOptions()}`);

  return getFrontendUrl();
}

export function getCurrentUser(req: Request) {
  const sessionToken = readCookie(req, SESSION_COOKIE);
  if (!sessionToken) return null;

  const session = db.prepare(`
    SELECT u.id, u.webxwhale_user_id AS webxwhaleUserId,
           u.name, u.email, u.role, u.current_plan AS currentPlan
    FROM auth_sessions s
    JOIN webxwhale_users u ON u.webxwhale_user_id = s.webxwhale_user_id
    WHERE s.session_hash = ? AND s.expires_at > CURRENT_TIMESTAMP
    LIMIT 1
  `).get(sha256Hex(sessionToken)) as
    | {
        id: number;
        webxwhaleUserId: string;
        name: string;
        email: string;
        role: string;
        currentPlan: string;
      }
    | undefined;

  return session || null;
}

export function logoutWebXWhale(req: Request, res: Response): void {
  const sessionToken = readCookie(req, SESSION_COOKIE);

  if (sessionToken) {
    db.prepare("DELETE FROM auth_sessions WHERE session_hash = ?").run(
      sha256Hex(sessionToken)
    );
  }

  appendSetCookie(res, `${SESSION_COOKIE}=; ${clearCookieOptions()}`);
}
