import { Request, Response } from "express";
import db from "../config/database";
import { getCurrentUser } from "../services/webxwhaleAuth";
import { getLocalUser } from "../services/localAuth";

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

    const currentUser = getCurrentUser(req);
    const localUser = getLocalUser(req);

    if (currentUser) {
      db.prepare(`
        INSERT OR IGNORE INTO learning_activity
          (webxwhale_user_id, activity_date)
        VALUES (?, date('now'))
      `).run(currentUser.webxwhaleUserId);
    } else if (localUser) {
      db.prepare(`
        INSERT OR IGNORE INTO local_learning_activity
          (local_user_id, activity_date)
        VALUES (?, date('now'))
      `).run(localUser.localUserId);
    }

    const startedAt = Date.now();
    const historyTable = currentUser ? "query_history" : "local_query_history";
    const historyUserId = currentUser?.webxwhaleUserId || localUser?.localUserId;
    const sqlResult = runSQLQuery(query);
    const executionTimeMs = Date.now() - startedAt;

    if (!sqlResult.success) {
      if (currentUser) {
        db.prepare(`
          INSERT INTO ${historyTable} (
            webxwhale_user_id, query, command, status,
            execution_time_ms, rows_returned, error_message
          )
          VALUES (?, ?, ?, 'error', ?, 0, ?)
        `).run(
          historyUserId,
          query.trim(),
          sqlResult.command || null,
          executionTimeMs,
          sqlResult.error || "SQL query failed."
        );
      }

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

    if (currentUser) {
      db.prepare(`
        INSERT INTO ${historyTable} (
          webxwhale_user_id, query, command, status,
          execution_time_ms, rows_returned, error_message
        )
        VALUES (?, ?, ?, 'success', ?, ?, NULL)
      `).run(
        currentUser.webxwhaleUserId,
        query.trim(),
        sqlResult.command || null,
        executionTimeMs,
        sqlResult.result?.rowCount ?? sqlResult.result?.rows?.length ?? 0
      );
    }

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