import { executeQuery } from "./execution.service";
import type { SQLResult } from "../types/sql.types";

export type TaskExpectedResult = Pick<SQLResult, "columns" | "rows" | "rowCount">;

export type TaskExpectationValidation =
  | { success: true; result: TaskExpectedResult }
  | { success: false; error: string };

function normalizeValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(normalizeValue);

  if (value && typeof value === "object") {
    const object = value as Record<string, unknown>;
    return Object.keys(object)
      .sort()
      .reduce<Record<string, unknown>>((result, key) => {
        result[key] = normalizeValue(object[key]);
        return result;
      }, {});
  }

  if (typeof value === "string") return value.trim();
  return value;
}

function normalizeColumnName(column: string): string {
  return column.trim().toLowerCase().replace(/^["]|["]$/g, "").replace(/\s+/g, " ");
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
  const submittedColumns = submitted.columns.map(normalizeColumnName);
  const expectedColumns = expected.columns.map(normalizeColumnName);

  if (submittedColumns.length !== expectedColumns.length) return false;

  if (submittedColumns.some((column, index) => column !== expectedColumns[index])) {
    return false;
  }

  if (submitted.rows.length !== expected.rows.length) return false;

  // Row order is not significant unless it is part of the displayed result.
  // Duplicate rows remain significant because the sorted arrays keep duplicates.
  const submittedRows = normalizedRows(submitted.rows);
  const expectedRows = normalizedRows(expected.rows);

  return submittedRows.every((row, index) => row === expectedRows[index]);
}

export function buildTaskExpectedResult(query: string): TaskExpectationValidation {
  const execution = executeQuery(query);

  if (!execution.success || !execution.result) {
    return {
      success: false,
      error: execution.error || "The expected SQL query could not be executed.",
    };
  }

  if (execution.command !== "SELECT") {
    return {
      success: false,
      error: "The expected SQL answer for a task must be a SELECT query because task grading compares query output.",
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
