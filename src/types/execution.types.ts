export type ExecutionOperation =
  | "create_table"
  | "insert"
  | "scan"
  | "filter"
  | "select"
  | "order_by"
  | "limit"
  | "inner_join"
  | "left_join"
  | "group_by"
  | "aggregate";

export interface ExecutionStep {
  id: number;
  operation: ExecutionOperation;
  sourceTable?: string;
  targetTable?: string;
  condition?: string;
  inputRows?: unknown[][];
  outputRows?: unknown[][];
  affectedRows?: unknown[][];
  columns?: string[];
  explanation: string;
  metadata?: Record<string, unknown>;
}

export interface ExecutionResult {
  columns: string[];
  rows: unknown[][];
  steps: ExecutionStep[];
}