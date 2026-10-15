import { Router, type Request, type Response } from "express";
import User from "../models/User";
import Session from "../models/Session";
import QueryHistory from "../models/QueryHistory";
import LearningProgress from "../models/LearningProgress";
import LearningActivity from "../models/LearningActivity";
import SiteSettings, { type SiteSettingsDocument } from "../models/SiteSettings";
import Task from "../models/Task";
import TaskTableTemplate from "../models/TaskTableTemplate";
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
    adminPlanOverride: user.adminPlanOverride ?? null,
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
      .select("_id localUserId name email role currentPlan adminPlanOverride createdAt updatedAt")
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

    if (updates.currentPlan && !["Starter", "SQLWhale Premium"].includes(updates.currentPlan)) {
      return res.status(400).json({ success: false, error: "Plan must be Starter or SQLWhale Premium." });
    }

    // Admin plan changes are explicit overrides for support cases where a
    // successful payment did not synchronize to the user's profile.
    if (updates.currentPlan) updates.adminPlanOverride = updates.currentPlan;

    if (updates.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(updates.email)) {
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



const DEFAULT_TASK_TABLE_TEMPLATES = [
  { name: "departments", description: "Departments and office locations", isDefault: true, columns: [{ name: "department_id", type: "INTEGER", primaryKey: true }, { name: "department_name", type: "TEXT", notNull: true }, { name: "location", type: "TEXT", notNull: true }], relationships: [], seedRows: [{ department_id: 1, department_name: "IT", location: "Pune" }, { department_id: 2, department_name: "HR", location: "Mumbai" }, { department_id: 3, department_name: "Finance", location: "Bengaluru" }] },
  { name: "employees", description: "Employees linked to departments", isDefault: true, columns: [{ name: "employee_id", type: "INTEGER", primaryKey: true }, { name: "name", type: "TEXT", notNull: true }, { name: "department_id", type: "INTEGER", notNull: true }], relationships: [{ column: "department_id", referencesTable: "departments", referencesColumn: "department_id" }], seedRows: [{ employee_id: 1, name: "Aisha", department_id: 1 }, { employee_id: 2, name: "Rahul", department_id: 2 }, { employee_id: 3, name: "Kabir", department_id: 1 }, { employee_id: 4, name: "Sara", department_id: 3 }] },
  { name: "projects", description: "Projects assigned to employees", isDefault: true, columns: [{ name: "project_id", type: "INTEGER", primaryKey: true }, { name: "employee_id", type: "INTEGER", notNull: true }, { name: "project_name", type: "TEXT", notNull: true }], relationships: [{ column: "employee_id", referencesTable: "employees", referencesColumn: "employee_id" }], seedRows: [{ project_id: 1, employee_id: 1, project_name: "Website" }, { project_id: 2, employee_id: 3, project_name: "API" }, { project_id: 3, employee_id: 3, project_name: "Dashboard" }, { project_id: 4, employee_id: 4, project_name: "Billing" }] },
  { name: "shop", description: "Products, prices and stock for inventory tasks", isDefault: true, columns: [{ name: "product_name", type: "TEXT", notNull: true }, { name: "category", type: "TEXT", notNull: true }, { name: "price", type: "REAL", notNull: true }, { name: "stock", type: "INTEGER", notNull: true }], relationships: [], seedRows: [{ product_name: "Keyboard", category: "Accessories", price: 1500, stock: 20 }, { product_name: "Mouse", category: "Accessories", price: 800, stock: 15 }, { product_name: "Monitor", category: "Electronics", price: 7500, stock: 12 }, { product_name: "USB Cable", category: "Accessories", price: 1200, stock: 5 }, { product_name: "Headphones", category: "Audio", price: 1800, stock: 10 }] },
];

router.get("/table-templates", async (req, res) => {
  try {
    const admin = await requireAdmin(req, res);
    if (!admin) return;
    for (const template of DEFAULT_TASK_TABLE_TEMPLATES) {
      await TaskTableTemplate.updateOne(
        { name: template.name },
        { $setOnInsert: template },
        { upsert: true }
      ).exec();
    }
    const templates = await TaskTableTemplate.find().sort({ name: 1 }).lean().exec();
    res.json({ success: true, templates: templates.map((item: any) => ({
      id: String(item._id), name: item.name, description: item.description,
      columns: item.columns, relationships: item.relationships, seedRows: item.seedRows,
      isDefault: item.isDefault,
    })) });
  } catch (error) {
    console.error("Admin table templates error:", error);
    res.status(500).json({ success: false, error: "Unable to load table templates." });
  }
});

router.post("/table-templates", async (req, res) => {
  try {
    const admin = await requireAdmin(req, res);
    if (!admin) return;
    const name = typeof req.body?.name === "string" ? req.body.name.trim() : "";
    const columns = Array.isArray(req.body?.columns) ? req.body.columns : [];
    const relationships = Array.isArray(req.body?.relationships) ? req.body.relationships : [];
    const seedRows = Array.isArray(req.body?.seedRows) ? req.body.seedRows : [];
    if (!/^[A-Za-z_][A-Za-z0-9_]{0,49}$/.test(name) || !columns.length) {
      return res.status(400).json({ success: false, error: "Use a valid table name and provide at least one column." });
    }
    for (const column of columns) {
      if (!/^[A-Za-z_][A-Za-z0-9_]{0,49}$/.test(String(column?.name || "")) ||
          !["INTEGER", "REAL", "TEXT", "BOOLEAN", "DATE"].includes(column?.type)) {
        return res.status(400).json({ success: false, error: "Each column needs a valid name and supported data type." });
      }
    }
    const template = await TaskTableTemplate.create({
      name, description: String(req.body?.description || "").trim(), columns, relationships, seedRows, isDefault: false,
    });
    res.status(201).json({ success: true, template: { id: String(template._id), name: template.name, description: template.description, columns: template.columns, relationships: template.relationships, seedRows: template.seedRows, isDefault: template.isDefault } });
  } catch (error: any) {
    if (error?.code === 11000) return res.status(409).json({ success: false, error: "A table template with that name already exists." });
    console.error("Admin table template create error:", error);
    res.status(500).json({ success: false, error: "Unable to create table template." });
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
        requiredTables: task.requiredTables ?? [],
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
    const requiredTables = Array.isArray(req.body?.requiredTables) ? req.body.requiredTables : [];

    if (!title || !description || !expectedQuery) {
      return res.status(400).json({ success: false, error: "Task title, description and expected SQL query are required." });
    }
    if (!["Easy", "Medium", "Hard"].includes(difficulty)) {
      return res.status(400).json({ success: false, error: "Difficulty must be Easy, Medium or Hard." });
    }

    const expected = requiredTables.length ? null : buildTaskExpectedResult(expectedQuery);
    if (expected && !expected.success) {
      return res.status(400).json({
        success: false,
        error: "Expected SQL is invalid: " + expected.error,
      });
    }

    const task = await Task.create({
      title,
      description,
      expectedQuery,
      expectedColumns: expected?.success ? expected.result.columns : null,
      expectedRows: expected?.success ? expected.result.rows : null,
      requiredTables,
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
        requiredTables: task.requiredTables ?? [],
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
    const requiredTables = Array.isArray(req.body?.requiredTables) ? req.body.requiredTables : existing.requiredTables ?? [];
    if (Array.isArray(req.body?.requiredTables)) updates.requiredTables = requiredTables;

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
      const expected = requiredTables.length ? null : buildTaskExpectedResult(String(updates.expectedQuery));
      if (expected && !expected.success) {
        return res.status(400).json({
          success: false,
          error: "Expected SQL is invalid: " + expected.error,
        });
      }

      updates.expectedColumns = expected?.success ? expected.result.columns : null;
      updates.expectedRows = expected?.success ? expected.result.rows : null;
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
        requiredTables: task.requiredTables ?? [],
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
