import { Router, type Request, type Response } from "express";
import webpush from "web-push";
import PushSubscription from "../models/PushSubscription";
import { getCurrentUser } from "../services/mongoAuth";

const router = Router();
const publicKey = process.env.VAPID_PUBLIC_KEY || "";
const privateKey = process.env.VAPID_PRIVATE_KEY || "";
const vapidSubject = process.env.VAPID_SUBJECT || "";
const ready = Boolean(publicKey && privateKey && vapidSubject);
if (ready) webpush.setVapidDetails(vapidSubject, publicKey, privateKey);
else console.warn("Web Push disabled: configure VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT.");

async function authenticated(req: Request, res: Response) {
  const user = await getCurrentUser(req);
  if (!user) res.status(401).json({ success: false, error: "Sign in to enable notifications." });
  return user as any;
}
const validEndpoint = (value: unknown) => typeof value === "string" && value.length < 2048 && /^https:\/\//.test(value);
function validSubscription(body: any) {
  return validEndpoint(body?.endpoint) &&
    typeof body?.keys?.p256dh === "string" && body.keys.p256dh.length < 512 &&
    typeof body?.keys?.auth === "string" && body.keys.auth.length < 512;
}
async function deliver(sub: any, payload: object) {
  try {
    await webpush.sendNotification({ endpoint: sub.endpoint, keys: sub.keys }, JSON.stringify(payload), { TTL: 86400 });
    return true;
  } catch (error: any) {
    if (error?.statusCode === 404 || error?.statusCode === 410) await PushSubscription.deleteOne({ _id: sub._id });
    else console.error("Push delivery failed:", error?.statusCode || error?.message);
    return false;
  }
}
router.get("/config", (_req, res) => res.json({ enabled: ready, publicKey: ready ? publicKey : null, missing: ready ? [] : [!publicKey && "VAPID_PUBLIC_KEY", !privateKey && "VAPID_PRIVATE_KEY", !vapidSubject && "VAPID_SUBJECT"].filter(Boolean) }));
router.get("/status", async (req, res) => {
  const user = await authenticated(req, res); if (!user) return;
  const count = await PushSubscription.countDocuments({ localUserId: user.localUserId });
  res.json({ success: true, devices: count });
});
router.post("/subscribe", async (req, res) => {
  const user = await authenticated(req, res); if (!user) return;
  if (!ready) return res.status(503).json({ success: false, error: "Push notifications are not configured." });
  if (!validSubscription(req.body?.subscription)) return res.status(400).json({ success: false, error: "Invalid push subscription." });
  const { endpoint, keys } = req.body.subscription;
  const dailyEnabled = req.body.dailyEnabled !== false;
  const announcementsEnabled = req.body.announcementsEnabled !== false;
  await PushSubscription.findOneAndUpdate({ endpoint }, { $set: { localUserId: user.localUserId, keys, dailyEnabled, announcementsEnabled } }, { upsert: true, new: true });
  res.json({ success: true });
});
router.post("/unsubscribe", async (req, res) => {
  const user = await authenticated(req, res); if (!user) return;
  if (!validEndpoint(req.body?.endpoint)) return res.status(400).json({ success: false, error: "Invalid endpoint." });
  await PushSubscription.deleteOne({ endpoint: req.body.endpoint, localUserId: user.localUserId });
  res.json({ success: true });
});
router.post("/test", async (req, res) => {
  const user = await authenticated(req, res); if (!user) return;
  if (!ready) return res.status(503).json({ success: false, error: "Push notifications are not configured." });
  const subs = await PushSubscription.find({ localUserId: user.localUserId }).lean();
  if (!subs.length) return res.status(404).json({ success: false, error: "No subscribed device found. Enable push notifications on this device first." });
  const results = await Promise.all(subs.map(s => deliver(s, {
    title: "SQLWhale demo notification 🐳",
    body: "It works! SQLWhale can send push notifications to this device.",
    url: "/account",
    tag: "sqlwhale-demo-test"
  })));
  const sent = results.filter(Boolean).length;
  return res.json({ success: sent > 0, sent, attempted: subs.length, error: sent ? undefined : "Delivery failed. Check backend logs and this device's notification permissions." });
});

router.post("/announcement", async (req, res) => {
  const user = await authenticated(req, res); if (!user) return;
  if (user.role !== "admin") return res.status(403).json({ success: false, error: "Admin only." });
  if (!ready) return res.status(503).json({ success: false, error: "Push not configured." });
  const title = typeof req.body?.title === "string" ? req.body.title.trim().slice(0, 100) : "";
  const body = typeof req.body?.body === "string" ? req.body.body.trim().slice(0, 250) : "";
  const url = typeof req.body?.url === "string" && /^\/(?!\/)/.test(req.body.url) ? req.body.url.slice(0, 250) : "/learn";
  if (!title || !body) return res.status(400).json({ success: false, error: "Title and message required." });
  const subs = await PushSubscription.find({ announcementsEnabled: true }).lean();
  let sent = 0;
  for (let i = 0; i < subs.length; i += 25) {
    const results = await Promise.all(subs.slice(i, i + 25).map(s => deliver(s, { title, body, url, tag: "sqlwhale-announcement" })));
    sent += results.filter(Boolean).length;
  }
  res.json({ success: true, sent, attempted: subs.length });
});
// Invoke once daily from a trusted scheduler (e.g. cron-job.org). Never expose the secret in the frontend.
router.post("/daily/send", async (req, res) => {
  const secret = process.env.PUSH_CRON_SECRET;
  if (!secret || req.headers.authorization !== `Bearer ${secret}`) return res.status(403).json({ success: false });
  if (!ready) return res.status(503).json({ success: false, error: "Push not configured." });
  const today = new Date().toISOString().slice(0, 10);
  const subs = await PushSubscription.find({ dailyEnabled: true, lastDailySentDate: { $ne: today } }).lean();
  let sent = 0;
  for (let i = 0; i < subs.length; i += 25) {
    const batch = subs.slice(i, i + 25);
    const results = await Promise.all(batch.map(s => deliver(s, {
      title: "Time for SQL practice 🐳", body: "Holy crap! Your SQL skills miss you. Try one challenge today!", url: "/run-query", tag: "sqlwhale-daily"
    })));
    await Promise.all(batch.filter((_, j) => results[j]).map(s => PushSubscription.updateOne({ _id: s._id }, { $set: { lastDailySentDate: today } })));
    sent += results.filter(Boolean).length;
  }
  res.json({ success: true, sent, attempted: subs.length, date: today });
});
export default router;
