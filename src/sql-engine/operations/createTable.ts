import db from "../../config/database";
import {
  escapeIdentifier,
  getTableInfo,
  tableExists,
} from "../../database/sandbox";
import { ExecutionStep } from "../../types/execution.types";

export interface CreateTableResult {
  steps: ExecutionStep[];
  tableName: string;
}

export function executeCreateTable(query: string): CreateTableResult {
  const match = query.match(
    /CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*\(([\s\S]+)\)/i
  );

  if (!match) {
    throw new Error(
      "Invalid CREATE TABLE syntax. Example: CREATE TABLE employees (id INTEGER, name TEXT);"
    );
  }

  const tableName = match[1];
  const columnDefinitions = match[2];

  if (tableExists(tableName)) {
    throw new Error(`Table '${tableName}' already exists.`);
  }

  const definitions = splitColumnDefinitions(columnDefinitions);

  if (definitions.length === 0) {
    throw new Error("CREATE TABLE must contain at least one column.");
  }

  const safeTableName = escapeIdentifier(tableName);

  const safeDefinitions = definitions
    .map((definition) => validateColumnDefinition(definition))
    .join(", ");

  const createQuery = `
    CREATE TABLE ${safeTableName} (
      ${safeDefinitions}
    )
  `;

  db.exec(createQuery);

  const tableInfo = getTableInfo(tableName);

  const columns = tableInfo.columns.map((column) => ({
    name: column.name,
    type: column.type,
  }));

  const step: ExecutionStep = {
    id: 1,
    operation: "create_table",
    targetTable: tableName,
    columns: tableInfo.columns.map((column) => column.name),
    explanation: `Created the '${tableName}' table with ${columns.length} column(s).`,
    metadata: {
      columns,
    },
  };

  return {
    tableName,
    steps: [step],
  };
}

function splitColumnDefinitions(definitions: string): string[] {
  const result: string[] = [];

  let current = "";
  let parenthesesDepth = 0;

  for (const character of definitions) {
    if (character === "(") {
      parenthesesDepth++;
    }

    if (character === ")") {
      parenthesesDepth--;
    }

    if (character === "," && parenthesesDepth === 0) {
      result.push(current.trim());
      current = "";
      continue;
    }

    current += character;
  }

  if (current.trim()) {
    result.push(current.trim());
  }

  return result;
}

function validateColumnDefinition(definition: string): string {
  const match = definition.match(
    /^([A-Za-z_][A-Za-z0-9_]*)\s+([A-Za-z]+(?:\s*\(\s*\d+(?:\s*,\s*\d+)?\s*\))?)([\s\S]*)$/i
  );

  if (!match) {
    throw new Error(`Invalid column definition: ${definition}`);
  }

  const columnName = match[1];
  const columnType = match[2].toUpperCase();
  const constraints = match[3].trim();

  const allowedTypes = [
    "INTEGER",
    "INT",
    "REAL",
    "TEXT",
    "NUMERIC",
    "BLOB",
    "BOOLEAN",
    "DATE",
    "DATETIME",
    "VARCHAR",
  ];

  const baseType = columnType.split("(")[0];

  if (!allowedTypes.includes(baseType)) {
    throw new Error(
      `Unsupported column type '${columnType}' for column '${columnName}'.`
    );
  }

  const allowedConstraintPattern =
    /^(PRIMARY\s+KEY|NOT\s+NULL|UNIQUE|DEFAULT\s+[^,]+|CHECK\s*\(.+\)|REFERENCES\s+\w+(?:\s*\([^)]*\))?)$/i;

  if (constraints) {
    const parts = constraints
      .replace(/\s+/g, " ")
      .trim()
      .split(/\s+(?=(?:PRIMARY|NOT|UNIQUE|DEFAULT|CHECK|REFERENCES)\b)/i);

    for (const part of parts) {
      if (!allowedConstraintPattern.test(part.trim())) {
        throw new Error(
          `Unsupported or invalid constraint in column '${columnName}': ${part}`
        );
      }
    }
  }

  return `"${columnName}" ${columnType}${constraints ? ` ${constraints}` : ""}`;
}