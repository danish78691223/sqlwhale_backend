import { Router, type Request, type Response } from "express";
import User from "../models/User";
import Session from "../models/Session";
import QueryHistory from "../models/QueryHistory";
import LearningProgress from "../models/LearningProgress";
import LearningActivity from "../models/LearningActivity";
import SiteSettings, { type SiteSettingsDocument } from "../models/SiteSettings";
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

export default router;
