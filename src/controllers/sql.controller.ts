import { Request, Response } from "express";
import { getCurrentUser, markActivity, saveQueryHistory } from "../services/mongoAuth";
import { persistWorkspace, resolveWorkspace } from "../database/workspaces";
import { runWithDatabase } from "../database/databaseContext";
import { runSQLQuery } from "../services/sql.service";
import { generateExplanation, generateStepExplanations } from "../services/explanation.service";
import { prepareVisualizationSteps } from "../services/visualization.service";

export async function executeSQLController(req: Request, res: Response): Promise<void> {
  try {
    const { query } = req.body;
    if (typeof query !== "string" || !query.trim()) {
      res.status(400).json({ success: false, error: "A non-empty SQL query must be provided as a string." });
      return;
    }

    const user = await getCurrentUser(req);
    if (user) await markActivity(user.localUserId);
    const workspace = await resolveWorkspace(req, res, user?.localUserId ?? null);
    const started = Date.now();
    const result = runWithDatabase(workspace.database, () => runSQLQuery(query));
    await persistWorkspace(workspace.key, workspace.database);
    const executionTimeMs = Date.now() - started;

    if (!result.success) {
      if (user) await saveQueryHistory(user.localUserId, {
        query: query.trim(), command: result.command || null, status: "error",
        executionTimeMs, rowsReturned: 0, errorMessage: result.error || "SQL query failed.",
      });
      res.status(400).json(result);
      return;
    }

    const steps = result.steps ?? [];
    const visualization = prepareVisualizationSteps(steps);
    const explanation = generateExplanation(steps);
    const stepExplanations = generateStepExplanations(steps);
    if (user) await saveQueryHistory(user.localUserId, {
      query: query.trim(), command: result.command || null, status: "success",
      executionTimeMs, rowsReturned: result.result?.rowCount ?? result.result?.rows?.length ?? 0,
      errorMessage: null,
    });
    res.json({ success: true, command: result.command, result: result.result,
      execution: { steps, stepCount: steps.length, explanation, stepExplanations }, visualization });
  } catch (error) {
    console.error("SQL Controller Error:", error);
    res.status(500).json({ success: false, error: "Internal server error." });
  }
}