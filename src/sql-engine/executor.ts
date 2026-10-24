import db from "../config/database";
import { parseCommand, splitSQLStatements } from "./parser";
import { analyzeQuery } from "./queryAnalyzer";
import { validateCommand, validateQuery } from "./validator";
import { executeCreateTable } from "./operations/createTable";
import { executeDropTable } from "./operations/dropTable";
import { executeInsert } from "./operations/insert";
import { executeUpdate } from "./operations/update";
import { executeDelete } from "./operations/delete";
import { executeSelect } from "./operations/select";
import { escapeIdentifier, getTableInfo, tableExists } from "../database/sandbox";
import { isInternalTableName } from "../database/internalTables";
import { SQLResponse } from "../types/sql.types";

export function executeSQL(query: string): SQLResponse {
  try {
    validateQuery(query);
    const statements = splitSQLStatements(query);
    if (!statements.length) throw new Error("SQL script does not contain an executable statement.");
    if (statements.length === 1) return executeSingleStatement(statements[0]);

    const allSteps: NonNullable<SQLResponse["steps"]> = [];
    let last: SQLResponse | undefined;
    for (let i = 0; i < statements.length; i++) {
      const statement = statements[i];
      const pragma = statement.match(/^PRAGMA\s+foreign_keys\s*=\s*(ON|OFF|1|0)\s*$/i);
      if (pragma) {
        db.pragma("foreign_keys = " + (["ON", "1"].includes(pragma[1].toUpperCase()) ? "ON" : "OFF"));
        last = { success: true, result: { columns: [], rows: [], rowCount: 0 }, steps: [] };
        continue;
      }
      if (/^PRAGMA\b/i.test(statement)) {
        throw new Error("Only PRAGMA foreign_keys = ON/OFF is supported (statement " + (i + 1) + ").");
      }
      const result = executeSingleStatement(statement);
      if (!result.success) {
        return { ...result, error: "Statement " + (i + 1) + " failed: " + result.error + " Earlier statements may already have been applied." };
      }
      if (result.steps?.length) {
        allSteps.push(...result.steps.map((step, j) => ({ ...step, id: allSteps.length + j + 1 })));
      }
      last = result;
    }
    return {
      success: true,
      command: last?.command,
      result: last?.result ?? { columns: [], rows: [], rowCount: 0 },
      steps: allSteps,
      queryAnalysis: last?.queryAnalysis,
    };
  } catch (error) {
    return { success: false, error: getErrorMessage(error) };
  }
}

function executeSingleStatement(query: string): SQLResponse {
  try {
    validateQuery(query);
    const command = parseCommand(query);
    validateCommand(command);
    const queryAnalysis = command === "SELECT" ? analyzeQuery(query) : undefined;
    switch (command) {
      case "CREATE_TABLE": {
        const r = executeCreateTable(query);
        return { success: true, command, result: { columns: [], rows: [], rowCount: 0 }, steps: r.steps };
      }
      case "DROP_TABLE": {
        const r = executeDropTable(query);
        return { success: true, command, result: { columns: [], rows: [], rowCount: 0 }, steps: r.steps };
      }
      case "REVOKE": {
        const match = query.match(/^REVOKE\s+SELECT\s+ON\s+([A-Za-z_][A-Za-z0-9_]*)\s+FROM\s+([A-Za-z_][A-Za-z0-9_]*)\s*;?$/i);
        if (!match) throw new Error("Supported REVOKE syntax: REVOKE SELECT ON table_name FROM user_name;");
        const [, tableName, userName] = match;
        if (isInternalTableName(tableName)) throw new Error("Permissions cannot be revoked on internal application tables.");
        return { success: true, command, result: { columns: [], rows: [], rowCount: 0 }, steps: [{ id: 1, operation: "revoke", targetTable: tableName, explanation: "Simulated REVOKE: SELECT permission removed for user '" + userName + "' on table '" + tableName + "'. SQLite does not enforce table-level GRANT/REVOKE permissions; this is a learning simulation only.", metadata: { privilege: "SELECT", tableName, userName, simulated: true } }] };
      }
      case "REPLACE": {
        const result = db.prepare(query).run();
        return { success: true, command, result: { columns: [], rows: [], rowCount: Number(result.changes) }, steps: [{ id: 1, operation: "replace", targetTable: (query.match(/\bINTO\s+([A-Za-z_][A-Za-z0-9_]*)/i) || [])[1], explanation: "Executed REPLACE INTO; matching rows may have been replaced.", metadata: { affectedRows: Number(result.changes) } }] };
      }
      case "TRUNCATE_TABLE": {
        const match = query.match(/^TRUNCATE\s+TABLE\s+([A-Za-z_][A-Za-z0-9_]*)\s*;?$/i);
        if (!match) throw new Error("Supported syntax: TRUNCATE TABLE table_name;");
        const tableName = match[1];
        if (isInternalTableName(tableName)) throw new Error("This table is reserved for internal application use.");
        if (!tableExists(tableName)) throw new Error("Table '" + tableName + "' does not exist.");
        const result = db.prepare("DELETE FROM " + escapeIdentifier(tableName)).run();
        return { success: true, command, result: { columns: [], rows: [], rowCount: Number(result.changes) }, steps: [{ id: 1, operation: "truncate_table", targetTable: tableName, explanation: "Removed all rows from '" + tableName + "' (SQLite-compatible TRUNCATE simulation using DELETE).", metadata: { affectedRows: Number(result.changes), simulated: true } }] };
      }
      case "CREATE_INDEX":
      case "DROP_INDEX":
      case "CREATE_VIEW":
      case "DROP_VIEW": {
        if (/\b(?:sqlite_master|sqlite_schema|webxwhale_|sqlwhale_)/i.test(query)) throw new Error("Access to internal database objects is not allowed.");
        db.exec(query);
        return { success: true, command, result: { columns: [], rows: [], rowCount: 0 }, steps: [{ id: 1, operation: command.toLowerCase(), explanation: "Executed " + command.replace(/_/g, " ") + " successfully." }] };
      }
      case "GRANT": {
        const match = query.match(/^GRANT\s+SELECT\s+ON\s+([A-Za-z_][A-Za-z0-9_]*)\s+TO\s+([A-Za-z_][A-Za-z0-9_]*)\s*;?$/i);
        if (!match) throw new Error("Supported GRANT syntax: GRANT SELECT ON table_name TO user_name;");
        const [, tableName, userName] = match;
        if (isInternalTableName(tableName)) throw new Error("Permissions cannot be granted on internal application tables.");
        return { success: true, command, result: { columns: [], rows: [], rowCount: 0 }, steps: [{ id: 1, operation: "grant", targetTable: tableName, explanation: "Simulated GRANT: SELECT permission on table '" + tableName + "' assigned to user '" + userName + "'. SQLWhale runs on SQLite, so this records the learning operation only; it does not create database users or enforce access permissions.", metadata: { privilege: "SELECT", tableName, userName, simulated: true } }] };
      }
      case "ALTER_TABLE": {
        const match = query.match(/^ALTER\s+TABLE\s+([A-Za-z_][A-Za-z0-9_]*)\s+ADD\s+COLUMN\s+([A-Za-z_][A-Za-z0-9_]*)\s+(INTEGER|INT|REAL|TEXT|NUMERIC|DECIMAL|BLOB|BOOLEAN|DATE|DATETIME|VARCHAR)(?:\s+DEFAULT\s+(\x27[^\x27]*\x27|\x22[^\x22]*\x22|[0-9]+|NULL))?\s*;?$/i);
        if (!match) throw new Error("Supported ALTER TABLE syntax: ALTER TABLE table_name ADD COLUMN column_name TYPE [DEFAULT value];");
        const [, tableName, columnName, columnType, defaultValue] = match;
        if (isInternalTableName(tableName)) throw new Error("This table is reserved for internal application use.");
        if (!tableExists(tableName)) throw new Error("Table '" + tableName + "' does not exist.");
        if (getTableInfo(tableName).columns.some((column) => column.name.toLowerCase() === columnName.toLowerCase())) throw new Error("Column '" + columnName + "' already exists.");
        db.exec("ALTER TABLE " + escapeIdentifier(tableName) + " ADD COLUMN " + escapeIdentifier(columnName) + " " + columnType.toUpperCase() + (defaultValue ? " DEFAULT " + defaultValue : ""));
        const columns = getTableInfo(tableName).columns.map((column) => column.name);
        return { success: true, command, result: { columns: [], rows: [], rowCount: 0 }, steps: [{ id: 1, operation: "alter_table", targetTable: tableName, columns, explanation: "Added column '" + columnName + "' to table '" + tableName + "'.", metadata: { tableName, columnName, columnType: columnType.toUpperCase() } }] };
      }
      case "INSERT": {
        const r = executeInsert(query);
        return { success: true, command, result: { columns: [], rows: [], rowCount: r.affectedRows }, steps: r.steps };
      }
      case "UPDATE": {
        const r = executeUpdate(query);
        return { success: true, command, result: { columns: [], rows: [], rowCount: r.affectedRows }, steps: r.steps };
      }
      case "DELETE": {
        const r = executeDelete(query);
        return { success: true, command, result: { columns: [], rows: [], rowCount: r.affectedRows }, steps: r.steps };
      }
      case "SELECT": {
        const r = executeSelect(query);
        return { success: true, command, result: { columns: r.columns, rows: r.rows, rowCount: r.rows.length }, steps: r.steps, queryAnalysis };
      }
      default: throw new Error("Unsupported SQL command: " + command);
    }
  } catch (error) {
    return { success: false, error: getErrorMessage(error) };
  }
}
function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "An unknown SQL execution error occurred.";
}
