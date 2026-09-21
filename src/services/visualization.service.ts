import { ExecutionStep } from "../types/execution.types";

export interface VisualizationStep {
  id: number;
  type: string;
  title: string;
  description: string;
  sourceTable?: string;
  targetTable?: string;
  condition?: string;
  columns?: string[];
  inputRows?: unknown[][];
  outputRows?: unknown[][];
  affectedRows?: unknown[][];
  metadata?: Record<string, unknown>;
}

export function prepareVisualizationSteps(
  steps: ExecutionStep[]
): VisualizationStep[] {
  return steps.map((step) => {
    return {
      id: step.id,
      type: step.operation,
      title: getStepTitle(step.operation),
      description: step.explanation,
      sourceTable: step.sourceTable,
      targetTable: step.targetTable,
      condition: step.condition,
      columns: step.columns,
      inputRows: step.inputRows,
      outputRows: step.outputRows,
      affectedRows: step.affectedRows,
      metadata: step.metadata,
    };
  });
}

function getStepTitle(operation: string): string {
  switch (operation) {
    case "create_table":
      return "Create Table";

    case "insert":
      return "Insert Data";

    case "scan":
      return "Read Table";

    case "filter":
      return "Apply Filter";

    case "select":
      return "Select Columns";

    case "order_by":
      return "Order Rows";

    case "limit":
      return "Limit Result";

    case "inner_join":
      return "INNER JOIN";

    case "left_join":
      return "LEFT JOIN";

    case "group_by":
      return "Group Rows";

    case "aggregate":
      return "Calculate Aggregate";

    default:
      return "SQL Operation";
  }
}