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

  return value;
}

function normalizedJson(value: unknown): string {
  return JSON.stringify(normalizeValue(value));
}

export function compareTaskResults(
  submitted: TaskExpectedResult,
  expected: TaskExpectedResult,
): boolean {
  return (
    normalizedJson(submitted.columns) === normalizedJson(expected.columns) &&
    normalizedJson(submitted.rows) === normalizedJson(expected.rows)
  );
}

export function buildTaskExpectedResult(
  query: string,
): TaskExpectationValidation {
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
      error:
        "The expected SQL answer for a task must be a SELECT query because task grading compares query output.",
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
