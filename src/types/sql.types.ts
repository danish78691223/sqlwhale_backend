import type { ExecutionStep } from "./execution.types";

export type SQLCommand =
  | "CREATE_TABLE"
  | "INSERT"
  | "SELECT"
  | "UPDATE"
  | "DELETE"
  | "DROP_TABLE"
  | "UNKNOWN";

export interface SQLRequest {
  query: string;
}

export interface SQLResult {
  columns: string[];
  rows: unknown[][];
  rowCount: number;
}

export interface SQLResponse {
  success: boolean;
  command?: SQLCommand;
  result?: SQLResult;
  steps?: ExecutionStep[];
  error?: string;
}