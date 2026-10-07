import db from "../../config/database";
import { ExecutionStep } from "../../types/execution.types";
import {
  escapeIdentifier,
  getTableInfo,
  tableExists,
} from "../../database/sandbox";

export interface DropTableResult {
  steps: ExecutionStep[];
  tableName: string;
}

export function executeDropTable(query: string): DropTableResult {
  const match = query.match(
    /^DROP\s+TABLE\s+(?:IF\s+EXISTS\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*;?$/i
  );

  if (!match) {
    throw new Error(
      "Invalid DROP TABLE syntax. Example: DROP TABLE employees;"
    );
  }

  const tableName = match[1];

  if (!tableExists(tableName)) {
    throw new Error(`Table '${tableName}' does not exist.`);
  }

  const tableInfo = getTableInfo(tableName);
  const columnCount = tableInfo.columns.length;

  db.exec(`DROP TABLE ${escapeIdentifier(tableName)}`);

  const step: ExecutionStep = {
    id: 1,
    operation: "drop_table",
    targetTable: tableName,
    columns: tableInfo.columns.map((column) => column.name),
    explanation: `Dropped the '${tableName}' table with ${columnCount} column(s).`,
    metadata: {
      tableName,
      columns: tableInfo.columns,
    },
  };

  return {
    tableName,
    steps: [step],
  };
}
