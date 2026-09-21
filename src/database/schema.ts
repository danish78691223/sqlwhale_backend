import db from "../config/database";

export function initializeSchema(): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS system_metadata (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      key TEXT UNIQUE NOT NULL,
      value TEXT
    );
  `);
}