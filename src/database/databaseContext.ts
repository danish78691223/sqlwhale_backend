import { AsyncLocalStorage } from "node:async_hooks";
import type Database from "better-sqlite3";

type SQLiteDatabase = Database.Database;

const databaseContext = new AsyncLocalStorage<SQLiteDatabase>();

export function getActiveDatabase(fallback: SQLiteDatabase): SQLiteDatabase {
  return databaseContext.getStore() ?? fallback;
}

export function runWithDatabase<T>(database: SQLiteDatabase, callback: () => T): T {
  return databaseContext.run(database, callback);
}
