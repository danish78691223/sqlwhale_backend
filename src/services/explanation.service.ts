import { ExecutionStep } from "../types/execution.types";

export function generateExplanation(steps: ExecutionStep[]): string {
  if (!steps.length) {
    return "The query executed successfully.";
  }

  return steps
    .map((step, index) => {
      return `${index + 1}. ${step.explanation}`;
    })
    .join(" ");
}

export function generateStepExplanations(
  steps: ExecutionStep[]
): string[] {
  return steps.map((step) => step.explanation);
}