import { Request, Response } from "express";

import { runSQLQuery } from "../services/sql.service";

import {
  generateExplanation,
  generateStepExplanations,
} from "../services/explanation.service";

import {
  prepareVisualizationSteps,
} from "../services/visualization.service";

export function executeSQLController(
  req: Request,
  res: Response
): void {
  try {
    const { query } = req.body;

    if (typeof query !== "string") {
      res.status(400).json({
        success: false,
        error: "SQL query must be provided as a string.",
      });

      return;
    }

    if (!query.trim()) {
      res.status(400).json({
        success: false,
        error: "SQL query cannot be empty.",
      });

      return;
    }

    const sqlResult = runSQLQuery(query);

    if (!sqlResult.success) {
      res.status(400).json(sqlResult);

      return;
    }

    const steps = sqlResult.steps ?? [];

    const visualization =
      prepareVisualizationSteps(steps);

    const explanation =
      generateExplanation(steps);

    const stepExplanations =
      generateStepExplanations(steps);

    res.status(200).json({
      success: true,

      command: sqlResult.command,

      result: sqlResult.result,

      execution: {
        steps,
        stepCount: steps.length,
        explanation,
        stepExplanations,
      },

      visualization,
    });
  } catch (error) {
    console.error("SQL Controller Error:", error);

    res.status(500).json({
      success: false,
      error: "Internal server error.",
    });
  }
}