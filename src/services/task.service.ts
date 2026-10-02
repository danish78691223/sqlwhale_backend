import Task from "../models/Task.js";
import { getCurrentUser } from "./mongoAuth";

export async function listAdminTasks() {
  const tasks = await Task.find()
    .sort({ createdAt: -1 })
    .lean()
    .exec();

  return tasks.map((task: any) => ({
    id: String(task._id),
    title: task.title,
    description: task.description,
    expectedQuery: task.expectedQuery,
    difficulty: task.difficulty,
    isActive: task.isActive,
    createdAt: task.createdAt,
    updatedAt: task.updatedAt,
  }));
}
