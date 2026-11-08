import { Router } from "express";
import mongoose from "mongoose";
import Competition from "../models/Competition";
import CompetitionRegistration from "../models/CompetitionRegistration";
import CompetitionSubmission from "../models/CompetitionSubmission";
import Task from "../models/Task";
import { resolveCompetitionWorkspace, persistWorkspace } from "../database/workspaces";
import { runWithDatabase } from "../database/databaseContext";
import { executeQuery } from "../services/execution.service";
import { parseCommand } from "../sql-engine/parser";
import { provisionTaskTables } from "./task.routes";
import { buildTaskExpectedResult, buildTaskExpectedSetup, executeAndGradeSetup, compareTaskResults } from "../services/taskGrading.service";
import { generateExplanation, generateStepExplanations } from "../services/explanation.service";
import { prepareVisualizationSteps } from "../services/visualization.service";
import { getCurrentUser } from "../services/mongoAuth";
import { getAllTables, getTableInfo } from "../database/sandbox";

const router = Router();

function publicCompetition(item: any) {
  return {
    id: String(item._id), title: item.title, slug: item.slug, description: item.description,
    status: item.status, taskCount: item.taskIds?.length ?? 0, points: item.points,
    registrationStartsAt: item.registrationStartsAt, registrationEndsAt: item.registrationEndsAt,
    startsAt: item.startsAt, endsAt: item.endsAt, certificateTopN: item.certificateTopN,
  };
}

router.get("/", async (_req, res) => {
  try {
    const items = await Competition.find({ status: { $ne: "draft" } }).sort({ startsAt: -1, createdAt: -1 }).lean().exec();
    res.json({ success: true, competitions: items.map(publicCompetition) });
  } catch (error) {
    console.error("Competition list error:", error);
    res.status(500).json({ success: false, error: "Unable to load competitions." });
  }
});

router.get("/:id", async (req, res) => {
  try {
    const filter = mongoose.isValidObjectId(req.params.id) ? { _id: req.params.id } : { slug: req.params.id };
    const item: any = await Competition.findOne({ ...filter, status: { $ne: "draft" } }).lean().exec();
    if (!item) return res.status(404).json({ success: false, error: "Competition not found." });
    const tasks = await Task.find({ _id: { $in: item.taskIds }, isActive: true })
      .select("title description difficulty taskType requiredTables")
      .lean().exec();
    const user = await getCurrentUser(req);
    const registration = user ? await CompetitionRegistration.findOne({ competitionId: item._id, localUserId: user.localUserId }).lean().exec() : null;
    const now = Date.now();
    const registrationOpen = (!item.registrationStartsAt || now >= new Date(item.registrationStartsAt).getTime()) &&
      (!item.registrationEndsAt || now <= new Date(item.registrationEndsAt).getTime()) &&
      ["scheduled", "live"].includes(item.status);
    res.json({
      success: true, competition: publicCompetition(item),
      tasks: tasks.map((task: any) => ({ id: String(task._id), title: task.title, description: task.description, difficulty: task.difficulty, taskType: task.taskType ?? "query", requiredTables: task.requiredTables ?? [] })),
      isAuthenticated: Boolean(user), isRegistered: Boolean(registration), registrationOpen,
    });
  } catch (error) {
    console.error("Competition details error:", error);
    res.status(500).json({ success: false, error: "Unable to load competition details." });
  }
});

router.post("/:id/register", async (req, res) => {
  try {
    const user: any = await getCurrentUser(req);
    if (!user) return res.status(401).json({ success: false, code: "AUTH_REQUIRED", error: "Sign in to register for this competition." });
    const item: any = await Competition.findById(req.params.id).lean().exec();
    if (!item || !["scheduled", "live"].includes(item.status)) return res.status(404).json({ success: false, error: "Competition is not open for registration." });
    const now = Date.now();
    if ((item.registrationStartsAt && now < new Date(item.registrationStartsAt).getTime()) ||
        (item.registrationEndsAt && now > new Date(item.registrationEndsAt).getTime())) {
      return res.status(409).json({ success: false, error: "Competition registration is not open right now." });
    }
    const registration = await CompetitionRegistration.findOneAndUpdate(
      { competitionId: item._id, localUserId: user.localUserId },
      { $setOnInsert: { competitionId: item._id, localUserId: user.localUserId, userEmail: user.email, displayName: user.name } },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    ).lean().exec();
    res.status(201).json({ success: true, registered: true, registration });
  } catch (error: any) {
    if (error?.code === 11000) return res.status(409).json({ success: false, error: "This email is already registered for the competition." });
    console.error("Competition registration error:", error);
    res.status(500).json({ success: false, error: "Unable to register for competition." });
  }
});

router.get("/:id/me", async (req, res) => {
  try {
    const user: any = await getCurrentUser(req);
    if (!user) return res.status(401).json({ success: false, error: "Sign in to view your competition progress." });
    const item: any = await Competition.findById(req.params.id).lean().exec();
    if (!item) return res.status(404).json({ success: false, error: "Competition not found." });
    const registration = await CompetitionRegistration.findOne({ competitionId: item._id, localUserId: user.localUserId }).lean().exec();
    if (!registration) return res.status(403).json({ success: false, code: "NOT_REGISTERED", error: "Register for this competition to unlock its tasks." });
    const submissions = await CompetitionSubmission.find({ competitionId: item._id, localUserId: user.localUserId }).lean().exec();
    const completed = new Set(submissions.filter((x: any) => x.isCorrect).map((x: any) => String(x.taskId)));
    const tasks = await Task.find({ _id: { $in: item.taskIds }, isActive: true }).select("title description difficulty taskType requiredTables").lean().exec();
    res.json({
      success: true, registered: true,
      competition: publicCompetition(item),
      progress: { completedTasks: completed.size, totalTasks: tasks.length, points: submissions.reduce((sum: number, x: any) => sum + (x.pointsAwarded || 0), 0) },
      tasks: tasks.map((task: any) => ({ id: String(task._id), title: task.title, description: task.description, difficulty: task.difficulty, taskType: task.taskType ?? "query", requiredTables: task.requiredTables ?? [], completed: completed.has(String(task._id)) })),
    });
  } catch (error) {
    console.error("Competition progress error:", error);
    res.status(500).json({ success: false, error: "Unable to load competition progress." });
  }
});

router.get("/:id/workspace/tables", async (req, res) => {
  try {
    const user: any = await getCurrentUser(req);
    if (!user) return res.status(401).json({ success: false, error: "Sign in to view your competition workspace." });
    const competition: any = await Competition.findById(req.params.id).lean().exec();
    if (!competition) return res.status(404).json({ success: false, error: "Competition not found." });
    const registration = await CompetitionRegistration.findOne({ competitionId: competition._id, localUserId: user.localUserId }).lean().exec();
    if (!registration && user.role !== "admin") return res.status(403).json({ success: false, error: "Register for this competition to view its workspace." });
    const workspace = await resolveCompetitionWorkspace(user.localUserId, String(competition._id));
    const tables = runWithDatabase(workspace.database, () => getAllTables());
    return res.json({ success: true, tables });
  } catch (error) {
    console.error("Competition workspace schema error:", error);
    return res.status(500).json({ success: false, error: "Unable to load competition workspace tables." });
  }
});

router.get("/:id/workspace/tables/:tableName", async (req, res) => {
  try {
    const user: any = await getCurrentUser(req);
    if (!user) return res.status(401).json({ success: false, error: "Sign in to view your competition workspace." });
    const competition: any = await Competition.findById(req.params.id).lean().exec();
    if (!competition) return res.status(404).json({ success: false, error: "Competition not found." });
    const registration = await CompetitionRegistration.findOne({ competitionId: competition._id, localUserId: user.localUserId }).lean().exec();
    if (!registration && user.role !== "admin") return res.status(403).json({ success: false, error: "Register for this competition to view its workspace." });
    const workspace = await resolveCompetitionWorkspace(user.localUserId, String(competition._id));
    const table = runWithDatabase(workspace.database, () => getTableInfo(String(req.params.tableName)));
    return res.json({ success: true, table });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to retrieve competition table.";
    return res.status(404).json({ success: false, error: message });
  }
});

router.post("/:id/tasks/:taskId/submit", async (req, res) => {
  try {
    const user: any = await getCurrentUser(req);
    if (!user) return res.status(401).json({ success: false, code: "AUTH_REQUIRED", error: "Sign in to submit competition tasks." });
    const competition: any = await Competition.findById(req.params.id).lean().exec();
    if (!competition) return res.status(404).json({ success: false, error: "Competition not found." });
    const now = Date.now();
    const isAdminPreview = user.role === "admin" && (
      competition.status !== "live" ||
      (competition.startsAt && now < new Date(competition.startsAt).getTime()) ||
      (competition.endsAt && now > new Date(competition.endsAt).getTime())
    );
    if (!isAdminPreview && (competition.status !== "live" ||
      (competition.startsAt && now < new Date(competition.startsAt).getTime()) ||
      (competition.endsAt && now > new Date(competition.endsAt).getTime()))) {
      return res.status(409).json({ success: false, code: "COMPETITION_NOT_LIVE", error: "Competition submissions are only accepted during the official live period." });
    }
    const registration = await CompetitionRegistration.findOne({ competitionId: competition._id, localUserId: user.localUserId }).lean().exec();
    if (!registration) return res.status(403).json({ success: false, code: "NOT_REGISTERED", error: "Register for this competition before submitting tasks." });
    if (!(competition.taskIds || []).some((id: any) => String(id) === req.params.taskId)) return res.status(404).json({ success: false, error: "This task is not assigned to the selected competition." });
    const query = typeof req.body?.query === "string" ? req.body.query.trim() : "";
    if (!query) return res.status(400).json({ success: false, error: "Enter a SQL query before submitting." });
    if (query.length > 20000) return res.status(413).json({ success: false, error: "SQL submission is too long." });
    const task: any = await Task.findOne({ _id: req.params.taskId, isActive: true }).lean().exec();
    if (!task) return res.status(404).json({ success: false, error: "Competition task is no longer available." });
    const workspace = await resolveCompetitionWorkspace(user.localUserId, String(competition._id));
    const startedAt = Date.now();
    const taskType = task.taskType === "setup" || task.expectedSetup ? "setup" : "query";
    let correct = false, message = "", executionError: string | null = null, sqlResponse: any = null;
    const existing: any = await CompetitionSubmission.findOne({ competitionId: competition._id, localUserId: user.localUserId, taskId: task._id }).lean().exec();
    if (taskType === "setup") {
      let expectedSetup = task.expectedSetup;
      if (!expectedSetup?.tables?.length) {
        const built = buildTaskExpectedSetup(task.expectedQuery);
        if (!built.success) return res.status(500).json({ success: false, error: "Unable to validate this setup task. Ask an admin to review it." });
        expectedSetup = built.setup;
      }
      const result = runWithDatabase(workspace.database, () => executeAndGradeSetup(workspace.database, query, expectedSetup));
      correct = Boolean(result.correct);
      message = correct ? "Correct! Your competition tables and records match the task requirements." : result.message || result.error || "The resulting tables do not match the task requirements.";
      executionError = result.error || null;
      if (correct) {
        const steps = [{ id: 1, operation: "create_table" as const, explanation: "Created and populated the required competition tables." }];
        sqlResponse = { success: true, command: "CREATE_TABLE", result: { columns: [], rows: [], rowCount: 0 }, execution: { steps, stepCount: steps.length, explanation: generateExplanation(steps), stepExplanations: generateStepExplanations(steps) }, visualization: prepareVisualizationSteps(steps) };
      }
    } else {
      const command = parseCommand(query);
      if (command !== "SELECT") message = "This competition task requires a SELECT query.";
      else {
        runWithDatabase(workspace.database, () => provisionTaskTables(task, workspace.database));
        const submitted = runWithDatabase(workspace.database, () => executeQuery(query));
        if (!submitted.success || !submitted.result) { executionError = submitted.error || "SQL query could not be executed."; message = "Your SQL query could not be executed. Fix the query and try again."; }
        else {
          const expected = runWithDatabase(workspace.database, () => buildTaskExpectedResult(task.expectedQuery));
          if (!expected.success) { console.error("Competition expected query failed:", expected.error); return res.status(500).json({ success: false, error: "Unable to validate this competition task. Ask an admin to review it." }); }
          correct = compareTaskResults({ columns: submitted.result.columns, rows: submitted.result.rows, rowCount: submitted.result.rowCount }, expected.result);
          message = correct ? "Correct! Your output matches the expected competition result." : "Your query ran successfully, but its output does not match the expected result.";
          const steps = submitted.steps ?? [];
          sqlResponse = { success: true, command: submitted.command, result: submitted.result, queryAnalysis: submitted.queryAnalysis, execution: { steps, stepCount: steps.length, explanation: generateExplanation(steps), stepExplanations: generateStepExplanations(steps) }, visualization: prepareVisualizationSteps(steps) };
        }
      }
    }
    if (taskType === "setup" || task.requiredTables?.length) await persistWorkspace(workspace.key, workspace.database);
    if (isAdminPreview) {
      return res.json({
        success: true, preview: true, correct,
        status: correct ? "correct" : (executionError ? "invalid" : "incorrect"),
        completed: false, pointsAwarded: 0, totalTaskPoints: 0,
        taskType, taskTitle: task.title,
        message: "Admin preview only — " + message + " No competition points or ranking records were created.",
        executionError, sqlResponse, executionTimeMs: Date.now() - startedAt,
      });
    }
    const points = correct ? Number(competition.points?.[task.difficulty] ?? (task.difficulty === "Hard" ? 15 : task.difficulty === "Medium" ? 10 : 5)) : 0;
    const alreadyCorrect = Boolean(existing?.isCorrect);
    const awardedNow = correct && !alreadyCorrect ? points : 0;
    if (existing) {
      await CompetitionSubmission.updateOne({ _id: existing._id }, { $inc: { attempts: 1 }, $set: { lastAttemptAt: new Date(), ...(correct && !alreadyCorrect ? { isCorrect: true, pointsAwarded: points, firstCorrectAt: new Date() } : {}) } }).exec();
    } else {
      try { await CompetitionSubmission.create({ competitionId: competition._id, localUserId: user.localUserId, taskId: task._id, attempts: 1, isCorrect: correct, pointsAwarded: points, firstCorrectAt: correct ? new Date() : null, lastAttemptAt: new Date() }); }
      catch (error: any) { if (error?.code !== 11000) throw error; await CompetitionSubmission.updateOne({ competitionId: competition._id, localUserId: user.localUserId, taskId: task._id }, { $inc: { attempts: 1 }, $set: { lastAttemptAt: new Date() } }).exec(); }
    }
    const latest: any = await CompetitionSubmission.findOne({ competitionId: competition._id, localUserId: user.localUserId, taskId: task._id }).lean().exec();
    return res.json({ success: true, correct, status: correct ? "correct" : (executionError ? "invalid" : "incorrect"), completed: Boolean(latest?.isCorrect), alreadyCompleted: alreadyCorrect, pointsAwarded: awardedNow, totalTaskPoints: latest?.pointsAwarded || 0, taskType, taskTitle: task.title, message, executionError, sqlResponse, executionTimeMs: Date.now() - startedAt });
  } catch (error) { console.error("Competition task submission error:", error); return res.status(500).json({ success: false, error: "Unable to submit this competition task right now." }); }
});

export default router;
