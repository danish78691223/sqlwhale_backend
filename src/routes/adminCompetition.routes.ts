import { Router } from "express";
import mongoose from "mongoose";
import crypto from "crypto";
import Competition from "../models/Competition";
import Task from "../models/Task";
import CompetitionRegistration from "../models/CompetitionRegistration";
import CompetitionSubmission from "../models/CompetitionSubmission";
import CompetitionCertificate from "../models/CompetitionCertificate";
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

router.get("/:id/results", async (req, res) => {
  try {
    if (!await requireAdmin(req, res)) return;
    const competition: any = await Competition.findById(req.params.id).lean().exec();
    if (!competition) return res.status(404).json({ success: false, error: "Competition not found." });
    const [registrations, submissions] = await Promise.all([
      CompetitionRegistration.find({ competitionId: competition._id }).lean().exec(),
      CompetitionSubmission.find({ competitionId: competition._id, isCorrect: true }).lean().exec(),
    ]);
    const byUser = new Map<string, any>();
    for (const registration of registrations as any[]) byUser.set(registration.localUserId, {
      localUserId: registration.localUserId, name: registration.displayName, email: registration.userEmail,
      registeredAt: registration.registeredAt, completedTasks: 0, points: 0, lastSolvedAt: 0,
    });
    for (const submission of submissions as any[]) {
      const row = byUser.get(submission.localUserId);
      if (!row) continue;
      row.completedTasks += 1; row.points += Number(submission.pointsAwarded || 0);
      row.lastSolvedAt = Math.max(row.lastSolvedAt, submission.firstCorrectAt ? new Date(submission.firstCorrectAt).getTime() : 0);
    }
    const ranked = [...byUser.values()].filter(x => x.completedTasks > 0)
      .sort((x, y) => y.points - x.points || y.completedTasks - x.completedTasks || x.lastSolvedAt - y.lastSolvedAt || x.name.localeCompare(y.name))
      .map((x, i) => ({ ...x, rank: i + 1 }));
    return res.json({ success: true, competition: { id: String(competition._id), title: competition.title, status: competition.status, finalizedAt: competition.finalizedAt || null }, participants: [...byUser.values()], ranking: competition.finalizedAt ? competition.frozenRanking : ranked });
  } catch (error) {
    console.error("Competition results error:", error);
    return res.status(500).json({ success: false, error: "Unable to load competition results." });
  }
});

router.post("/:id/finalize", async (req, res) => {
  try {
    if (!await requireAdmin(req, res)) return;
    const competition: any = await Competition.findById(req.params.id).exec();
    if (!competition) return res.status(404).json({ success: false, error: "Competition not found." });
    if (competition.finalizedAt) return res.status(409).json({ success: false, error: "Competition ranking is already frozen.", finalizedAt: competition.finalizedAt });
    if (competition.status !== "completed") return res.status(409).json({ success: false, error: "Set the competition status to completed before finalizing results." });
    const [registrations, submissions] = await Promise.all([
      CompetitionRegistration.find({ competitionId: competition._id }).lean().exec(),
      CompetitionSubmission.find({ competitionId: competition._id, isCorrect: true }).lean().exec(),
    ]);
    const byUser = new Map<string, any>();
    for (const registration of registrations as any[]) byUser.set(registration.localUserId, { localUserId: registration.localUserId, name: registration.displayName, completedTasks: 0, points: 0, lastSolvedAt: 0 });
    for (const submission of submissions as any[]) {
      const row = byUser.get(submission.localUserId); if (!row) continue;
      row.completedTasks += 1; row.points += Number(submission.pointsAwarded || 0);
      row.lastSolvedAt = Math.max(row.lastSolvedAt, submission.firstCorrectAt ? new Date(submission.firstCorrectAt).getTime() : 0);
    }
    const frozenRanking = [...byUser.values()].filter(x => x.completedTasks > 0)
      .sort((x, y) => y.points - x.points || y.completedTasks - x.completedTasks || x.lastSolvedAt - y.lastSolvedAt || x.name.localeCompare(y.name))
      .map((x, i) => ({ ...x, rank: i + 1 }));
    competition.frozenRanking = frozenRanking;
    competition.finalizedAt = new Date();
    await competition.save();
    return res.json({ success: true, finalized: true, finalizedAt: competition.finalizedAt, totalRankedUsers: frozenRanking.length, ranking: frozenRanking });
  } catch (error) {
    console.error("Competition finalization error:", error);
    return res.status(500).json({ success: false, error: "Unable to finalize competition." });
  }
});

router.post("/:id/approve-winners", async (req, res) => {
  try {
    const admin: any = await requireAdmin(req, res); if (!admin) return;
    const competition: any = await Competition.findById(req.params.id).lean().exec();
    if (!competition) return res.status(404).json({ success: false, error: "Competition not found." });
    if (!competition.finalizedAt || !Array.isArray(competition.frozenRanking)) return res.status(409).json({ success: false, error: "Finalize the competition ranking before approving winners." });
    const topN = Math.max(0, Number(competition.certificateTopN ?? 3));
    const winners = competition.frozenRanking.filter((entry: any) => entry.rank <= topN);
    const apiKey = process.env.RESEND_API_KEY;
    const from = process.env.RESEND_FROM_EMAIL || process.env.FROM_EMAIL;
    const base = (process.env.FRONTEND_URL || process.env.WEB_URL || "https://sqlwhale.webxwhale.com").replace(/\/+$/, "");
    const issued = [];
    for (const winner of winners) {
      const registration: any = await CompetitionRegistration.findOne({ competitionId: competition._id, localUserId: winner.localUserId }).lean().exec();
      if (!registration?.userEmail) continue;
      let certificate: any = await CompetitionCertificate.findOne({ competitionId: competition._id, localUserId: winner.localUserId }).lean().exec();
      if (!certificate) {
        try {
          certificate = await CompetitionCertificate.create({
            competitionId: competition._id, localUserId: winner.localUserId,
            certificateId: crypto.randomBytes(12).toString("hex").toUpperCase(),
            rank: winner.rank, participantName: registration.displayName, participantEmail: registration.userEmail,
            status: "approved", approvedBy: String(admin.localUserId || admin._id), approvedAt: new Date(),
          });
        } catch (error: any) {
          if (error?.code !== 11000) throw error;
          certificate = await CompetitionCertificate.findOne({ competitionId: competition._id, localUserId: winner.localUserId }).lean().exec();
        }
      }
      if (!certificate) continue;
      let emailStatus = certificate.emailStatus;
      let emailError = certificate.emailError || null;
      if (apiKey && from && emailStatus !== "sent") {
        const verifyUrl = base + "/verify-certificate?type=competition&id=" + encodeURIComponent(certificate.certificateId);
        const pdfUrl = base + "/competition-certificate/" + encodeURIComponent(certificate.certificateId);
        try {
          const mail = await fetch("https://api.resend.com/emails", {
            method: "POST",
            headers: { "Authorization": "Bearer " + apiKey, "Content-Type": "application/json" },
            body: JSON.stringify({
              from, to: [certificate.participantEmail],
              subject: "Your SQLWhale competition certificate",
              html: `<div style="font-family:Arial,sans-serif;max-width:600px;margin:auto;color:#172033"><h1>Congratulations, ${certificate.participantName}!</h1><p>You secured rank #${certificate.rank} in <strong>${competition.title}</strong>.</p><p>Your competition certificate has been approved by SQLWhale.</p><p><a href="${pdfUrl}" style="display:inline-block;padding:12px 18px;background:#facc15;color:#111;text-decoration:none;font-weight:bold;border-radius:8px">View & Download Certificate</a></p><p>Verify your certificate: <a href="${verifyUrl}">${verifyUrl}</a></p><p style="color:#64748b;font-size:12px">SQLWhale · WEBXWHALE</p></div>`,
            }),
          });
          if (!mail.ok) { emailError = (await mail.text()).slice(0, 1000); emailStatus = "failed"; }
          else { emailStatus = "sent"; emailError = null; }
        } catch (mailError: any) { emailStatus = "failed"; emailError = String(mailError?.message || mailError).slice(0, 1000); }
        await CompetitionCertificate.updateOne({ _id: certificate._id }, { $set: { emailStatus, emailError, ...(emailStatus === "sent" ? { emailSentAt: new Date() } : {}) } });
      } else if (!apiKey || !from) {
        emailStatus = "failed"; emailError = "Resend email is not configured (RESEND_API_KEY and RESEND_FROM_EMAIL/FROM_EMAIL required).";
        await CompetitionCertificate.updateOne({ _id: certificate._id }, { $set: { emailStatus, emailError } });
      }
      issued.push({ certificateId: certificate.certificateId, rank: certificate.rank, participantName: certificate.participantName, participantEmail: certificate.participantEmail, status: certificate.status, emailStatus, emailError });
    }
    const sent = issued.filter(x => x.emailStatus === "sent").length;
    const failed = issued.filter(x => x.emailStatus === "failed").length;
    return res.json({ success: true, approvedCount: issued.length, emailSentCount: sent, emailFailedCount: failed, certificates: issued, message: `${issued.length} winner certificate(s) approved. ${sent} email(s) sent; ${failed} need retry.` });
  } catch (error) {
    console.error("Winner approval error:", error);
    return res.status(500).json({ success: false, error: "Unable to approve competition winners." });
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
