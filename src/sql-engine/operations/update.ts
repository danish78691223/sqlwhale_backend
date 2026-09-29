import db from "../../config/database";
import { ExecutionStep } from "../../types/execution.types";
import { escapeIdentifier, getTableInfo, tableExists } from "../../database/sandbox";

export interface UpdateResult {
  steps: ExecutionStep[];
  tableName: string;
  affectedRows: number;
}

const IDENTIFIER = '(?:"([^"]+)"|([A-Za-z_][A-Za-z0-9_]*))';

export function executeUpdate(query: string): UpdateResult {
  const match = query.match(
    new RegExp("^UPDATE\\s+" + IDENTIFIER + "\\s+SET\\s+" + IDENTIFIER + "\\s*=\\s*(.+?)\\s+WHERE\\s+" + IDENTIFIER + "\\s*=\\s*(.+?)\\s*;?$", "is")
  );

  if (!match) {
    throw new Error(
      "Invalid UPDATE syntax. Example: UPDATE employees SET name = 'Sarah' WHERE employee_id = 2;"
    );
  }

  const tableName = match[1] ?? match[2];
  const columnName = match[3] ?? match[4];
  const rawValue = match[5];
  const whereColumn = match[6] ?? match[7];
  const rawWhereValue = match[8];

  if (!tableExists(tableName)) {
    throw new Error(`Table '${tableName}' does not exist.`);
  }

  const tableInfo = getTableInfo(tableName);
  const columnNames = new Set(tableInfo.columns.map((column) => column.name));

  if (!columnNames.has(columnName) || !columnNames.has(whereColumn)) {
    throw new Error("UPDATE references a column that does not exist.");
  }

  const value = parseValue(rawValue);
  const whereValue = parseValue(rawWhereValue);

  const statement = db.prepare(
    `UPDATE ${escapeIdentifier(tableName)}
     SET ${escapeIdentifier(columnName)} = ?
     WHERE ${escapeIdentifier(whereColumn)} = ?`
  );

  const result = statement.run(value, whereValue);

  const step: ExecutionStep = {
    id: 1,
    operation: "update",
    targetTable: tableName,
    affectedRows: [],
    columns: [columnName],
    explanation: `Updated ${result.changes} row(s) in '${tableName}'.`,
  };

  return {
    steps: [step],
    tableName,
    affectedRows: Number(result.changes),
  };
}

function parseValue(value: string): unknown {
  const trimmed = value.trim().replace(/;$/, "");

  if (/^NULL$/i.test(trimmed)) return null;
  if (/^(TRUE|FALSE)$/i.test(trimmed)) return trimmed.toUpperCase() === "TRUE" ? 1 : 0;

  if (
    (trimmed.startsWith("'") && trimmed.endsWith("'")) ||
    (trimmed.startsWith('"') && trimmed.endsWith('"'))
  ) {
    return trimmed.slice(1, -1).replace(/''/g, "'");
  }

  if (/^-?\d+$/.test(trimmed)) return Number.parseInt(trimmed, 10);
  if (/^-?\d*\\.\d+$/.test(trimmed)) return Number.parseFloat(trimmed);

  throw new Error("UPDATE values must be SQL literals such as text, numbers, NULL, TRUE or FALSE.");
}
