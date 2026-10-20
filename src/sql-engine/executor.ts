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
