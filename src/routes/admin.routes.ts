import { Router, type Request, type Response } from "express";
import User from "../models/User";
import Session from "../models/Session";
import QueryHistory from "../models/QueryHistory";
import LearningProgress from "../models/LearningProgress";
import LearningActivity from "../models/LearningActivity";
import SiteSettings, { type SiteSettingsDocument } from "../models/SiteSettings";
import Task from "../models/Task";
import TaskCompletion from "../models/TaskCompletion";
import { buildTaskExpectedResult } from "../services/taskGrading.service";
import { getCurrentUser, publicUser } from "../services/mongoAuth";

const router = Router();

async function requireAdmin(req: Request, res: Response) {
  const user = await getCurrentUser(req);
  if (!user) {
    res.status(401).json({ success: false, error: "Authentication required." });
    return null;
  }
  if (user.role !== "admin") {
    res.status(403).json({ success: false, error: "Admin access required." });
    return null;
  }
  return user as any;
}

function cleanUser(user: any) {
  return {
    id: String(user._id),
    localUserId: user.localUserId,
    name: user.name,
    email: user.email,
    role: user.role,
    currentPlan: user.currentPlan,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  };
}

router.get("/overview", async (req, res) => {
  try {
    const admin = await requireAdmin(req, res);
    if (!admin) return;

    const [users, admins, settingsRaw] = await Promise.all([
      User.countDocuments(),
      User.countDocuments({ role: "admin" }),
      SiteSettings.findOne({ key: "global" }).lean().exec(),
    ]);

    const settings = settingsRaw as SiteSettingsDocument | null;

    res.json({
      success: true,
      stats: { users, admins },
      maintenance: settings?.maintenance ?? {
        enabled: false,
        title: "SQLWhale is under maintenance",
        message: "We are making a few improvements. Please check back soon.",
        estimatedReturn: "",
      },
    });
  } catch (error) {
    console.error("Admin overview error:", error);
    res.status(500).json({ success: false, error: "Unable to load admin overview." });
  }
});

router.get("/users", async (req, res) => {
  try {
    const admin = await requireAdmin(req, res);
    if (!admin) return;

    const q = typeof req.query.q === "string" ? req.query.q.trim() : "";
    const filter = q
      ? { $or: [
          { name: { $regex: q, $options: "i" } },
          { email: { $regex: q, $options: "i" } },
          { localUserId: { $regex: q, $options: "i" } },
        ] }
      : {};

    const users = await User.find(filter)
      .select("_id localUserId name email role currentPlan createdAt updatedAt")
      .sort({ createdAt: -1 })
      .limit(500)
      .lean()
      .exec();

    res.json({ success: true, users: users.map(cleanUser) });
  } catch (error) {
    console.error("Admin users error:", error);
    res.status(500).json({ success: false, error: "Unable to load users." });
  }
});

router.patch("/users/:id", async (req, res) => {
  try {
    const admin = await requireAdmin(req, res);
    if (!admin) return;

    const id = req.params.id;
    const target = await User.findById(id).exec() as any;
    if (!target) return res.status(404).json({ success: false, error: "User not found." });

    const updates: Record<string, string> = {};
    for (const field of ["name", "email", "role", "currentPlan"]) {
      if (typeof req.body?.[field] === "string") {
        const value = req.body[field].trim();
        if (value) updates[field] = field === "email" ? value.toLowerCase() : value;
      }
    }

    if (updates.email && !/^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/.test(updates.email)) {
      return res.status(400).json({ success: false, error: "Enter a valid email address." });
    }
    if (updates.role && !["user", "admin"].includes(updates.role)) {
      return res.status(400).json({ success: false, error: "Role must be user or admin." });
    }

    if (String(target._id) === String(admin._id) && updates.role === "user") {
      return res.status(400).json({ success: false, error: "You cannot remove your own admin access." });
    }

    const updated = await User.findByIdAndUpdate(
      id,
      { $set: updates },
      { new: true, runValidators: true }
    ).lean().exec();

    res.json({ success: true, user: cleanUser(updated) });
  } catch (error: any) {
    if (error?.code === 11000) {
      return res.status(409).json({ success: false, error: "That email is already in use." });
    }
    console.error("Admin update user error:", error);
    res.status(500).json({ success: false, error: "Unable to update user." });
  }
});

router.delete("/users/:id", async (req, res) => {
  try {
    const admin = await requireAdmin(req, res);
    if (!admin) return;

    const id = req.params.id;
    const target = await User.findById(id).lean().exec() as any;
    if (!target) return res.status(404).json({ success: false, error: "User not found." });
    if (String(target._id) === String(admin._id)) {
      return res.status(400).json({ success: false, error: "You cannot delete your own admin account." });
    }

    const localUserId = target.localUserId;
    await Promise.all([
      User.deleteOne({ _id: id }),
      Session.deleteMany({ localUserId }),
      QueryHistory.deleteMany({ localUserId }),
      LearningProgress.deleteMany({ localUserId }),
      LearningActivity.deleteMany({ localUserId }),
    ]);

    res.json({ success: true });
  } catch (error) {
    console.error("Admin delete user error:", error);
    res.status(500).json({ success: false, error: "Unable to delete user." });
  }
});

router.get("/maintenance", async (req, res) => {
  try {
    const settings = await SiteSettings.findOne({ key: "global" }).lean().exec() as SiteSettingsDocument | null;
    res.json({
      success: true,
      maintenance: settings?.maintenance ?? {
        enabled: false,
        title: "SQLWhale is under maintenance",
        message: "We are making a few improvements. Please check back soon.",
        estimatedReturn: "",
      },
    });
  } catch (error) {
    console.error("Maintenance read error:", error);
    res.status(500).json({ success: false, error: "Unable to load maintenance settings." });
  }
});

router.patch("/maintenance", async (req, res) => {
  try {
    const admin = await requireAdmin(req, res);
    if (!admin) return;

    const maintenance = {
      enabled: Boolean(req.body?.enabled),
      title: typeof req.body?.title === "string" ? req.body.title.trim() : "SQLWhale is under maintenance",
      message: typeof req.body?.message === "string" ? req.body.message.trim() : "We are making a few improvements. Please check back soon.",
      estimatedReturn: typeof req.body?.estimatedReturn === "string" ? req.body.estimatedReturn.trim() : "",
    };

    if (!maintenance.title || !maintenance.message) {
      return res.status(400).json({ success: false, error: "Maintenance title and message are required." });
    }

    const settings = await SiteSettings.findOneAndUpdate(
      { key: "global" },
      { $set: { maintenance }, $setOnInsert: { key: "global" } },
      { upsert: true, new: true }
    ).lean().exec() as SiteSettingsDocument | null;

    res.json({ success: true, maintenance: settings?.maintenance });
  } catch (error) {
    console.error("Maintenance update error:", error);
    res.status(500).json({ success: false, error: "Unable to update maintenance settings." });
  }
});


router.get("/tasks", async (req, res) => {
  try {
    const admin = await requireAdmin(req, res);
    if (!admin) return;

    const tasks = await Task.find()
      .sort({ createdAt: -1 })
      .lean()
      .exec();

    res.json({
      success: true,
      tasks: tasks.map((task: any) => ({
        id: String(task._id),
        title: task.title,
        description: task.description,
        expectedQuery: task.expectedQuery,
        expectedColumns: task.expectedColumns ?? null,
        expectedRows: task.expectedRows ?? null,
        difficulty: task.difficulty,
        isActive: task.isActive,
        createdAt: task.createdAt,
        updatedAt: task.updatedAt,
      })),
    });
  } catch (error) {
    console.error("Admin tasks error:", error);
    res.status(500).json({ success: false, error: "Unable to load tasks." });
  }
});

router.post("/tasks", async (req, res) => {
  try {
    const admin = await requireAdmin(req, res);
    if (!admin) return;

    const title = typeof req.body?.title === "string" ? req.body.title.trim() : "";
    const description = typeof req.body?.description === "string" ? req.body.description.trim() : "";
    const expectedQuery = typeof req.body?.expectedQuery === "string" ? req.body.expectedQuery.trim() : "";
    const difficulty = typeof req.body?.difficulty === "string" ? req.body.difficulty : "Easy";
    const isActive = req.body?.isActive !== false;

    if (!title || !description || !expectedQuery) {
      return res.status(400).json({ success: false, error: "Task title, description and expected SQL query are required." });
    }
    if (!["Easy", "Medium", "Hard"].includes(difficulty)) {
      return res.status(400).json({ success: false, error: "Difficulty must be Easy, Medium or Hard." });
    }

    const expected = buildTaskExpectedResult(expectedQuery);
    if (!expected.success) {
      return res.status(400).json({
        success: false,
        error: "Expected SQL is invalid: " + expected.error,
      });
    }

    const task = await Task.create({
      title,
      description,
      expectedQuery,
      expectedColumns: expected.result.columns,
      expectedRows: expected.result.rows,
      difficulty,
      isActive,
      createdBy: String((admin as any)._id),
    });

    res.status(201).json({
      success: true,
      task: {
        id: String(task._id),
        title: task.title,
        description: task.description,
        expectedQuery: task.expectedQuery,
        expectedColumns: task.expectedColumns,
        expectedRows: task.expectedRows,
        difficulty: task.difficulty,
        isActive: task.isActive,
        createdAt: task.createdAt,
        updatedAt: task.updatedAt,
      },
    });
  } catch (error) {
    console.error("Admin task create error:", error);
    res.status(500).json({ success: false, error: "Unable to create task." });
  }
});

router.patch("/tasks/:id", async (req, res) => {
  try {
    const admin = await requireAdmin(req, res);
    if (!admin) return;

    const existing: any = await Task.findById(req.params.id).lean().exec();
    if (!existing) {
      return res.status(404).json({ success: false, error: "Task not found." });
    }

    const updates: Record<string, unknown> = {};
    let expectedQueryChanged = false;

    for (const field of ["title", "description", "expectedQuery"]) {
      if (typeof req.body?.[field] === "string") {
        const value = req.body[field].trim();
        if (value) {
          updates[field] = value;
          if (field === "expectedQuery" && value !== existing.expectedQuery) {
            expectedQueryChanged = true;
          }
        }
      }
    }

    if (typeof req.body?.difficulty === "string" && ["Easy", "Medium", "Hard"].includes(req.body.difficulty)) {
      updates.difficulty = req.body.difficulty;
    }
    if (typeof req.body?.isActive === "boolean") updates.isActive = req.body.isActive;

    if (expectedQueryChanged) {
      const expected = buildTaskExpectedResult(String(updates.expectedQuery));
      if (!expected.success) {
        return res.status(400).json({
          success: false,
          error: "Expected SQL is invalid: " + expected.error,
        });
      }

      updates.expectedColumns = expected.result.columns;
      updates.expectedRows = expected.result.rows;
    } else if (!Array.isArray(existing.expectedColumns) || !Array.isArray(existing.expectedRows)) {
      const expected = buildTaskExpectedResult(existing.expectedQuery);
      if (expected.success) {
        updates.expectedColumns = expected.result.columns;
        updates.expectedRows = expected.result.rows;
      }
    }

    const task: any = await Task.findByIdAndUpdate(
      req.params.id,
      { $set: updates },
      { new: true, runValidators: true }
    ).lean().exec();

    if (!task) return res.status(404).json({ success: false, error: "Task not found." });

    if (expectedQueryChanged) {
      await TaskCompletion.deleteMany({ taskId: task._id });
    }

    res.json({
      success: true,
      task: {
        id: String(task._id),
        title: task.title,
        description: task.description,
        expectedQuery: task.expectedQuery,
        expectedColumns: task.expectedColumns ?? null,
        expectedRows: task.expectedRows ?? null,
        difficulty: task.difficulty,
        isActive: task.isActive,
        createdAt: task.createdAt,
        updatedAt: task.updatedAt,
      },
    });
  } catch (error) {
    console.error("Admin task update error:", error);
    res.status(500).json({ success: false, error: "Unable to update task." });
  }
});

router.delete("/tasks/:id", async (req, res) => {
  try {
    const admin = await requireAdmin(req, res);
    if (!admin) return;

    const deleted: any = await Task.findByIdAndDelete(req.params.id).lean().exec();
    if (!deleted) return res.status(404).json({ success: false, error: "Task not found." });

    await TaskCompletion.deleteMany({ taskId: deleted._id });

    res.json({ success: true });
  } catch (error) {
    console.error("Admin task delete error:", error);
    res.status(500).json({ success: false, error: "Unable to delete task." });
  }
});

export default router;
