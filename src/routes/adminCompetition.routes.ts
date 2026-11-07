import { Router } from "express";
import mongoose from "mongoose";
import Competition from "../models/Competition";
import Task from "../models/Task";
import { getCurrentUser } from "../services/mongoAuth";

const router = Router();
async function requireAdmin(req: any, res: any) {
  const user: any = await getCurrentUser(req);
  if (!user) { res.status(401).json({ success: false, error: "Authentication required." }); return null; }
  if (user.role !== "admin") { res.status(403).json({ success: false, error: "Admin access required." }); return null; }
  return user;
}
const slugify = (value: string) => value.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

function normalizePayload(body: any) {
  const taskIds = Array.isArray(body.taskIds) ? [...new Set(body.taskIds.map(String))] : [];
  return {
    title: typeof body.title === "string" ? body.title.trim() : "",
    slug: slugify(typeof body.slug === "string" && body.slug.trim() ? body.slug : String(body.title || "")),
    description: typeof body.description === "string" ? body.description.trim() : "",
    status: ["draft", "scheduled", "live", "completed", "archived"].includes(body.status) ? body.status : "draft",
    taskIds,
    points: {
      Easy: Math.max(0, Number(body.points?.Easy ?? 5)),
      Medium: Math.max(0, Number(body.points?.Medium ?? 10)),
      Hard: Math.max(0, Number(body.points?.Hard ?? 15)),
    },
    registrationStartsAt: body.registrationStartsAt ? new Date(body.registrationStartsAt) : null,
    registrationEndsAt: body.registrationEndsAt ? new Date(body.registrationEndsAt) : null,
    startsAt: body.startsAt ? new Date(body.startsAt) : null,
    endsAt: body.endsAt ? new Date(body.endsAt) : null,
    certificateTopN: Math.max(0, Math.min(100, Number(body.certificateTopN ?? 3))),
  };
}

router.get("/", async (req, res) => {
  try {
    if (!await requireAdmin(req, res)) return;
    const [competitions, tasks] = await Promise.all([
      Competition.find().sort({ createdAt: -1 }).lean().exec(),
      Task.find().sort({ createdAt: -1 }).select("title difficulty isActive").lean().exec(),
    ]);
    res.json({
      success: true,
      competitions: competitions.map((x: any) => ({ ...x, id: String(x._id), taskIds: (x.taskIds || []).map(String) })),
      tasks: tasks.map((x: any) => ({ id: String(x._id), title: x.title, difficulty: x.difficulty, isActive: x.isActive })),
    });
  } catch (error) {
    console.error("Admin competitions list error:", error);
    res.status(500).json({ success: false, error: "Unable to load competitions." });
  }
});

router.post("/", async (req, res) => {
  try {
    const admin: any = await requireAdmin(req, res); if (!admin) return;
    const data = normalizePayload(req.body || {});
    if (!data.title || !data.slug) return res.status(400).json({ success: false, error: "Competition title is required." });
    if (data.taskIds.some((id) => !mongoose.isValidObjectId(id))) return res.status(400).json({ success: false, error: "One or more task IDs are invalid." });
    const activeTasks = await Task.countDocuments({ _id: { $in: data.taskIds }, isActive: true });
    if (activeTasks !== data.taskIds.length) return res.status(400).json({ success: false, error: "Select only existing active tasks." });
    if (data.startsAt && data.endsAt && data.endsAt <= data.startsAt) return res.status(400).json({ success: false, error: "Competition end must be after its start." });
    const competition = await Competition.create({ ...data, createdBy: String(admin._id) });
    res.status(201).json({ success: true, competition: { ...competition.toObject(), id: String(competition._id), taskIds: data.taskIds } });
  } catch (error: any) {
    if (error?.code === 11000) return res.status(409).json({ success: false, error: "A competition with this URL slug already exists." });
    console.error("Admin competition create error:", error);
    res.status(500).json({ success: false, error: "Unable to create competition." });
  }
});

router.patch("/:id", async (req, res) => {
  try {
    if (!await requireAdmin(req, res)) return;
    if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ success: false, error: "Invalid competition ID." });
    const data = normalizePayload(req.body || {});
    if (!data.title || !data.slug) return res.status(400).json({ success: false, error: "Competition title is required." });
    if (data.taskIds.some((id) => !mongoose.isValidObjectId(id))) return res.status(400).json({ success: false, error: "One or more task IDs are invalid." });
    const activeTasks = await Task.countDocuments({ _id: { $in: data.taskIds }, isActive: true });
    if (activeTasks !== data.taskIds.length) return res.status(400).json({ success: false, error: "Select only existing active tasks." });
    if (data.startsAt && data.endsAt && data.endsAt <= data.startsAt) return res.status(400).json({ success: false, error: "Competition end must be after its start." });
    const competition: any = await Competition.findByIdAndUpdate(req.params.id, { $set: data }, { new: true, runValidators: true }).lean().exec();
    if (!competition) return res.status(404).json({ success: false, error: "Competition not found." });
    res.json({ success: true, competition: { ...competition, id: String(competition._id), taskIds: (competition.taskIds || []).map(String) } });
  } catch (error: any) {
    if (error?.code === 11000) return res.status(409).json({ success: false, error: "A competition with this URL slug already exists." });
    console.error("Admin competition update error:", error);
    res.status(500).json({ success: false, error: "Unable to update competition." });
  }
});

router.delete("/:id", async (req, res) => {
  try {
    if (!await requireAdmin(req, res)) return;
    const deleted = await Competition.findByIdAndDelete(req.params.id).exec();
    if (!deleted) return res.status(404).json({ success: false, error: "Competition not found." });
    res.json({ success: true });
  } catch (error) {
    console.error("Admin competition delete error:", error);
    res.status(500).json({ success: false, error: "Unable to delete competition." });
  }
});

export default router;
