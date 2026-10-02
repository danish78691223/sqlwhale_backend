import { Router } from "express";
import Task from "../models/Task";
import { getCurrentUser } from "../services/mongoAuth";

const router = Router();

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
        expectedQuery: task.expectedQuery,
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
