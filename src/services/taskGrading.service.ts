import Database from "better-sqlite3";
import type { SQLResult } from "../types/sql.types";
import { executeQuery } from "./execution.service";

export type TaskExpectedResult = Pick<SQLResult, "columns" | "rows" | "rowCount">;

export type SetupColumn = { name: string; type: string; notnull: number; pk: number };
export type SetupTable = { name: string; columns: SetupColumn[]; rows: unknown[][] };
export type TaskExpectedSetup = { tables: SetupTable[] };
export type TaskExpectationValidation =
  | { success: true; result: TaskExpectedResult }
  | { success: false; error: string };
export type TaskSetupValidation =
  | { success: true; setup: TaskExpectedSetup }
  | { success: false; error: string };

function normalizeValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(normalizeValue);
  if (value && typeof value === "object") {
    const object = value as Record<string, unknown>;
    return Object.keys(object).sort().reduce<Record<string, unknown>>((result, key) => {
      result[key] = normalizeValue(object[key]);
      return result;
    }, {});
  }
  if (typeof value === "string") return value.trim();
  return value;
}

function normalizedJson(value: unknown): string {
  return JSON.stringify(normalizeValue(value));
}

function normalizedRows(rows: unknown[][]): string[] {
  return rows.map((row) => normalizedJson(row)).sort();
}

export function compareTaskResults(
  submitted: TaskExpectedResult,
  expected: TaskExpectedResult,
): boolean {
  if (submitted.columns.length !== expected.columns.length) return false;
  if (submitted.rows.length !== expected.rows.length) return false;
  const submittedRows = normalizedRows(submitted.rows);
  const expectedRows = normalizedRows(expected.rows);
  return submittedRows.every((row, index) => row === expectedRows[index]);
}

/** Remove SQL comments without touching quoted strings or identifiers. */
function stripSQLComments(sql: string): string {
  let output = "";
  let quote: "'" | '"' | "`" | "]" | null = null;
  let lineComment = false;
  let blockComment = false;

  for (let i = 0; i < sql.length; i += 1) {
    const char = sql[i];
    const next = sql[i + 1];

    if (lineComment) {
      if (char.charCodeAt(0) === 10 || char.charCodeAt(0) === 13) {
        lineComment = false;
        output += char;
      }
      continue;
    }
    if (blockComment) {
      if (char === "*" && next === "/") {
        blockComment = false;
        i += 1;
      } else if (char.charCodeAt(0) === 10 || char.charCodeAt(0) === 13) {
        output += char;
      }
      continue;
    }
    if (quote) {
      output += char;
      if (quote === "]" && char === "]") quote = null;
      else if (quote !== "]" && char === quote) {
        if (next === quote && quote !== "`") {
          output += next;
          i += 1;
        } else quote = null;
      }
      continue;
    }
    if (char.charCodeAt(0) === 10 || char.charCodeAt(0) === 13) {
      quote = char as "'" | '"' | "`";
      output += char;
    } else if (char === "[") {
      quote = "]";
      output += char;
    } else if (char === "-" && next === "-") {
      lineComment = true;
      i += 1;
    } else if (char === "/" && next === "*") {
      blockComment = true;
      i += 1;
    } else {
      output += char;
    }
  }
  if (blockComment) throw new Error("SQL contains an unclosed block comment.");
  return output;
}

/** Split SQL statements without splitting semicolons inside quoted values. */
export function splitSetupStatements(sql: string): string[] {
  sql = stripSQLComments(sql);
  const statements: string[] = [];
  let current = "";
  let quote: "'" | '"' | "`" | "]" | null = null;
  for (let i = 0; i < sql.length; i += 1) {
    const char = sql[i];
    if (quote) {
      current += char;
      if (quote === "]" && char === "]") quote = null;
      else if (quote !== "]" && char === quote) {
        if (sql[i + 1] === quote && quote !== "`") {
          current += sql[i + 1];
          i += 1;
        } else quote = null;
      }
      continue;
    }
    if (char.charCodeAt(0) === 10 || char.charCodeAt(0) === 13) {
      quote = char as "'" | '"' | "`";
      current += char;
    } else if (char === "[") {
      quote = "]";
      current += char;
    } else if (char === ";") {
      if (current.trim()) statements.push(current.trim());
      current = "";
    } else {
      current += char;
    }
  }
  if (quote) throw new Error("SQL contains an unclosed quoted value or identifier.");
  if (current.trim()) statements.push(current.trim());
  return statements;
}

function validateSetupStatements(sql: string): string[] {
  const statements = splitSetupStatements(sql);
  if (!statements.length) throw new Error("Enter CREATE TABLE and INSERT INTO statements.");
  let createCount = 0;
  for (const statement of statements) {
    if (/^CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?/i.test(statement)) {
      createCount += 1;
      continue;
    }
    if (/^INSERT(?:\s+OR\s+(?:IGNORE|REPLACE|ABORT|FAIL|ROLLBACK))?\s+INTO\s+/i.test(statement)) continue;
    throw new Error("Setup tasks support only CREATE TABLE and INSERT INTO statements.");
  }
  if (!createCount) throw new Error("A setup task must include at least one CREATE TABLE statement.");
  return statements;
}

function quoteIdentifier(identifier: string): string {
  return '"' + identifier.replace(/"/g, '""') + '"';
}

function readSetupState(database: Database.Database, tableNames: string[]): TaskExpectedSetup {
  const tables: SetupTable[] = [];
  for (const name of tableNames) {
    const exists = database.prepare(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND lower(name) = lower(?) LIMIT 1",
    ).get(name) as { name: string } | undefined;
    if (!exists) throw new Error(`Required table "${name}" was not created.`);
    const actualName = exists.name;
    const columns = database.prepare(`PRAGMA table_info(${quoteIdentifier(actualName)})`).all()
      .map((column: any) => ({
        name: String(column.name),
        type: String(column.type || "").toUpperCase(),
        notnull: Number(column.notnull),
        pk: Number(column.pk),
      }));
    const rowsRaw = database.prepare(`SELECT * FROM ${quoteIdentifier(actualName)}`).all() as Record<string, unknown>[];
    const rows = rowsRaw.map((row) => columns.map((column) => row[column.name]));
    tables.push({ name: actualName.toLowerCase(), columns, rows });
  }
  return { tables };
}

function compareSetupStates(actual: TaskExpectedSetup, expected: TaskExpectedSetup): boolean {
  if (actual.tables.length !== expected.tables.length) return false;
  const actualTables = [...actual.tables].sort((a, b) => a.name.localeCompare(b.name));
  const expectedTables = [...expected.tables].sort((a, b) => a.name.localeCompare(b.name));
  return actualTables.every((table, index) => {
    const target = expectedTables[index];
    if (table.name !== target.name) return false;
    if (normalizedJson(table.columns) !== normalizedJson(target.columns)) return false;
    return normalizedRows(table.rows).join("\n") === normalizedRows(target.rows).join("\n");
  });
}

/** Validate expected setup SQL in a disposable SQLite database and capture its schema/data. */
export function buildTaskExpectedSetup(query: string): TaskSetupValidation {
  const database = new Database(":memory:");
  try {
    const statements = validateSetupStatements(query);
    for (const statement of statements) database.exec(statement);
    const names = (database.prepare(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name",
    ).all() as { name: string }[]).map((table) => table.name);
    if (!names.length) throw new Error("The setup SQL did not create any tables.");
    return { success: true, setup: readSetupState(database, names) };
  } catch (error: any) {
    return { success: false, error: error?.message || "The setup SQL could not be executed." };
  } finally {
    database.close();
  }
}

/**
 * Execute a learner's CREATE/INSERT script atomically and compare the resulting
 * table schema/data to the admin's expected setup. Invalid attempts roll back.
 */
export function executeAndGradeSetup(
  database: Database.Database,
  submittedSql: string,
  expected: TaskExpectedSetup,
): { success: boolean; correct: boolean; error?: string; message?: string } {
  let statements: string[];
  try {
    statements = validateSetupStatements(submittedSql);
  } catch (error: any) {
    return { success: true, correct: false, message: error?.message || "Use CREATE TABLE and INSERT INTO statements." };
  }

  // Make task checks repeatable if the exact expected setup already exists.
  try {
    const current = readSetupState(database, expected.tables.map((table) => table.name));
    if (compareSetupStates(current, expected)) {
      return { success: true, correct: true, message: "The required table schema and records already match." };
    }
  } catch {
    // At least one expected table is absent; proceed with the learner's script.
  }

  try {
    database.exec("BEGIN");
    for (const statement of statements) database.exec(statement);
    const actual = readSetupState(database, expected.tables.map((table) => table.name));
    if (!compareSetupStates(actual, expected)) {
      database.exec("ROLLBACK");
      return {
        success: true,
        correct: false,
        message: "The SQL ran, but the resulting table structure or records do not match the task requirements.",
      };
    }
    database.exec("COMMIT");
    return { success: true, correct: true };
  } catch (error: any) {
    try { database.exec("ROLLBACK"); } catch { /* transaction may already be closed */ }
    return { success: true, correct: false, message: error?.message || "The setup SQL could not be executed." };
  }
}

export function buildTaskExpectedResult(query: string): TaskExpectationValidation {
  const execution = executeQuery(query);
  if (!execution.success || !execution.result) {
    return { success: false, error: execution.error || "The expected SQL query could not be executed." };
  }
  if (execution.command !== "SELECT") {
    return {
      success: false,
      error: "The expected SQL answer for a query task must be a SELECT query. CREATE TABLE/INSERT INTO scripts are supported as setup tasks.",
    };
  }
  return {
    success: true,
    result: {
      columns: execution.result.columns,
      rows: execution.result.rows,
      rowCount: execution.result.rowCount,
    },
  };
}
