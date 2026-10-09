import db from "../config/database";

/**
 * Older SQLWhale builds stored application accounts, sessions, history and
 * learning activity in the SQL sandbox database. Those records are now
 * managed by MongoDB, so remove the obsolete SQLite tables at startup.
 *
 * Child tables are dropped before their referenced parent tables.
 */
export function initializeSchema(): void {
  db.exec(`
    DROP TABLE IF EXISTS query_history;
    DROP TABLE IF EXISTS learning_progress;
    DROP TABLE IF EXISTS learning_activity;

    DROP TABLE IF EXISTS local_query_history;
    DROP TABLE IF EXISTS local_learning_progress;
    DROP TABLE IF EXISTS local_learning_activity;

    DROP TABLE IF EXISTS auth_sessions;
    DROP TABLE IF EXISTS local_auth_sessions;

    DROP TABLE IF EXISTS webxwhale_users;
    DROP TABLE IF EXISTS sqlwhale_local_users;

    DROP TABLE IF EXISTS system_metadata;
  `);
}
