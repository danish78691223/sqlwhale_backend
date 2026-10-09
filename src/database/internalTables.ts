export const INTERNAL_TABLES = [
  "system_metadata",
  "webxwhale_users",
  "sqlwhale_local_users",
  "auth_sessions",
  "local_auth_sessions",
  "query_history",
  "local_query_history",
  "learning_progress",
  "local_learning_progress",
  "learning_activity",
  "local_learning_activity",
] as const;

const INTERNAL_TABLE_NAMES = new Set<string>(
  INTERNAL_TABLES.map((name) => name.toLowerCase())
);

export function isInternalTableName(name: string): boolean {
  return INTERNAL_TABLE_NAMES.has(name.toLowerCase());
}
