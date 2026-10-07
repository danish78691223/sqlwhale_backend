import { parseCommand } from "./parser";
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

    const command = parseCommand(query);

    validateCommand(command);

    const queryAnalysis = command === "SELECT" ? analyzeQuery(query) : undefined;

    switch (command) {
      case "CREATE_TABLE": {
        const result = executeCreateTable(query);

        return {
          success: true,
          command,
          result: {
            columns: [],
            rows: [],
            rowCount: 0,
          },
          steps: result.steps,
        };
      }

      case "DROP_TABLE": {
        const result = executeDropTable(query);

        return {
          success: true,
          command,
          result: {
            columns: [],
            rows: [],
            rowCount: 0,
          },
          steps: result.steps,
        };
      }

      case "INSERT": {
        const result = executeInsert(query);

        return {
          success: true,
          command,
          result: {
            columns: [],
            rows: [],
            rowCount: result.affectedRows,
          },
          steps: result.steps,
        };
      }

      case "UPDATE": {
        const result = executeUpdate(query);
        return {
          success: true,
          command,
          result: { columns: [], rows: [], rowCount: result.affectedRows },
          steps: result.steps,
        };
      }

      case "DELETE": {
        const result = executeDelete(query);
        return {
          success: true,
          command,
          result: { columns: [], rows: [], rowCount: result.affectedRows },
          steps: result.steps,
        };
      }

      case "SELECT": {
        const result = executeSelect(query);

        return {
          success: true,
          command,
          result: {
            columns: result.columns,
            rows: result.rows,
            rowCount: result.rows.length,
          },
          steps: result.steps,
          queryAnalysis,
        };
      }

      default:
        throw new Error(`Unsupported SQL command: ${command}`);
    }
  } catch (error) {
    return {
      success: false,
      error: getErrorMessage(error),
    };
  }
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return "An unknown SQL execution error occurred.";
}
