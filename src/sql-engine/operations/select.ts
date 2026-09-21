import db from "../../config/database";
import {
  ExecutionResult,
  ExecutionStep,
} from "../../types/execution.types";

export function executeSelect(query: string): ExecutionResult {
  const normalizedQuery = query.trim().replace(/;\s*$/, "");

  const tableNames = extractTableNames(normalizedQuery);

  const steps: ExecutionStep[] = [];

  for (const tableName of tableNames) {
    const rows = getTableRows(tableName);

    steps.push({
      id: steps.length + 1,
      operation: "scan",
      sourceTable: tableName,
      inputRows: rows,
      outputRows: rows,
      explanation: `Read ${rows.length} row(s) from the '${tableName}' table.`,
    });
  }

  const statement = db.prepare(normalizedQuery);

  const rows = statement.all() as Record<string, unknown>[];

  const columns = getResultColumns(rows, normalizedQuery);

  const outputRows = rows.map((row) => columns.map((column) => row[column]));

  const whereCondition = extractWhereCondition(normalizedQuery);

  if (whereCondition) {
    steps.push({
      id: steps.length + 1,
      operation: "filter",
      condition: whereCondition,
      outputRows,
      explanation: `Applied the WHERE condition: ${whereCondition}.`,
    });
  }

  const selectColumns = extractSelectColumns(normalizedQuery);

  steps.push({
    id: steps.length + 1,
    operation: "select",
    columns: selectColumns,
    outputRows,
    explanation:
      selectColumns.length === 1 && selectColumns[0] === "*"
        ? "Selected all columns from the query result."
        : `Selected the requested columns: ${selectColumns.join(", ")}.`,
  });

  const orderBy = extractOrderBy(normalizedQuery);

  if (orderBy) {
    steps.push({
      id: steps.length + 1,
      operation: "order_by",
      metadata: {
        orderBy,
      },
      outputRows,
      explanation: `Ordered the result by ${orderBy}.`,
    });
  }

  const limit = extractLimit(normalizedQuery);

  if (limit !== undefined) {
    steps.push({
      id: steps.length + 1,
      operation: "limit",
      metadata: {
        limit,
      },
      outputRows,
      explanation: `Limited the result to ${limit} row(s).`,
    });
  }

  return {
    columns,
    rows: outputRows,
    steps,
  };
}

function getTableRows(tableName: string): unknown[][] {
  const rows = db
    .prepare(`SELECT * FROM "${tableName}"`)
    .all() as Record<string, unknown>[];

  return rows.map((row) => Object.values(row));
}

function extractTableNames(query: string): string[] {
  const tables = new Set<string>();

  const fromMatch = query.match(
    /\bFROM\s+([A-Za-z_][A-Za-z0-9_]*)/i
  );

  if (fromMatch) {
    tables.add(fromMatch[1]);
  }

  const joinMatches = query.matchAll(
    /\b(?:INNER\s+JOIN|LEFT\s+JOIN|RIGHT\s+JOIN|FULL\s+JOIN|JOIN)\s+([A-Za-z_][A-Za-z0-9_]*)/gi
  );

  for (const match of joinMatches) {
    tables.add(match[1]);
  }

  return [...tables];
}

function getResultColumns(
  rows: Record<string, unknown>[],
  query: string
): string[] {
  if (rows.length > 0) {
    return Object.keys(rows[0]);
  }

  const selectPart = query.match(
    /^SELECT\s+([\s\S]+?)\s+FROM\s+/i
  );

  if (!selectPart) {
    return [];
  }

  return selectPart[1]
    .split(",")
    .map((column) => column.trim());
}

function extractSelectColumns(query: string): string[] {
  const match = query.match(
    /^SELECT\s+([\s\S]+?)\s+FROM\s+/i
  );

  if (!match) {
    return [];
  }

  return match[1]
    .split(",")
    .map((column) => column.trim());
}

function extractWhereCondition(query: string): string | undefined {
  const match = query.match(
    /\bWHERE\s+([\s\S]+?)(?=\s+(?:GROUP\s+BY|ORDER\s+BY|LIMIT|HAVING)\b|$)/i
  );

  return match?.[1]?.trim();
}

function extractOrderBy(query: string): string | undefined {
  const match = query.match(
    /\bORDER\s+BY\s+([\s\S]+?)(?=\s+LIMIT\b|$)/i
  );

  return match?.[1]?.trim();
}

function extractLimit(query: string): number | undefined {
  const match = query.match(/\bLIMIT\s+(\d+)/i);

  if (!match) {
    return undefined;
  }

  return Number.parseInt(match[1], 10);
}