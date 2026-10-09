import { AsyncLocalStorage } from "node:async_hooks";
import type Database from "better-sqlite3";

const databaseContext = new AsyncLocalStorage<Database>();

export function getActiveDatabase(fallback: Database): Database {
  return databaseContext.getStore() ?? fallback;
}

export function runWithDatabase<T>(database: Database, callback: () => T): T {
  return databaseContext.run(database, callback);
}
