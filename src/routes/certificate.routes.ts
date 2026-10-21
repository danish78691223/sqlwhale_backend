import { Router } from "express";
import crypto from "crypto";
import { getCurrentUser } from "../services/mongoAuth";
import { modules } from "./learning.routes";
import { MonthlySubscription, SubscriptionPayment } from "../models/SubscriptionPayment";
import LearningProgress from "../models/LearningProgress";
import Certificate from "../models/Certificate";
import User from "../models/User";

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
