import { parseCommand } from "./parser";
import { validateCommand, validateQuery } from "./validator";

import { executeCreateTable } from "./operations/createTable";
import { executeInsert } from "./operations/insert";
import { executeSelect } from "./operations/select";

import { SQLResponse } from "../types/sql.types";

export function executeSQL(query: string): SQLResponse {
  try {
    validateQuery(query);

    const command = parseCommand(query);

    validateCommand(command);

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