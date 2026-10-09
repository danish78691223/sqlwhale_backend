import Database from "better-sqlite3";
import path from "path";
import fs from "fs";
import { getActiveDatabase } from "../database/databaseContext";

const dataDirectory = path.join(process.cwd(), "data");
if (!fs.existsSync(dataDirectory)) fs.mkdirSync(dataDirectory, { recursive: true });

const databasePath = path.join(dataDirectory, "sqlcrew.db");
const baseDatabase = new Database(databasePath);
baseDatabase.pragma("foreign_keys = ON");
baseDatabase.pragma("journal_mode = WAL");

// Existing SQL engine modules transparently use the request-scoped workspace DB.
const db = new Proxy(baseDatabase, {
  get(target, property) {
    const active = getActiveDatabase(target);
    const value = Reflect.get(active, property, active);
    return typeof value === "function" ? value.bind(active) : value;
  },
}) as Database;

export default db;