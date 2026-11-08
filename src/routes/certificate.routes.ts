import { Router } from "express";
import crypto from "crypto";
import { getCurrentUser } from "../services/mongoAuth";
import { modules } from "./learning.routes";
import { MonthlySubscription, SubscriptionPayment } from "../models/SubscriptionPayment";
import LearningProgress from "../models/LearningProgress";
import Certificate from "../models/Certificate";
import User from "../models/User";
import CompetitionCertificate from "../models/CompetitionCertificate";
import Competition from "../models/Competition";

const router = Router();

/**
 * Public verification endpoint. Accepts the printed SQLW- ID or the stored ID.
 * Only certificates that have been officially issued are considered valid.
 */
router.get("/verify/:certificateId", async (req, res) => {
  try {
    const suppliedId = String(req.params.certificateId || "").trim().toUpperCase().replace(/\s+/g, "");
    const certificateId = suppliedId.startsWith("SQLW-") ? suppliedId.slice(5) : suppliedId;

    if (!certificateId || certificateId.length > 80 || !/^[A-Z0-9-]+$/.test(certificateId)) {
      return res.status(400).json({ success: false, valid: false, error: "Enter a valid certificate ID." });
    }

    const certificate: any = await Certificate.findOne({ certificateId, kind: "issued" })
      .select("certificateId localUserId courseKey createdAt")
      .lean()
      .exec();

    if (!certificate) {
      return res.status(404).json({
        success: true,
        valid: false,
        message: "No officially issued certificate was found for this ID. Check the ID and try again.",
      });
    }

    const user: any = await User.findOne({ localUserId: certificate.localUserId })
      .select("name")
      .lean()
      .exec();

    return res.json({
      success: true,
      valid: true,
      certificate: {
        certificateId: certificate.certificateId,
        learnerName: user?.name || "SQLWhale Learner",
        courseName: certificate.courseKey === "sql-fundamentals"
          ? "SQL Fundamentals & Database Mastery"
          : certificate.courseKey,
        issuedAt: certificate.createdAt,
        issuer: "SQLWhale · WEBXWHALE",
      },
    });
  } catch (error) {
    console.error("Unable to verify certificate:", error);
    return res.status(500).json({
      success: false,
      valid: false,
      error: "Unable to verify this certificate right now. Please try again.",
    });
  }
});

router.get("/competition/mine", async (req, res) => {
  try {
    const user: any = await getCurrentUser(req);
    if (!user) return res.status(401).json({ success: false, error: "Authentication required." });
    const certificates = await CompetitionCertificate.find({ localUserId: user.localUserId, status: "approved" }).sort({ approvedAt: -1 }).lean().exec();
    const competitionIds = [...new Set(certificates.map((item: any) => String(item.competitionId)))];
    const competitions = await Competition.find({ _id: { $in: competitionIds } }).select("title").lean().exec();
    const names = new Map(competitions.map((item: any) => [String(item._id), item.title]));
    return res.json({ success: true, certificates: certificates.map((item: any) => ({
      certificateId: item.certificateId, competitionId: String(item.competitionId), competitionTitle: names.get(String(item.competitionId)) || "SQLWhale Competition",
      rank: item.rank, participantName: item.participantName, issuedAt: item.approvedAt, emailStatus: item.emailStatus,
      verificationUrl: `/verify-certificate?type=competition&id=${encodeURIComponent(item.certificateId)}`,
    })) });
  } catch (error) {
    console.error("Competition certificates mine error:", error);
    return res.status(500).json({ success: false, error: "Unable to load competition certificates." });
  }
});

router.get("/competition/verify/:certificateId", async (req, res) => {
  try {
    const certificateId = String(req.params.certificateId || "").trim().toUpperCase();
    if (!/^[A-F0-9]{24}$/.test(certificateId)) return res.status(400).json({ success: true, valid: false, message: "Invalid certificate ID." });
    const certificate: any = await CompetitionCertificate.findOne({ certificateId, status: "approved" }).lean().exec();
    if (!certificate) return res.status(404).json({ success: true, valid: false, message: "No approved competition certificate was found for this ID." });
    const competition: any = await Competition.findById(certificate.competitionId).select("title").lean().exec();
    return res.json({ success: true, valid: true, certificate: {
      certificateId: certificate.certificateId, learnerName: certificate.participantName,
      competitionName: competition?.title || "SQLWhale Competition", rank: certificate.rank,
      issuedAt: certificate.approvedAt, issuer: "SQLWhale · WEBXWHALE",
    } });
  } catch (error) {
    console.error("Competition certificate verification error:", error);
    return res.status(500).json({ success: false, valid: false, error: "Unable to verify this competition certificate." });
  }
});

router.get("/mine", async (req, res) => {
  try {
    const user: any = await getCurrentUser(req);
    if (!user) return res.status(401).json({ success: false, error: "Authentication required." });

    const localUserId = String(user.localUserId);
    const now = new Date();
    const [completedItems, payment, monthly] = await Promise.all([
      LearningProgress.find({ localUserId }).select("sectionId").lean().exec(),
      SubscriptionPayment.findOne({
        localUserId, status: "paid",
        $or: [{ accessUntil: null }, { accessUntil: { $gt: now } }],
      }).sort({ verifiedAt: -1 }).lean().exec() as any,
      MonthlySubscription.findOne({ localUserId }).sort({ createdAt: -1 }).lean().exec() as any,
    ]);

    const completed = new Set(completedItems.map((item: any) => item.sectionId));
    const totalModules = modules.length;
    const completedCount = modules.filter((module) => completed.has(module.sectionId)).length;
    const allModulesCompleted = totalModules > 0 && completedCount === totalModules;
    const monthlyPeriodCurrent = Boolean(monthly?.currentPeriodEnd && new Date(monthly.currentPeriodEnd).getTime() > now.getTime());
    const monthlyVerified = Boolean(monthly?.activatedAt || monthly?.lastPaymentAt || monthly?.paymentId);
    const recurringActive = Boolean(monthly && (monthly.status === "active" || (monthlyVerified && monthlyPeriodCurrent)));
    const monthlyAccess = recurringActive || (monthlyVerified && monthlyPeriodCurrent);
    const paymentAccess = Boolean(payment && (!payment.accessUntil || new Date(payment.accessUntil).getTime() > now.getTime()));
    const premium = user.adminPlanOverride === "Starter" ? false
      : user.adminPlanOverride === "SQLWhale Premium" ? true
      : monthlyAccess || paymentAccess || (!monthly && !payment && user.currentPlan === "SQLWhale Premium");
    const eligible = premium && allModulesCompleted;

    const base = { eligible, subscribed: premium, allModulesCompleted, completedCount, totalModules };
    if (!eligible) return res.json({ success: true, ...base, certificate: { learnerName: user.name, certificateId: null } });

    const courseKey = "sql-fundamentals";
    let certificate: any = await Certificate.findOne({ localUserId, courseKey, kind: "issued" }).lean().exec();
    if (!certificate) {
      try {
        certificate = await Certificate.findOneAndUpdate(
          { localUserId, courseKey, kind: "issued" },
          { $setOnInsert: {
            localUserId, courseKey, kind: "issued",
            certificateId: crypto.randomBytes(12).toString("hex").toUpperCase(),
          } },
          { upsert: true, new: true, setDefaultsOnInsert: true },
        ).lean().exec();
      } catch (error: any) {
        if (error?.code !== 11000) throw error;
        certificate = await Certificate.findOne({ localUserId, courseKey, kind: "issued" }).lean().exec();
        if (!certificate) throw error;
      }
    }
    return res.json({ success: true, ...base, certificate: {
      certificateId: certificate.certificateId,
      learnerName: user.name,
      kind: certificate.kind,
      createdAt: certificate.createdAt,
    } });
  } catch (error) {
    console.error("Unable to load certificate:", error);
    return res.status(500).json({ success: false, error: "Unable to load certificate." });
  }
});
export default router;
