import { Router } from "express";
import Task from "../models/Task.js";
import TaskCompletion from "../models/TaskCompletion.js";
import { getCurrentUser } from "../services/mongoAuth";
import { executeQuery } from "../services/execution.service";
import { generateExplanation, generateStepExplanations } from "../services/explanation.service";
import { prepareVisualizationSteps } from "../services/visualization.service";
import {
  buildTaskExpectedResult,
  compareTaskResults,
  type TaskExpectedResult,
} from "../services/taskGrading.service";

const router = Router();

router.post("/:id/check", async (req, res) => {
  try {
    const user = await getCurrentUser(req);
    if (!user) {
      return res.status(401).json({ success: false, error: "Authentication required." });
    }

    const submittedQuery =
      typeof req.body?.query === "string" ? req.body.query.trim() : "";
    if (!submittedQuery) {
      return res.status(400).json({ success: false, error: "A SQL query is required." });
    }

    const task: any = await Task.findOne({
      _id: req.params.id,
      isActive: true,
    })
      .lean()
      .exec();

    if (!task) {
      return res.status(404).json({ success: false, error: "Task not found." });
    }

    const alreadyCompleted = await TaskCompletion.exists({
      localUserId: user.localUserId,
      taskId: task._id,
    });

    if (alreadyCompleted) {
      return res.json({
        success: true,
        correct: true,
        status: "correct",
        completed: true,
        alreadyCompleted: true,
        message: "Task already completed. You do not need to submit it again.",
      });
    }

    const submitted = executeQuery(submittedQuery);
    if (!submitted.success || !submitted.result) {
      return res.json({
        success: true,
        correct: false,
        status: "invalid",
        message: "Your SQL query could not be executed. Fix the query and try again.",
        executionError: submitted.error || null,
      });
    }

    const submittedResult: TaskExpectedResult = {
      columns: submitted.result.columns,
      rows: submitted.result.rows,
      rowCount: submitted.result.rowCount,
    };

    let expectedResult: TaskExpectedResult | null = null;

    if (Array.isArray(task.expectedColumns) && Array.isArray(task.expectedRows)) {
      expectedResult = {
        columns: task.expectedColumns,
        rows: task.expectedRows,
        rowCount: task.expectedRows.length,
      };
    } else {
      const built = buildTaskExpectedResult(task.expectedQuery);
      if (!built.success) {
        console.error("Task expected query failed:", built.error);
        return res.status(500).json({
          success: false,
          error: "Unable to validate this task. Ask an admin to edit and save the task again.",
        });
      }

      expectedResult = built.result;

      await Task.updateOne(
        { _id: task._id },
        {
          $set: {
            expectedColumns: expectedResult.columns,
            expectedRows: expectedResult.rows,
          },
        },
      );
    }

    const steps = submitted.steps ?? [];
    const execution = {
      steps,
      stepCount: steps.length,
      explanation: generateExplanation(steps),
      stepExplanations: generateStepExplanations(steps),
    };
    const visualization = prepareVisualizationSteps(steps);

    const correct = compareTaskResults(submittedResult, expectedResult);

    if (correct) {
      await TaskCompletion.updateOne(
        { localUserId: user.localUserId, taskId: task._id },
        {
          $setOnInsert: {
            localUserId: user.localUserId,
            taskId: task._id,
            completedAt: new Date(),
          },
        },
        { upsert: true },
      );
    }

    return res.json({
      success: true,
      correct,
      status: correct ? "correct" : "incorrect",
      completed: correct,
      message: correct
        ? "Correct! Your output matches the admin's expected output. Task completed."
        : "Incorrect. Your query ran successfully, but its output does not match the expected task output.",
      sqlResponse: {
        success: true,
        command: submitted.command,
        result: submitted.result,
        queryAnalysis: submitted.queryAnalysis,
        execution,
        visualization,
      },
    });
  } catch (error) {
    console.error("Task check error:", error);
    return res.status(500).json({ success: false, error: "Unable to check the task." });
  }
});

router.get("/", async (req, res) => {
  try {
    const tasks = await Task.find({ isActive: true })
      .sort({ createdAt: -1 })
      .lean()
      .exec();

    const user = await getCurrentUser(req);
    const completedIds = user
      ? new Set(
          (
            await TaskCompletion.find({
              localUserId: user.localUserId,
              taskId: { $in: tasks.map((task: any) => task._id) },
            })
              .lean()
              .exec()
          ).map((item: any) => String(item.taskId))
        )
      : new Set<string>();

    res.json({
      success: true,
      tasks: tasks.map((task: any) => ({
        id: String(task._id),
        title: task.title,
        description: task.description,
        difficulty: task.difficulty,
        createdAt: task.createdAt,
        completed: completedIds.has(String(task._id)),
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
