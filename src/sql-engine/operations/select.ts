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
    const columns = getTableColumns(tableName);
    const rows = getTableRows(tableName);

    steps.push({
      id: steps.length + 1,
      operation: "scan",
      sourceTable: tableName,
      inputColumns: columns,
      outputColumns: columns,
      inputRows: rows,
      outputRows: rows,
      explanation: `Read ${rows.length} row(s) from the '${tableName}' table.`,
    });
  }

  const statement = db.prepare(normalizedQuery);
  const rows = statement.all() as Record<string, unknown>[];
  const columns = getResultColumns(rows, normalizedQuery);
  const outputRows = rows.map((row) =>
    columns.map((column) => row[column])
  );

  const whereCondition = extractWhereCondition(normalizedQuery);

  if (whereCondition && tableNames.length === 1) {
    const tableName = tableNames[0];
    const sourceColumns = getTableColumns(tableName);
    const sourceRows = getTableRows(tableName);
    const matchingIndexes = getMatchingRowIndexes(
      tableName,
      whereCondition,
      sourceRows,
      sourceColumns
    );

    const filteredIndexes = sourceRows
      .map((_, index) => index)
      .filter((index) => !matchingIndexes.includes(index));

    steps.push({
      id: steps.length + 1,
      operation: "filter",
      sourceTable: tableName,
      condition: whereCondition,
      inputColumns: sourceColumns,
      inputRows: sourceRows,
      outputColumns: sourceColumns,
      outputRows: matchingIndexes.map((index) => sourceRows[index]),
      matchedRows: matchingIndexes,
      filteredRows: filteredIndexes,
      highlightedRows: matchingIndexes,
      explanation: `Keep rows where ${whereCondition}.`,
    });
  } else if (whereCondition) {
    steps.push({
      id: steps.length + 1,
      operation: "filter",
      condition: whereCondition,
      outputColumns: columns,
      outputRows,
      explanation: `Applied the WHERE condition: ${whereCondition}.`,
    });
  }

  const selectColumns = extractSelectColumns(normalizedQuery);

  steps.push({
    id: steps.length + 1,
    operation: "select",
    columns: selectColumns,
    inputColumns: columns,
    outputColumns: columns,
    outputRows,
    explanation:
      selectColumns.length === 1 && selectColumns[0] === "*"
        ? "Keep all columns from the filtered rows."
        : `Keep the selected columns: ${selectColumns.join(", ")}.`,
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

function getTableColumns(tableName: string): string[] {
  const rows = db
    .prepare(`PRAGMA table_info("${tableName}")`)
    .all() as Array<{ name: string }>;

  return rows.map((row) => row.name);
}

function getMatchingRowIndexes(
  tableName: string,
  condition: string,
  sourceRows: unknown[][],
  sourceColumns: string[]
): number[] {
  try {
    const matched = db
      .prepare(
        `SELECT rowid FROM "${tableName}" WHERE ${condition}`
      )
      .all() as Array<{ rowid: number }>;

    const rowIds = new Set(matched.map((row) => row.rowid));
    const rowsWithIds = db
      .prepare(`SELECT rowid FROM "${tableName}"`)
      .all() as Array<{ rowid: number }>;

    return rowsWithIds
      .map((row, index) => ({ rowId: row.rowid, index }))
      .filter((item) => rowIds.has(item.rowId))
      .map((item) => item.index);
  } catch {
    // Some SQLite tables do not expose rowid. Fall back to a value comparison.
    try {
      const matchedRows = db
        .prepare(`SELECT * FROM "${tableName}" WHERE ${condition}`)
        .all() as Record<string, unknown>[];
      const matchedValues = matchedRows.map((row) =>
        sourceColumns.map((column) => row[column])
      );

      return sourceRows.reduce<number[]>((indexes, row, index) => {
        if (
          matchedValues.some(
            (matchedRow) =>
              JSON.stringify(matchedRow) === JSON.stringify(row)
          )
        ) {
          indexes.push(index);
        }

        return indexes;
      }, []);
    } catch {
      return [];
    }
  }
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
