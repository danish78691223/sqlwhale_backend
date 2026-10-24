import type { ExecutionStep } from "./execution.types";

export type SQLCommand =
  | "CREATE_TABLE"
  | "INSERT"
  | "SELECT"
  | "UPDATE"
  | "DELETE"
  | "DROP_TABLE"
  | "ALTER_TABLE"
  | "GRANT"
  | "REVOKE"
  | "REPLACE"
  | "TRUNCATE_TABLE"
  | "CREATE_INDEX"
  | "DROP_INDEX"
  | "CREATE_VIEW"
  | "DROP_VIEW"
  | "UNKNOWN";

export interface SQLRequest {
  query: string;
}

export interface SQLResult {
  columns: string[];
  rows: unknown[][];
  rowCount: number;
}

export interface QueryJoin {
  type: string;
  table: string;
  alias?: string;
  condition: string;
  leftTable?: string;
  leftColumn?: string;
  rightTable?: string;
  rightColumn?: string;
}

export interface QueryAnalysis {
  tables: string[];
  aliases: Record<string, string>;
  joins: QueryJoin[];
}

export interface SQLResponse {
  success: boolean;
  command?: SQLCommand;
  result?: SQLResult;
  steps?: ExecutionStep[];
  queryAnalysis?: QueryAnalysis;
  error?: string;
}