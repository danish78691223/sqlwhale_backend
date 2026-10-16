import { Router } from "express";
import Task from "../models/Task.js";
import TaskCompletion from "../models/TaskCompletion.js";
import TaskRevealUsage from "../models/TaskRevealUsage.js";
import { getCurrentUser, markActivity, saveQueryHistory } from "../services/mongoAuth";
import { executeQuery } from "../services/execution.service";
import db from "../config/database";
import { resolveWorkspace, persistWorkspace } from "../database/workspaces";
import { runWithDatabase } from "../database/databaseContext";
import { parseCommand } from "../sql-engine/parser";
import { generateExplanation, generateStepExplanations } from "../services/explanation.service";
import { prepareVisualizationSteps } from "../services/visualization.service";
import {
  buildTaskExpectedResult,
  buildTaskExpectedSetup,
  executeAndGradeSetup,
  compareTaskResults,
  type TaskExpectedResult,
} from "../services/taskGrading.service";

const router = Router();

const FAILED_QUERIES_TASK_TITLE = "users with failed queries";
const TASK_USERS_TABLE = "task_failed_query_users";
const TASK_QUERY_HISTORY_TABLE = "task_failed_query_history";

const SQL_IDENTIFIER = /^[A-Za-z_][A-Za-z0-9_]{0,49}$/;
const SQL_COLUMN_TYPES: Record<string, string> = {
  INTEGER: "INTEGER", REAL: "REAL", TEXT: "TEXT", BOOLEAN: "INTEGER", DATE: "TEXT",
};

function provisionTaskTables(task: any, workspaceDatabase: any): void {
  const configured = Array.isArray(task.requiredTables) ? task.requiredTables : [];
  if (!configured.length) return;

  const pending = [...configured];
  const ordered: any[] = [];
  const names = new Set(pending.map((table) => String(table.tableName || "").toLowerCase()));
  while (pending.length) {
    const index = pending.findIndex((table) =>
      (Array.isArray(table.relationships) ? table.relationships : []).every((rel: any) =>
        !names.has(String(rel.referencesTable || "").toLowerCase()) ||
        ordered.some((ready) => String(ready.tableName).toLowerCase() === String(rel.referencesTable).toLowerCase())
      )
    );
    ordered.push(pending.splice(index < 0 ? 0 : index, 1)[0]);
  }

  for (const table of ordered) {
    const tableName = String(table.tableName || "");
    if (!SQL_IDENTIFIER.test(tableName) || !Array.isArray(table.columns) || !table.columns.length) {
      throw new Error("Task table configuration is invalid.");
    }
    const existing = workspaceDatabase.prepare(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND lower(name) = lower(?) LIMIT 1"
    ).get(tableName);
    if (existing) continue;

    const columnSql = table.columns.map((column: any) => {
      const name = String(column?.name || "");
      const type = SQL_COLUMN_TYPES[String(column?.type || "").toUpperCase()];
      if (!SQL_IDENTIFIER.test(name) || !type) throw new Error("Task table column configuration is invalid.");
      return "\"" + name + "\" " + type +
        (column.primaryKey ? " PRIMARY KEY" : "") +
        (column.notNull ? " NOT NULL" : "");
    });
    for (const relationship of Array.isArray(table.relationships) ? table.relationships : []) {
      if (!SQL_IDENTIFIER.test(String(relationship.column || "")) ||
          !SQL_IDENTIFIER.test(String(relationship.referencesTable || "")) ||
          !SQL_IDENTIFIER.test(String(relationship.referencesColumn || ""))) {
        throw new Error("Task table relationship configuration is invalid.");
      }
      columnSql.push("FOREIGN KEY (\"" + relationship.column + "\") REFERENCES \"" +
        relationship.referencesTable + "\" (\"" + relationship.referencesColumn + "\")");
    }
    workspaceDatabase.exec("CREATE TABLE \"" + tableName + "\" (" + columnSql.join(", ") + ")");

    const rows = Array.isArray(table.seedRows) ? table.seedRows : [];
    for (const row of rows) {
      const columns = table.columns.map((column: any) => String(column.name));
      const values = columns.map((name: string) => row && typeof row === "object" ? row[name] ?? null : null);
      const placeholders = columns.map(() => "?").join(", ");
      workspaceDatabase.prepare(
        "INSERT INTO \"" + tableName + "\" (" + columns.map((name: string) => "\"" + name + "\"").join(", ") +
        ") VALUES (" + placeholders + ")"
      ).run(...values);
    }
  }
}


function isFailedQueriesTask(task: any): boolean {
  return task.title?.trim().toLowerCase() === FAILED_QUERIES_TASK_TITLE;
}

/**
 * The exercise uses isolated, synthetic workspace tables. Translate the
 * exercise's familiar internal-table names only while grading this task;
 * the SQL engine's global internal-table protection remains unchanged.
 */
function rewriteFailedQueriesTaskSql(query: string): string {
  return query
    .replace(/\bwebxwhale_users\b/gi, TASK_USERS_TABLE)
    .replace(/\bquery_history\b/gi, TASK_QUERY_HISTORY_TABLE);
}


/**
 * Prepare the known shop-products exercise in the signed-in user's own
 * workspace. Never modify an existing shop table; sample data is inserted
 * only when this endpoint creates the table itself.
 */
router.post("/:id/start", async (req, res) => {
  try {
    const user = await getCurrentUser(req);
    if (!user) {
      return res.status(401).json({ success: false, error: "Sign in to start SQL tasks." });
    }

    const task: any = await Task.findOne({ _id: req.params.id, isActive: true }).lean().exec();
    if (!task) return res.status(404).json({ success: false, error: "Task not found." });

    // Server-side task sequence enforcement. Tasks are ordered oldest-first;
    // newly published tasks join the end of the path.
    const sequence = await Task.find({ isActive: true })
      .sort({ createdAt: 1, _id: 1 })
      .select("_id")
      .lean()
      .exec();
    const completedSet = new Set(
      (await TaskCompletion.find({
        localUserId: user.localUserId,
        taskId: { $in: sequence.map((item: any) => item._id) },
      }).select("taskId").lean().exec())
        .map((item: any) => String(item.taskId))
    );
    const nextTask = sequence.find((item: any) => !completedSet.has(String(item._id)));
    if (nextTask && String(nextTask._id) !== String(task._id)) {
      return res.status(409).json({
        success: false,
        code: "TASK_LOCKED",
        error: "Complete the previous task first to unlock this task.",
        unlockedTaskId: String(nextTask._id),
      });
    }


    if (task.taskType !== "setup" && Array.isArray(task.requiredTables) && task.requiredTables.length) {
      const taskWorkspace = await resolveWorkspace(req, res, user.localUserId);
      runWithDatabase(taskWorkspace.database, () => provisionTaskTables(task, taskWorkspace.database));
      await persistWorkspace(taskWorkspace.key, taskWorkspace.database);
    }

    const isShopProductsTask =
      task.title?.trim().toLowerCase() === "find available products above rs 1000" &&
      /\\bfrom\\s+shop\\b/i.test(task.expectedQuery || "");

    if (isShopProductsTask) {
      const workspace = await resolveWorkspace(req, res, user.localUserId);
      runWithDatabase(workspace.database, () => provisionTaskTables(task, workspace.database));
      const createdTable = runWithDatabase(workspace.database, () => {
        const existingTable = db.prepare(
          "SELECT name FROM sqlite_master WHERE type = 'table' AND lower(name) = 'shop' LIMIT 1"
        ).get() as { name: string } | undefined;

        if (existingTable) return false;

        db.exec(`
          CREATE TABLE shop (
            product_name TEXT,
            category TEXT,
            price REAL,
            stock INTEGER
          );
          INSERT INTO shop (product_name, category, price, stock) VALUES
            ('Keyboard', 'Accessories', 1500, 20),
            ('Mouse', 'Accessories', 800, 15),
            ('Monitor', 'Electronics', 7500, 12),
            ('USB Cable', 'Accessories', 1200, 5),
            ('Headphones', 'Audio', 1800, 10);
        `);
        return true;
      });
      await persistWorkspace(workspace.key, workspace.database);
      return res.json({ success: true, ready: true, sampleDataCreated: createdTable });
    }


    if (isFailedQueriesTask(task)) {
      const workspace = await resolveWorkspace(req, res, user.localUserId);
      runWithDatabase(workspace.database, () => {
        db.exec(`
          CREATE TABLE IF NOT EXISTS ${TASK_USERS_TABLE} (
            webxwhale_user_id INTEGER PRIMARY KEY,
            name TEXT NOT NULL,
            email TEXT NOT NULL
          );
          CREATE TABLE IF NOT EXISTS ${TASK_QUERY_HISTORY_TABLE} (
            id INTEGER PRIMARY KEY,
            webxwhale_user_id INTEGER NOT NULL,
            status TEXT NOT NULL
          );
          INSERT OR IGNORE INTO ${TASK_USERS_TABLE} (webxwhale_user_id, name, email) VALUES
            (1, 'Aarav Sharma', 'aarav@example.com'),
            (2, 'Priya Patel', 'priya@example.com'),
            (3, 'Kabir Khan', 'kabir@example.com'),
            (4, 'Meera Joshi', 'meera@example.com');
          INSERT OR IGNORE INTO ${TASK_QUERY_HISTORY_TABLE} (id, webxwhale_user_id, status) VALUES
            (1, 1, 'failed'),
            (2, 1, 'success'),
            (3, 1, 'failed'),
            (4, 2, 'success'),
            (5, 3, 'failed'),
            (6, 3, 'failed'),
            (7, 3, 'failed'),
            (8, 4, 'success');
        `);
      });
      await persistWorkspace(workspace.key, workspace.database);
      return res.json({ success: true, ready: true, sampleDataCreated: true });
    }

    return res.json({ success: true, ready: true });
  } catch (error) {
    console.error("Task workspace setup error:", error);
    return res.status(500).json({ success: false, error: "Unable to prepare this task's sample data." });
  }
});


router.post("/:id/reveal-answer", async (req, res) => {
  try {
    const user = await getCurrentUser(req);
    if (!user) {
      return res.status(401).json({
        success: false,
        code: "AUTH_REQUIRED",
        error: "Sign in to reveal task answers. Guest users cannot reveal answers.",
      });
    }

    const task: any = await Task.findOne({
      _id: req.params.id,
      isActive: true,
    }).lean().exec();

    if (!task) {
      return res.status(404).json({ success: false, error: "Task not found." });
    }

    const now = new Date();
    const windowMs = 24 * 60 * 60 * 1000;
    let usage: any = await TaskRevealUsage.findOne({ localUserId: user.localUserId }).exec();

    if (!usage) {
      try {
        usage = await TaskRevealUsage.create({
          localUserId: user.localUserId,
          count: 0,
          windowStartedAt: now,
        });
      } catch {
        usage = await TaskRevealUsage.findOne({ localUserId: user.localUserId }).exec();
      }
    }

    if (!usage) {
      return res.status(500).json({ success: false, error: "Unable to check reveal limit." });
    }

    const windowStartedAt = new Date(usage.windowStartedAt).getTime();
    if (now.getTime() - windowStartedAt >= windowMs) {
      usage.count = 0;
      usage.windowStartedAt = now;
      await usage.save();
    }

    if (usage.count >= 5) {
      const resetAt = new Date(new Date(usage.windowStartedAt).getTime() + windowMs);
      return res.status(429).json({
        success: false,
        code: "REVEAL_LIMIT_REACHED",
        error: "You've used all 5 answer reveals. Your limit resets after 24 hours. Subscribe to continue.",
        used: 5,
        limit: 5,
        resetAt: resetAt.toISOString(),
      });
    }

    const updatedUsage: any = await TaskRevealUsage.findOneAndUpdate(
      { localUserId: user.localUserId, count: { $lt: 5 } },
      { $inc: { count: 1 } },
      { new: true },
    ).exec();

    if (!updatedUsage) {
      const latest: any = await TaskRevealUsage.findOne({ localUserId: user.localUserId }).lean().exec();
      const resetAt = new Date(new Date(latest?.windowStartedAt ?? now).getTime() + windowMs);
      return res.status(429).json({
        success: false,
        code: "REVEAL_LIMIT_REACHED",
        error: "You've used all 5 answer reveals. Your limit resets after 24 hours. Subscribe to continue.",
        used: 5,
        limit: 5,
        resetAt: resetAt.toISOString(),
      });
    }

    return res.json({
      success: true,
      answer: task.expectedQuery,
      used: updatedUsage.count,
      remaining: Math.max(0, 5 - updatedUsage.count),
      limit: 5,
      resetAt: new Date(new Date(updatedUsage.windowStartedAt).getTime() + windowMs).toISOString(),
    });
  } catch (error) {
    console.error("Task answer reveal error:", error);
    return res.status(500).json({ success: false, error: "Unable to reveal this answer right now." });
  }
});

router.post("/:id/check", async (req, res) => {
  try {
    const user = await getCurrentUser(req);
    if (!user) {
      return res.status(401).json({ success: false, error: "Authentication required." });
    }

    await markActivity(user.localUserId);

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

    // Server-side task sequence enforcement. Tasks are ordered oldest-first;
    // newly published tasks join the end of the path.
    const sequence = await Task.find({ isActive: true })
      .sort({ createdAt: 1, _id: 1 })
      .select("_id")
      .lean()
      .exec();
    const completedSet = new Set(
      (await TaskCompletion.find({
        localUserId: user.localUserId,
        taskId: { $in: sequence.map((item: any) => item._id) },
      }).select("taskId").lean().exec())
        .map((item: any) => String(item.taskId))
    );
    const nextTask = sequence.find((item: any) => !completedSet.has(String(item._id)));
    if (nextTask && String(nextTask._id) !== String(task._id)) {
      return res.status(409).json({
        success: false,
        code: "TASK_LOCKED",
        error: "Complete the previous task first to unlock this task.",
        unlockedTaskId: String(nextTask._id),
      });
    }

    if (task.taskType === "setup" || task.expectedSetup) {
      let expectedSetup = task.expectedSetup;
      if (!expectedSetup?.tables?.length) {
        const builtSetup = buildTaskExpectedSetup(task.expectedQuery);
        if (!builtSetup.success) {
          return res.status(500).json({ success: false, error: "Unable to validate this setup task. Ask an admin to edit and save it again." });
        }
        expectedSetup = builtSetup.setup;
      }
      const workspace = await resolveWorkspace(req, res, user.localUserId);
      const startedAt = Date.now();
      const result = runWithDatabase(workspace.database, () =>
        executeAndGradeSetup(workspace.database, submittedQuery, expectedSetup)
      );
      const executionTimeMs = Date.now() - startedAt;
      await saveQueryHistory(user.localUserId, {
        query: submittedQuery,
        command: parseCommand(submittedQuery),
        status: result.correct ? "success" : "error",
        executionTimeMs,
        rowsReturned: 0,
        errorMessage: result.correct ? null : result.message || result.error || "Setup task did not match the expected schema and data.",
      });
      if (result.correct) {
        await persistWorkspace(workspace.key, workspace.database);
        await TaskCompletion.updateOne(
          { localUserId: user.localUserId, taskId: task._id },
          { $setOnInsert: {
            localUserId: user.localUserId,
            taskId: task._id,
            pointsAwarded: task.difficulty === "Hard" ? 20 : task.difficulty === "Medium" ? 15 : 10,
            completedAt: new Date(),
          } },
          { upsert: true },
        );
      }
      return res.json({
        success: true,
        correct: result.correct,
        status: result.correct ? "correct" : "incorrect",
        completed: result.correct,
        message: result.correct
          ? "Correct! Your table structure and records match the task requirements."
          : result.message || result.error || "Your setup does not match the expected table structure and records.",
      });
    }

    const submittedCommand = parseCommand(submittedQuery);
    if (submittedCommand !== "SELECT") {
      await saveQueryHistory(user.localUserId, {
        query: submittedQuery,
        command: submittedCommand,
        status: "error",
        executionTimeMs: 0,
        rowsReturned: 0,
        errorMessage: "Task submissions must be SELECT queries.",
      });

      return res.json({
        success: true,
        correct: false,
        status: "invalid",
        message: "Task submissions must be SELECT queries so SQLWhale can grade the final output.",
      });
    }

    const workspace = await resolveWorkspace(req, res, user.localUserId);
    const startedAt = Date.now();
    const queryToExecute = isFailedQueriesTask(task)
      ? rewriteFailedQueriesTaskSql(submittedQuery)
      : submittedQuery;
    const submitted = runWithDatabase(workspace.database, () => executeQuery(queryToExecute));
    const executionTimeMs = Date.now() - startedAt;
    if (!submitted.success || !submitted.result) {
      await saveQueryHistory(user.localUserId, {
        query: submittedQuery,
        command: submitted.command || submittedCommand,
        status: "error",
        executionTimeMs,
        rowsReturned: 0,
        errorMessage: submitted.error || "SQL query failed.",
      });

      return res.json({
        success: true,
        correct: false,
        status: "invalid",
        message: "Your SQL query could not be executed. Fix the query and try again.",
        executionError: submitted.error || null,
      });
    }

    await saveQueryHistory(user.localUserId, {
      query: submittedQuery,
      command: submitted.command || submittedCommand,
      status: "success",
      executionTimeMs,
      rowsReturned: submitted.result.rowCount,
      errorMessage: null,
    });

    const submittedResult: TaskExpectedResult = {
      columns: submitted.result.columns,
      rows: submitted.result.rows,
      rowCount: submitted.result.rowCount,
    };

    // The admin expected query is the source of truth for grading.
    // Execute it against the current database state instead of relying on
    // a stored output snapshot that can become stale after data changes.
    const expectedQueryToExecute = isFailedQueriesTask(task)
      ? rewriteFailedQueriesTaskSql(task.expectedQuery)
      : task.expectedQuery;
    const built = runWithDatabase(workspace.database, () => buildTaskExpectedResult(expectedQueryToExecute));
    if (!built.success) {
      console.error("Task expected query failed:", built.error);
      return res.status(500).json({
        success: false,
        error:
          "Unable to validate this task. Ask an admin to edit and save the task again.",
      });
    }

    const expectedResult = built.result;

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
            pointsAwarded:
              task.difficulty === "Hard"
                ? 20
                : task.difficulty === "Medium"
                  ? 15
                  : 10,
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
      .sort({ createdAt: 1, _id: 1 })
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
              .select("taskId")
              .lean()
              .exec()
          ).map((item: any) => String(item.taskId))
        )
      : new Set<string>();

    let nextUnlocked = Boolean(user);
    const taskSummaries = tasks.map((task: any, index: number) => {
      const id = String(task._id);
      const completed = completedIds.has(id);
      const unlocked = completed || nextUnlocked;
      if (!completed && unlocked) nextUnlocked = false;
      return {
        id,
        title: task.title,
        description: task.description,
        difficulty: task.difficulty,
        createdAt: task.createdAt,
        completed,
        unlocked,
        locked: !unlocked,
        order: index + 1,
      };
    });

    res.json({ success: true, tasks: taskSummaries });
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
