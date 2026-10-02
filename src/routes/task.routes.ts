import { Router } from "express";
import Task from "../models/Task.js";
import { getCurrentUser } from "../services/mongoAuth";
import { executeQuery } from "../services/execution.service";

const router = Router();


router.post("/:id/check", async (req, res) => {
  try {
    const submittedQuery = typeof req.body?.query === "string" ? req.body.query.trim() : "";
    if (!submittedQuery) {
      return res.status(400).json({ success: false, error: "A SQL query is required." });
    }

    const task: any = await Task.findOne({ _id: req.params.id, isActive: true }).lean().exec();
    if (!task) {
      return res.status(404).json({ success: false, error: "Task not found." });
    }

    const submitted = executeQuery(submittedQuery);
    if (!submitted.success) {
      return res.json({
        success: true,
        correct: false,
        status: "invalid",
        message: "Your SQL query could not be executed. Fix the query and try again.",
        executionError: submitted.error || null,
      });
    }

    const expected = executeQuery(task.expectedQuery);
    if (!expected.success) {
      console.error("Task expected query failed:", expected.error);
      return res.status(500).json({ success: false, error: "Unable to validate this task." });
    }

    const normalize = (value: unknown) =>
      JSON.stringify(value, (_key, item) =>
        item && typeof item === "object" && !Array.isArray(item)
          ? Object.keys(item).sort().reduce((obj, key) => {
              obj[key] = item[key];
              return obj;
            }, {} as Record<string, unknown>)
          : item
      );

    const submittedColumns = submitted.result?.columns ?? [];
    const expectedColumns = expected.result?.columns ?? [];
    const submittedRows = submitted.result?.rows ?? [];
    const expectedRows = expected.result?.rows ?? [];

    const correct =
      normalize(submittedColumns) === normalize(expectedColumns) &&
      normalize(submittedRows) === normalize(expectedRows);

    return res.json({
      success: true,
      correct,
      status: correct ? "correct" : "incorrect",
      message: correct
        ? "Correct! Your query produced the expected result."
        : "Not quite. Your query ran successfully, but the result does not match the task.",
    });
  } catch (error) {
    console.error("Task check error:", error);
    return res.status(500).json({ success: false, error: "Unable to check the task." });
  }
});

router.get("/", async (_req, res) => {
  try {
    const tasks = await Task.find({ isActive: true })
      .sort({ createdAt: -1 })
      .lean()
      .exec();

    res.json({
      success: true,
      tasks: tasks.map((task: any) => ({
        id: String(task._id),
        title: task.title,
        description: task.description,
        difficulty: task.difficulty,
        createdAt: task.createdAt,
      })),
    });
  } catch (error) {
    console.error("Tasks read error:", error);
    res.status(500).json({ success: false, error: "Unable to load tasks." });
  }
});

export async function requireAdminTaskRoute(req: any, res: any) {
  const user = await getCurrentUser(req);
  if (!user) {
    res.status(401).json({ success: false, error: "Authentication required." });
    return null;
  }
  if (user.role !== "admin") {
    res.status(403).json({ success: false, error: "Admin access required." });
    return null;
  }
  return user;
}

export default router;
