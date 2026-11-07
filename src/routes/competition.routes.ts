import { Router } from "express";
import mongoose from "mongoose";
import Competition from "../models/Competition";
import CompetitionRegistration from "../models/CompetitionRegistration";
import CompetitionSubmission from "../models/CompetitionSubmission";
import Task from "../models/Task";
import { getCurrentUser } from "../services/mongoAuth";

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

export default router;
