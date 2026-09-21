import Database from "better-sqlite3";
import path from "path";
import fs from "fs";

const dataDirectory = path.join(process.cwd(), "data");

if (!fs.existsSync(dataDirectory)) {
  fs.mkdirSync(dataDirectory, { recursive: true });
}

const databasePath = path.join(dataDirectory, "sqlcrew.db");

const db = new Database(databasePath);

db.pragma("foreign_keys = ON");

db.pragma("journal_mode = WAL");

export default db;