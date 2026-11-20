import { Router, type Request, type Response } from "express";
import AnalyticsEvent from "../models/AnalyticsEvent";
import PushSubscription from "../models/PushSubscription";
import { getCurrentUser } from "../services/mongoAuth";

const router = Router();
const DAY = 86400000;
const validPath = (value: unknown) => typeof value === "string" && value.startsWith("/") && value.length <= 500 && !value.startsWith("//");

router.post("/track", async (req: Request, res: Response) => {
  try {
    const { visitorId, path, referrer, device, browser, os } = req.body || {};
    if (typeof visitorId !== "string" || !/^[a-zA-Z0-9_-]{12,100}$/.test(visitorId) || !validPath(path)) {
      return res.status(400).json({ success: false, error: "Invalid analytics event." });
    }
    const safeDevice = ["desktop", "mobile", "tablet"].includes(device) ? device : "unknown";
    await AnalyticsEvent.create({
      visitorId, path, referrer: typeof referrer === "string" ? referrer.slice(0, 500) : "",
      device: safeDevice,
      browser: typeof browser === "string" ? browser.slice(0, 80) : "Unknown",
      os: typeof os === "string" ? os.slice(0, 80) : "Unknown",
      userAgent: (req.headers["user-agent"] || "").slice(0, 300),
      visitedAt: new Date(),
    });
    res.status(202).json({ success: true });
  } catch (error) {
    console.error("Analytics tracking error:", error);
    res.status(500).json({ success: false, error: "Unable to record analytics." });
  }
});

router.get("/overview", async (req: Request, res: Response) => {
  try {
    const admin = await getCurrentUser(req);
    if (!admin) return res.status(401).json({ success: false, error: "Authentication required." });
    if (admin.role !== "admin") return res.status(403).json({ success: false, error: "Admin access required." });

    const requestedDays = Number(req.query.days || 7);
    const days = [7, 30, 90].includes(requestedDays) ? requestedDays : 7;
    const now = new Date();
    const start = new Date(now.getTime() - days * DAY);
    const liveSince = new Date(now.getTime() - 5 * 60 * 1000);

    const [summary, daily, pages, devices, browsers, live, push] = await Promise.all([
      AnalyticsEvent.aggregate([
        { $match: { visitedAt: { $gte: start } } },
        { $group: { _id: null, pageViews: { $sum: 1 }, visitors: { $addToSet: "$visitorId" }, sessions: { $addToSet: { visitorId: "$visitorId", day: { $dateToString: { date: "$visitedAt", format: "%Y-%m-%d" } } } } } },
        { $project: { _id: 0, pageViews: 1, uniqueVisitors: { $size: "$visitors" }, visitorDays: { $size: "$sessions" } } },
      ]),
      AnalyticsEvent.aggregate([
        { $match: { visitedAt: { $gte: start } } },
        { $group: { _id: { $dateToString: { date: "$visitedAt", format: "%Y-%m-%d", timezone: "Asia/Kolkata" } }, views: { $sum: 1 }, visitors: { $addToSet: "$visitorId" } } },
        { $project: { date: "$_id", views: 1, visitors: { $size: "$visitors" }, _id: 0 } },
        { $sort: { date: 1 } },
      ]),
      AnalyticsEvent.aggregate([{ $match: { visitedAt: { $gte: start } } }, { $group: { _id: "$path", views: { $sum: 1 }, visitors: { $addToSet: "$visitorId" } } }, { $project: { path: "$_id", views: 1, visitors: { $size: "$visitors" }, _id: 0 } }, { $sort: { views: -1 } }, { $limit: 10 }]),
      AnalyticsEvent.aggregate([{ $match: { visitedAt: { $gte: start } } }, { $group: { _id: "$device", count: { $sum: 1 } } }, { $project: { device: "$_id", count: 1, _id: 0 } }, { $sort: { count: -1 } }]),
      AnalyticsEvent.aggregate([{ $match: { visitedAt: { $gte: start } } }, { $group: { _id: "$browser", count: { $sum: 1 } } }, { $project: { browser: "$_id", count: 1, _id: 0 } }, { $sort: { count: -1 } }, { $limit: 8 }]),
      AnalyticsEvent.aggregate([{ $match: { visitedAt: { $gte: liveSince } } }, { $sort: { visitedAt: 1 } }, { $group: { _id: "$visitorId", path: { $last: "$path" }, lastSeen: { $max: "$visitedAt" } } }, { $sort: { lastSeen: -1 } }, { $limit: 50 }]),
      PushSubscription.aggregate([{ $group: { _id: null, total: { $sum: 1 }, dailyEnabled: { $sum: { $cond: ["$dailyEnabled", 1, 0] } }, announcementsEnabled: { $sum: { $cond: ["$announcementsEnabled", 1, 0] } } } }, { $project: { _id: 0, total: 1, dailyEnabled: 1, announcementsEnabled: 1 } }]),
    ]);

    res.json({ success: true, range: { days, from: start.toISOString(), to: now.toISOString(), timezone: "Asia/Kolkata" },
      summary: summary[0] || { pageViews: 0, uniqueVisitors: 0, visitorDays: 0 },
      daily, topPages: pages, devices, browsers,
      live: { activeVisitors: live.length, visitors: live.map((v: any) => ({ path: v.path, lastSeen: v.lastSeen })) },
      push: push[0] || { total: 0, dailyEnabled: 0, announcementsEnabled: 0 },
    });
  } catch (error) {
    console.error("Admin analytics error:", error);
    res.status(500).json({ success: false, error: "Unable to load website analytics." });
  }
});

export default router;
