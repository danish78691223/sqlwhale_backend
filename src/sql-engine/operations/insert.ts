import db from "../../config/database";
import { ExecutionStep } from "../../types/execution.types";
import {
  escapeIdentifier,
  getTableInfo,
  tableExists,
} from "../../database/sandbox";

export interface InsertResult {
  steps: ExecutionStep[];
  tableName: string;
  affectedRows: number;
}

export function executeInsert(query: string): InsertResult {
  const match = query.match(
    /INSERT\s+INTO\s+([A-Za-z_][A-Za-z0-9_]*)(?:\s*\(([^)]*)\))?\s+VALUES\s*(.+)$/is
  );

  if (!match) {
    throw new Error(
      "Invalid INSERT syntax. Example: INSERT INTO employees (id, name) VALUES (1, 'Aisha');"
    );
  }

  const tableName = match[1];

  if (!tableExists(tableName)) {
    throw new Error(`Table '${tableName}' does not exist.`);
  }

  const tableInfo = getTableInfo(tableName);

  const specifiedColumns = match[2]
    ? match[2]
        .split(",")
        .map((column) => column.trim())
        .filter(Boolean)
    : tableInfo.columns.map((column) => column.name);

  const valuesString = match[3].trim().replace(/;$/, "");

  const valueGroups = parseValueGroups(valuesString);

  if (valueGroups.length === 0) {
    throw new Error("INSERT statement must contain at least one row.");
  }

  const safeColumns = specifiedColumns.map(escapeIdentifier).join(", ");

  const placeholders = specifiedColumns.map(() => "?").join(", ");

  const insertStatement = db.prepare(`
    INSERT INTO ${escapeIdentifier(tableName)}
    (${safeColumns})
    VALUES (${placeholders})
  `);

  const insertedRows: unknown[][] = [];

  const transaction = db.transaction(() => {
    for (const group of valueGroups) {
      const values = parseValues(group);

      if (values.length !== specifiedColumns.length) {
        throw new Error(
          `Expected ${specifiedColumns.length} value(s), but received ${values.length}.`
        );
      }

      insertStatement.run(...values);

      insertedRows.push(values);
    }
  });

  transaction();

  const step: ExecutionStep = {
    id: 1,
    operation: "insert",
    targetTable: tableName,
    affectedRows: insertedRows,
    columns: specifiedColumns,
    explanation: `Inserted ${insertedRows.length} row(s) into '${tableName}'.`,
  };

  return {
    steps: [step],
    tableName,
    affectedRows: insertedRows.length,
  };
}

function parseValueGroups(values: string): string[] {
  const groups: string[] = [];

  let current = "";
  let depth = 0;
  let quote: string | null = null;

  for (let i = 0; i < values.length; i++) {
    const char = values[i];

    if ((char === "'" || char === '"') && values[i - 1] !== "\\") {
      if (!quote) {
        quote = char;
      } else if (quote === char) {
        quote = null;
      }
    }

    if (!quote) {
      if (char === "(") {
        depth++;
      }

      if (char === ")") {
        depth--;
      }
    }

    current += char;

    if (char === ")" && depth === 0 && !quote) {
      groups.push(current.trim());
      current = "";

      while (values[i + 1] === "," || /\s/.test(values[i + 1] ?? "")) {
        i++;
      }
    }
  }

  return groups;
}

function parseValues(group: string): unknown[] {
  const cleaned = group.trim();

  if (!cleaned.startsWith("(") || !cleaned.endsWith(")")) {
    throw new Error(`Invalid VALUES group: ${group}`);
  }

  const content = cleaned.slice(1, -1);

  const values: string[] = [];

  let current = "";
  let quote: string | null = null;
  let depth = 0;

  for (let i = 0; i < content.length; i++) {
    const char = content[i];

    if ((char === "'" || char === '"') && content[i - 1] !== "\\") {
      if (!quote) {
        quote = char;
      } else if (quote === char) {
        quote = null;
      }
    }

    if (!quote) {
      if (char === "(") depth++;
      if (char === ")") depth--;
    }

    if (char === "," && !quote && depth === 0) {
      values.push(current.trim());
      current = "";
    } else {
      current += char;
    }
  }

  if (current.trim()) {
    values.push(current.trim());
  }

  return values.map(parseValue);
}

function parseValue(value: string): unknown {
  const trimmed = value.trim();

  if (/^NULL$/i.test(trimmed)) {
    return null;
  }

  if (/^(TRUE|FALSE)$/i.test(trimmed)) {
    return trimmed.toUpperCase() === "TRUE" ? 1 : 0;
  }

  if (
    (trimmed.startsWith("'") && trimmed.endsWith("'")) ||
    (trimmed.startsWith('"') && trimmed.endsWith('"'))
  ) {
    return trimmed.slice(1, -1).replace(/''/g, "'");
  }

  if (/^-?\d+$/.test(trimmed)) {
    return Number.parseInt(trimmed, 10);
  }

  if (/^-?\d*\.\d+$/.test(trimmed)) {
    return Number.parseFloat(trimmed);
  }

  return trimmed;
}