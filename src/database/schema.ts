import db from "../config/database";

export function initializeSchema(): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS system_metadata (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      key TEXT UNIQUE NOT NULL,
      value TEXT
    );

    CREATE TABLE IF NOT EXISTS webxwhale_users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      webxwhale_user_id TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      email TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'user',
      current_plan TEXT NOT NULL DEFAULT 'Starter',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS auth_sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_hash TEXT UNIQUE NOT NULL,
      webxwhale_user_id TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (webxwhale_user_id)
        REFERENCES webxwhale_users(webxwhale_user_id)
        ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_auth_sessions_expires_at
      ON auth_sessions(expires_at);

    CREATE INDEX IF NOT EXISTS idx_webxwhale_users_email
      ON webxwhale_users(email);
  `);
}
