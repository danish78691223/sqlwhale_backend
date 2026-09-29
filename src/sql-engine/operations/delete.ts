import db from "../../config/database";
import { ExecutionStep } from "../../types/execution.types";
import { escapeIdentifier, getTableInfo, tableExists } from "../../database/sandbox";

export interface DeleteResult {
  steps: ExecutionStep[];
  tableName: string;
  affectedRows: number;
}

const IDENTIFIER = '(?:"([^"]+)"|([A-Za-z_][A-Za-z0-9_]*))';

export function executeDelete(query: string): DeleteResult {
  const match = query.match(
    new RegExp("^DELETE\\s+FROM\\s+" + IDENTIFIER + "\\s+WHERE\\s+" + IDENTIFIER + "\\s*=\\s*(.+?)\\s*;?$", "is")
  );

  if (!match) {
    throw new Error(
      "Invalid DELETE syntax. SQLWhale requires a WHERE condition for DELETE."
    );
  }

  const tableName = match[1] ?? match[2];
  const whereColumn = match[3] ?? match[4];
  const rawWhereValue = match[5];

  if (!tableExists(tableName)) {
    throw new Error(`Table '${tableName}' does not exist.`);
  }

  const columnNames = new Set(getTableInfo(tableName).columns.map((column) => column.name));
  if (!columnNames.has(whereColumn)) {
    throw new Error(`Column '${whereColumn}' does not exist in '${tableName}'.`);
  }

  const whereValue = parseValue(rawWhereValue);

  const result = db.prepare(
    `DELETE FROM ${escapeIdentifier(tableName)}
     WHERE ${escapeIdentifier(whereColumn)} = ?`
  ).run(whereValue);

  const step: ExecutionStep = {
    id: 1,
    operation: "delete",
    targetTable: tableName,
    affectedRows: [],
    columns: [whereColumn],
    explanation: `Deleted ${result.changes} row(s) from '${tableName}'.`,
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
  ) return trimmed.slice(1, -1).replace(/''/g, "'");
  if (/^-?\d+$/.test(trimmed)) return Number.parseInt(trimmed, 10);
  if (/^-?\d*\\.\d+$/.test(trimmed)) return Number.parseFloat(trimmed);

  throw new Error("DELETE values must be SQL literals such as text, numbers, NULL, TRUE or FALSE.");
}
