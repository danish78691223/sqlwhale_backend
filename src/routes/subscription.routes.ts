import crypto from "crypto";
import { Router, type Request, type Response } from "express";
import { getCurrentUser } from "../services/mongoAuth";
import { BargainState, MonthlySubscription, SubscriptionPayment } from "../models/SubscriptionPayment";
import User from "../models/User";

const router = Router();
const MIN_PRICE = 600;
const ORIGINAL_PRICE = 1000;
const CURRENCY = "INR";
const SESSION_TTL_MS = 30 * 60 * 1000;
const FIXED_DURATION_PLANS = {
  "five-month": { amountRupees: 149, durationMonths: 5, label: "SQLWhale Premium · 5 months" },
  "ten-month": { amountRupees: 249, durationMonths: 10, label: "SQLWhale Premium · 10 months" },
} as const;
type FixedDurationPlanId = keyof typeof FIXED_DURATION_PLANS;

function addCalendarMonths(from: Date, months: number): Date {
  const result = new Date(from);
  const day = result.getDate();
  result.setDate(1);
  result.setMonth(result.getMonth() + months);
  const lastDay = new Date(result.getFullYear(), result.getMonth() + 1, 0).getDate();
  result.setDate(Math.min(day, lastDay));
  return result;
}

function razorpayCredentials() {
  const keyId = process.env.RAZORPAY_KEY_ID?.trim();
  const keySecret = process.env.RAZORPAY_KEY_SECRET?.trim();
  if (!keyId || !keySecret) return null;
  return { keyId, keySecret };
}

async function razorpayRequest<T>(
  path: string,
  options: { method?: "GET" | "POST"; body?: string } = {},
): Promise<T> {
  const credentials = razorpayCredentials();
  if (!credentials) throw new Error("Razorpay credentials are missing.");

  const response = await fetch("https://api.razorpay.com/v1" + path, {
    method: options.method || "GET",
    headers: {
      Authorization: "Basic " + Buffer.from(credentials.keyId + ":" + credentials.keySecret).toString("base64"),
      "Content-Type": "application/json",
    },
    body: options.body,
  });
  const payload: any = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(payload?.error?.description || "Razorpay API request failed with status " + response.status);
  }
  return payload as T;
}

async function requireUser(req: Request, res: Response) {
  const user = await getCurrentUser(req);
  if (!user) {
    res.status(401).json({ success: false, authenticated: false, error: "Please log in before subscribing." });
    return null;
  }
  return user as any;
}

function publicBargain(state: any) {
  return {
    sessionId: String(state._id),
    originalPrice: ORIGINAL_PRICE,
    attempts: state.attempts,
    remainingAttempts: Math.max(0, 3 - state.attempts),
    locked: state.locked,
    acceptedPrice: state.acceptedPrice ?? null,
  };
}

router.get("/config", (_req, res) => {
  res.json({
    success: true,
    originalPrice: ORIGINAL_PRICE,
    keyId: process.env.RAZORPAY_KEY_ID?.trim() || null,
    ready: Boolean(razorpayCredentials()),
    currency: CURRENCY,
  });
});

router.get("/status", async (req, res) => {
  try {
    const user = await requireUser(req, res);
    if (!user) return;

    const payment = await SubscriptionPayment.findOne({
      localUserId: user.localUserId,
      status: "paid",
      $or: [{ accessUntil: null }, { accessUntil: { $gt: new Date() } }],
    }).sort({ verifiedAt: -1 }).lean().exec() as any;
    const monthly: any = await MonthlySubscription.findOne({ localUserId: user.localUserId })
      .sort({ createdAt: -1 }).exec();

    // Reconcile with Razorpay on each status check so a delayed/missed webhook
    // cannot leave the profile showing Starter after Razorpay has activated the plan.
    if (monthly && razorpayCredentials()) {
      try {
        const remote: any = await razorpayRequest("/subscriptions/" + encodeURIComponent(monthly.subscriptionId));
        if (remote?.id === monthly.subscriptionId && remote?.plan_id === monthly.planId && typeof remote.status === "string") {
          monthly.status = remote.status;
          if (typeof remote.current_end === "number") monthly.currentPeriodEnd = new Date(remote.current_end * 1000);
          if (typeof remote.current_start === "number" && !monthly.activatedAt && remote.status === "active") {
            monthly.activatedAt = new Date(remote.current_start * 1000);
          }
          await monthly.save();
        }
      } catch (syncError: any) {
        // Keep the last known status available if Razorpay is temporarily unreachable.
        console.warn("Unable to refresh Razorpay subscription status:", syncError?.message || syncError);
      }
    }

    const recurringActive = Boolean(monthly && monthly.status === "active");
    const monthlyAccessUntilEnd = Boolean(
      monthly?.cancelAtCycleEnd &&
      monthly.currentPeriodEnd &&
      new Date(monthly.currentPeriodEnd).getTime() > Date.now() &&
      ["active", "authenticated"].includes(String(monthly.status)),
    );
    const timedPaymentActive = Boolean(payment?.accessUntil && new Date(payment.accessUntil).getTime() > Date.now());
    const legacyPaid = Boolean(payment && !payment.accessUntil);
    const paymentDerivedPremium = recurringActive || monthlyAccessUntilEnd || timedPaymentActive || legacyPaid ||
      (!monthly && !payment && user.currentPlan === "SQLWhale Premium");
    // A deliberate admin override takes precedence until a later successful
    // payment verification clears it. This prevents status refresh from undoing support fixes.
    const currentPlan = user.adminPlanOverride || (paymentDerivedPremium ? "SQLWhale Premium" : "Starter");
    const subscribed = currentPlan === "SQLWhale Premium";

    if (user.currentPlan !== currentPlan) {
      await User.updateOne(
        { localUserId: user.localUserId },
        { $set: { currentPlan } },
      ).exec();
    }

    res.json({
      success: true,
      subscribed,
      currentPlan,
      plan: recurringActive || monthlyAccessUntilEnd
        ? "SQLWhale Premium · ₹49/month"
        : (subscribed ? (payment?.plan || currentPlan) : null),
      paidAt: payment?.verifiedAt ?? monthly?.lastPaymentAt ?? null,
      recurring: recurringActive || monthlyAccessUntilEnd,
      subscriptionId: monthly && (recurringActive || monthlyAccessUntilEnd) ? monthly.subscriptionId : null,
      subscriptionStatus: monthly?.status ?? null,
      cancelAtCycleEnd: Boolean(monthly?.cancelAtCycleEnd),
      currentPeriodEnd: timedPaymentActive ? payment?.accessUntil : monthly?.currentPeriodEnd ?? null,
      durationMonths: timedPaymentActive ? payment?.durationMonths ?? null : null,
      activationPending: Boolean(monthly && !subscribed && ["created", "authenticated", "pending"].includes(String(monthly.status))),
    });
  } catch (error) {
    console.error("Subscription status error:", error);
    res.status(500).json({ success: false, error: "Unable to load subscription status." });
  }
});

router.post("/bargain/start", async (req, res) => {
  try {
    const user = await requireUser(req, res);
    if (!user) return;
    if (user.currentPlan === "SQLWhale Premium") {
      return res.status(409).json({ success: false, error: "SQLWhale Premium is already active on this account." });
    }
    const state = await BargainState.create({
      localUserId: user.localUserId,
      attempts: 0,
      acceptedPrice: null,
      locked: false,
      expiresAt: new Date(Date.now() + SESSION_TTL_MS),
    });
    res.status(201).json({ success: true, bargain: publicBargain(state) });
  } catch (error) {
    console.error("Bargain start error:", error);
    res.status(500).json({ success: false, error: "Unable to start bargaining. Please retry." });
  }
});

router.post("/bargain/offer", async (req, res) => {
  try {
    const user = await requireUser(req, res);
    if (!user) return;
    const offer = Number(req.body?.offer);
    const sessionId = typeof req.body?.sessionId === "string" ? req.body.sessionId : "";
    if (!Number.isSafeInteger(offer) || offer < 1 || offer > ORIGINAL_PRICE) {
      return res.status(400).json({ success: false, error: "Enter a whole-number offer between ₹1 and ₹1,000." });
    }
    if (!sessionId) return res.status(400).json({ success: false, error: "Start a new bargain session first." });

    const state: any = await BargainState.findOne({
      _id: sessionId,
      localUserId: user.localUserId,
      expiresAt: { $gt: new Date() },
    }).exec();
    if (!state) return res.status(404).json({ success: false, error: "Bargain session expired. Start again." });
    if (state.locked || state.attempts >= 3) {
      return res.status(409).json({ success: false, error: "Final price is already locked.", bargain: publicBargain(state) });
    }

    state.attempts += 1;
    let message = "";
    let dealPrice: number | null = null;
    let counterOffer: number | null = null;

    if (offer >= MIN_PRICE) {
      dealPrice = offer;
      state.acceptedPrice = offer;
      state.locked = true;
      message = "Deal Done! 🎉 Aapka bargaining skill gazab hai! Pay ₹" + offer + " and unlock SQLWhale Premium.";
    } else if (state.attempts === 1) {
      counterOffer = 900;
      message = "Error 404: Itna kam amount accept nahi ho sakta! 😅 Whale ka first counter-offer ₹900 hai.";
    } else if (state.attempts === 2) {
      counterOffer = 750;
      message = "SELECT * FROM offers WHERE patience = 'high'; 🤔 Ab ₹750 mein deal kar lo, boss!";
    } else {
      counterOffer = MIN_PRICE;
      state.acceptedPrice = MIN_PRICE;
      state.locked = true;
      message = "Bas! 🛑 Whale ki final keemat ₹600 hai. Isse ek rupya bhi kam nahi ho sakta!";
    }

    await state.save();
    res.json({
      success: true,
      message,
      counterOffer,
      dealPrice,
      final: state.locked,
      bargain: publicBargain(state),
    });
  } catch (error) {
    console.error("Bargain offer error:", error);
    res.status(500).json({ success: false, error: "Unable to process your offer." });
  }
});

router.post("/bargain/accept", async (req, res) => {
  try {
    const user = await requireUser(req, res);
    if (!user) return;
    const sessionId = typeof req.body?.sessionId === "string" ? req.body.sessionId : "";
    const price = Number(req.body?.price);
    if (!sessionId || !Number.isSafeInteger(price)) {
      return res.status(400).json({ success: false, error: "A valid bargain session and counter-offer price are required." });
    }
    const state: any = await BargainState.findOne({
      _id: sessionId,
      localUserId: user.localUserId,
      expiresAt: { $gt: new Date() },
    }).exec();
    if (!state) return res.status(404).json({ success: false, error: "Bargain session expired. Start again." });
    const allowedPrice = state.attempts === 1 ? 900 : state.attempts === 2 ? 750 : null;
    if (state.locked || allowedPrice !== price || state.attempts < 1 || state.attempts > 2) {
      return res.status(409).json({ success: false, error: "That counter-offer is no longer available." });
    }
    state.acceptedPrice = price;
    state.locked = true;
    await state.save();
    res.json({
      success: true,
      message: "Deal accepted! 🎉 Checkout at ₹" + price + " to unlock SQLWhale Premium.",
      dealPrice: price,
      final: true,
      bargain: publicBargain(state),
    });
  } catch (error) {
    console.error("Counter-offer accept error:", error);
    res.status(500).json({ success: false, error: "Unable to accept the counter-offer." });
  }
});

router.post("/fixed-order", async (req, res) => {
  try {
    const user = await requireUser(req, res);
    if (!user) return;

    if (req.body?.termsAccepted !== true || req.body?.refundPolicyAccepted !== true || req.body?.recurringConsent !== true) {
      return res.status(400).json({
        success: false,
        error: "Accept the Terms & Conditions, Refund/Cancellation Policy, and monthly billing authorization before proceeding.",
      });
    }
    if (user.currentPlan === "SQLWhale Premium") {
      return res.status(409).json({ success: false, error: "SQLWhale Premium is already active on this account." });
    }

    const credentials = razorpayCredentials();
    if (!credentials) {
      return res.status(503).json({
        success: false,
        error: "Payments are not configured yet. Add RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET to Render.",
      });
    }
    const planId = process.env.RAZORPAY_PLAN_ID?.trim();
    if (!planId) {
      return res.status(503).json({
        success: false,
        error: "The ₹49 monthly plan is not configured. Add RAZORPAY_PLAN_ID to Render after creating the monthly plan in Razorpay Dashboard.",
      });
    }

    let plan: any;
    try {
      plan = await razorpayRequest("/plans/" + encodeURIComponent(planId));
    } catch (error: any) {
      const message = String(error?.message || "");
      const mode = credentials.keyId.startsWith("rzp_test_") ? "Test Mode" : "Live Mode";
      if (message.toLowerCase().includes("authentication failed") || message.includes("status 401")) {
        console.error("Razorpay rejected the API credentials during plan lookup. Check the RAZORPAY_KEY_ID/RAZORPAY_KEY_SECRET pair and mode:", mode);
        return res.status(502).json({
          success: false,
          error: "Razorpay rejected the API credentials. In Render, set RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET from the same " + mode + " API key pair. Do not mix Test and Live keys. If the secret was lost, generate a fresh key pair and update both values, then redeploy.",
        });
      }
      if (message.includes("status 404")) {
        console.warn("Razorpay plan lookup returned 404. Check RAZORPAY_PLAN_ID and key mode:", mode);
        return res.status(400).json({
          success: false,
          error: "Razorpay could not find RAZORPAY_PLAN_ID. Create the ₹49/month plan in " + mode + " and use that exact plan_... ID with the matching API key pair. Test and Live plan IDs cannot be interchanged.",
        });
      }
      throw error;
    }
    const planAmount = Number(plan?.item?.amount);
    const planCurrency = String(plan?.item?.currency || "").toUpperCase();
    if (
      plan?.id !== planId ||
      plan?.period !== "monthly" ||
      Number(plan?.interval) !== 1 ||
      planAmount !== 4900 ||
      planCurrency !== "INR"
    ) {
      return res.status(503).json({
        success: false,
        error: "RAZORPAY_PLAN_ID must point to an active INR ₹49 monthly plan (amount 4900 paise, period monthly, interval 1).",
      });
    }

    const existing: any = await MonthlySubscription.findOne({
      localUserId: user.localUserId,
      status: { $in: ["created", "authenticated", "active", "pending"] },
    }).sort({ createdAt: -1 }).exec();
    if (existing) {
      if (existing.status === "created" && existing.planId === planId) {
        return res.status(200).json({
          success: true,
          subscriptionId: existing.subscriptionId,
          keyId: credentials.keyId,
          plan: "SQLWhale Premium · ₹49/month",
          reused: true,
        });
      }
      return res.status(409).json({
        success: false,
        error: "A monthly subscription is already active or being processed for this account.",
      });
    }

    const remote = await razorpayRequest<{
      id: string;
      plan_id: string;
      status: string;
      current_end?: number | null;
    }>("/subscriptions", {
      method: "POST",
      body: JSON.stringify({
        plan_id: planId,
        total_count: 120,
        quantity: 1,
        customer_notify: true,
        notes: {
          localUserId: user.localUserId,
          plan: "SQLWhale Premium",
          purchaseType: "monthly_49",
        },
      }),
    });

    const consentAt = new Date();
    const subscription = await MonthlySubscription.create({
      localUserId: user.localUserId,
      subscriptionId: remote.id,
      planId,
      status: remote.status || "created",
      cancelAtCycleEnd: false,
      currentPeriodEnd: typeof remote.current_end === "number" ? new Date(remote.current_end * 1000) : null,
      termsAcceptedAt: consentAt,
      refundPolicyAcceptedAt: consentAt,
      recurringConsentAt: consentAt,
    });

    res.status(201).json({
      success: true,
      subscriptionId: subscription.subscriptionId,
      keyId: credentials.keyId,
      plan: "SQLWhale Premium · ₹49/month",
    });
  } catch (error: any) {
    console.error("SQLWhale ₹49 monthly subscription error:", error?.message || error);
    res.status(500).json({ success: false, error: "Unable to create a Razorpay subscription. Please try again." });
  }
});

router.post("/verify-subscription", async (req, res) => {
  try {
    const user = await requireUser(req, res);
    if (!user) return;

    const subscriptionId = typeof req.body?.razorpay_subscription_id === "string" ? req.body.razorpay_subscription_id : "";
    const paymentId = typeof req.body?.razorpay_payment_id === "string" ? req.body.razorpay_payment_id : "";
    const signature = typeof req.body?.razorpay_signature === "string" ? req.body.razorpay_signature : "";
    if (!subscriptionId || !paymentId || !signature) {
      return res.status(400).json({ success: false, error: "Missing Razorpay subscription verification details." });
    }

    const saved: any = await MonthlySubscription.findOne({
      subscriptionId,
      localUserId: user.localUserId,
    }).exec();
    if (!saved) return res.status(404).json({ success: false, error: "Subscription not found for this account." });
    if (saved.status === "active" && saved.paymentId === paymentId) {
      return res.json({ success: true, verified: true, subscribed: true, recurring: true, message: "Your monthly subscription is active." });
    }

    const credentials = razorpayCredentials();
    if (!credentials) return res.status(503).json({ success: false, error: "Subscription verification is not configured." });

    // Razorpay subscription signature format: payment_id + "|" + subscription_id.
    const expected = crypto.createHmac("sha256", credentials.keySecret)
      .update(paymentId + "|" + subscriptionId)
      .digest("hex");
    const actualBuffer = Buffer.from(signature, "hex");
    const expectedBuffer = Buffer.from(expected, "hex");
    if (actualBuffer.length !== expectedBuffer.length || !crypto.timingSafeEqual(actualBuffer, expectedBuffer)) {
      return res.status(400).json({ success: false, verified: false, error: "Subscription signature verification failed." });
    }

    const payment = await razorpayRequest<{
      id: string;
      subscription_id?: string | null;
      status: string;
      amount: number;
      currency: string;
      created_at?: number;
    }>("/payments/" + encodeURIComponent(paymentId));
    // The checkout signature binds this payment ID to this subscription. Razorpay's
    // subscription state is authoritative for recurring access; its first UPI AutoPay
    // payment can be authorized before it is shown as captured in the Payments API.
    if (payment.subscription_id && payment.subscription_id !== subscriptionId) {
      return res.status(400).json({ success: false, verified: false, error: "This payment is linked to a different Razorpay subscription." });
    }

    const remote = await razorpayRequest<{
      id: string;
      plan_id: string;
      status: string;
      current_start?: number | null;
      current_end?: number | null;
    }>("/subscriptions/" + encodeURIComponent(subscriptionId));

    if (remote.plan_id !== saved.planId) {
      return res.status(400).json({ success: false, verified: false, error: "Razorpay subscription plan does not match the expected ₹49/month plan." });
    }

    if (remote.status !== "active") {
      // Keep proof of the signed payment while Razorpay activates the mandate.
      // Do not grant Premium until the server confirms the subscription is active.
      saved.paymentId = paymentId;
      saved.lastPaymentAt = payment.created_at ? new Date(payment.created_at * 1000) : new Date();
      saved.status = remote.status || saved.status;
      if (typeof remote.current_end === "number") saved.currentPeriodEnd = new Date(remote.current_end * 1000);
      await saved.save();
      return res.json({
        success: true,
        verified: true,
        subscribed: false,
        pendingActivation: true,
        subscriptionStatus: saved.status,
        message: "Payment was verified. Premium will activate once Razorpay confirms the subscription is active. You do not need to pay again.",
      });
    }

    saved.paymentId = paymentId;
    saved.status = remote.status;
    saved.activatedAt = saved.activatedAt || new Date();
    saved.lastPaymentAt = payment.created_at ? new Date(payment.created_at * 1000) : new Date();
    if (typeof remote.current_end === "number") saved.currentPeriodEnd = new Date(remote.current_end * 1000);
    await saved.save();
    await User.updateOne(
      { localUserId: user.localUserId },
      { $set: { currentPlan: "SQLWhale Premium" }, $unset: { adminPlanOverride: 1 } },
    ).exec();

    res.json({
      success: true,
      verified: true,
      subscribed: true,
      recurring: true,
      plan: "SQLWhale Premium · ₹49/month",
      message: "Payment verified and the ₹49/month subscription is active.",
    });
  } catch (error: any) {
    console.error("Monthly subscription verification error:", error?.message || error);
    res.status(500).json({ success: false, error: "Unable to verify subscription. Contact support if a payment was deducted." });
  }
});

router.post("/monthly/cancel", async (req, res) => {
  try {
    const user = await requireUser(req, res);
    if (!user) return;

    const subscriptionId = typeof req.body?.subscriptionId === "string" ? req.body.subscriptionId : "";
    if (!subscriptionId) return res.status(400).json({ success: false, error: "Subscription ID is required." });

    const saved: any = await MonthlySubscription.findOne({ subscriptionId, localUserId: user.localUserId }).exec();
    if (!saved) return res.status(404).json({ success: false, error: "Subscription not found for this account." });
    if (saved.cancelAtCycleEnd || ["cancelled", "completed"].includes(saved.status)) {
      return res.json({ success: true, message: "Future renewal cancellation has already been requested." });
    }

    const remote = await razorpayRequest<{
      id: string;
      status: string;
      current_end?: number | null;
    }>("/subscriptions/" + encodeURIComponent(subscriptionId) + "/cancel", {
      method: "POST",
      body: JSON.stringify({ cancel_at_cycle_end: true }),
    });

    saved.cancelAtCycleEnd = true;
    if (remote.status) saved.status = remote.status;
    if (typeof remote.current_end === "number") saved.currentPeriodEnd = new Date(remote.current_end * 1000);
    await saved.save();

    res.json({
      success: true,
      cancelAtCycleEnd: true,
      currentPeriodEnd: saved.currentPeriodEnd,
      message: "Future renewals are scheduled to stop at the end of the current billing period. Premium access remains available until then.",
    });
  } catch (error: any) {
    console.error("Monthly subscription cancellation error:", error?.message || error);
    res.status(500).json({ success: false, error: "Unable to request cancellation. Please try again or contact support." });
  }
});

router.post("/webhook", async (req, res) => {
  const secret = process.env.RAZORPAY_WEBHOOK_SECRET?.trim();
  const signatureHeader = req.headers["x-razorpay-signature"];
  const signature = typeof signatureHeader === "string" ? signatureHeader : "";
  const rawBody = (req as Request & { rawBody?: Buffer }).rawBody;

  if (!secret) return res.status(503).json({ success: false, error: "Razorpay webhook secret is not configured." });
  if (!rawBody || !signature) return res.status(400).json({ success: false, error: "Missing webhook signature or raw request body." });

  const expected = crypto.createHmac("sha256", secret).update(rawBody).digest("hex");
  const actualBuffer = Buffer.from(signature, "hex");
  const expectedBuffer = Buffer.from(expected, "hex");
  if (actualBuffer.length !== expectedBuffer.length || !crypto.timingSafeEqual(actualBuffer, expectedBuffer)) {
    return res.status(400).json({ success: false, error: "Invalid webhook signature." });
  }

  try {
    const event = typeof req.body?.event === "string" ? req.body.event : "";
    const subscriptionEntity = req.body?.payload?.subscription?.entity;
    const subscriptionId = typeof subscriptionEntity?.id === "string" ? subscriptionEntity.id : "";
    if (!subscriptionId) return res.json({ success: true, received: true });

    const saved: any = await MonthlySubscription.findOne({ subscriptionId }).exec();
    if (!saved) return res.json({ success: true, received: true });

    const statusByEvent: Record<string, string> = {
      "subscription.authenticated": "authenticated",
      "subscription.activated": "active",
      "subscription.charged": "active",
      "subscription.pending": "pending",
      "subscription.halted": "halted",
      "subscription.cancelled": "cancelled",
      "subscription.completed": "completed",
    };
    const nextStatus = statusByEvent[event];
    if (!nextStatus) return res.json({ success: true, received: true });

    saved.status = nextStatus;
    if (typeof subscriptionEntity.current_end === "number") saved.currentPeriodEnd = new Date(subscriptionEntity.current_end * 1000);
    const paymentEntity = req.body?.payload?.payment?.entity;
    if (event === "subscription.charged" && paymentEntity?.id) {
      saved.paymentId = paymentEntity.id;
      saved.lastPaymentAt = typeof paymentEntity.created_at === "number" ? new Date(paymentEntity.created_at * 1000) : new Date();
    }
    if (event === "subscription.cancelled") saved.cancelAtCycleEnd = false;
    await saved.save();

    const legacyPaid = await SubscriptionPayment.findOne({
      localUserId: saved.localUserId,
      status: "paid",
      $or: [{ accessUntil: null }, { accessUntil: { $gt: new Date() } }],
    }).select("_id").lean().exec();
    const accessActive = nextStatus === "active";
    await User.updateOne(
      { localUserId: saved.localUserId },
      { $set: { currentPlan: accessActive || legacyPaid ? "SQLWhale Premium" : "Starter" } },
    ).exec();

    res.json({ success: true, received: true });
  } catch (error) {
    console.error("Razorpay subscription webhook failed:", error);
    res.status(500).json({ success: false, error: "Unable to process subscription webhook." });
  }
});

router.post("/plan-order", async (req, res) => {
  try {
    const user = await requireUser(req, res);
    if (!user) return;
    if (req.body?.termsAccepted !== true || req.body?.refundPolicyAccepted !== true) {
      return res.status(400).json({ success: false, error: "Accept the Terms & Conditions and Refund/Cancellation Policy before proceeding." });
    }
    const requestedPlanId = typeof req.body?.planId === "string" ? req.body.planId : "";
    if (!Object.prototype.hasOwnProperty.call(FIXED_DURATION_PLANS, requestedPlanId)) {
      return res.status(400).json({ success: false, error: "Choose a valid fixed-duration Premium plan." });
    }
    const selected = FIXED_DURATION_PLANS[requestedPlanId as FixedDurationPlanId];
    const monthly: any = await MonthlySubscription.findOne({ localUserId: user.localUserId }).sort({ createdAt: -1 }).exec();
    const hasActiveMonthly = Boolean(monthly && ["active", "authenticated"].includes(String(monthly.status)) && !monthly.cancelAtCycleEnd);
    if (user.currentPlan === "SQLWhale Premium" && !hasActiveMonthly) {
      return res.status(409).json({ success: false, error: "Premium is already active. You can switch plans after checking your current plan status." });
    }
    const credentials = razorpayCredentials();
    if (!credentials) return res.status(503).json({ success: false, error: "Payment settings are not configured on Render." });

    const amountPaise = selected.amountRupees * 100;
    const order = await razorpayRequest<{ id: string; amount: number; currency: string }>("/orders", {
      method: "POST",
      body: JSON.stringify({
        amount: amountPaise,
        currency: CURRENCY,
        receipt: "sw_" + Date.now() + "_" + crypto.randomBytes(4).toString("hex"),
        notes: {
          localUserId: user.localUserId,
          plan: selected.label,
          planId: requestedPlanId,
          durationMonths: String(selected.durationMonths),
          purchaseType: "fixed_duration",
        },
      }),
    });
    const consentAt = new Date();
    await SubscriptionPayment.create({
      localUserId: user.localUserId,
      orderId: order.id,
      amountPaise,
      currency: CURRENCY,
      status: "created",
      plan: selected.label,
      purchaseType: "fixed_duration",
      durationMonths: selected.durationMonths,
      termsAcceptedAt: consentAt,
      refundPolicyAcceptedAt: consentAt,
    });
    res.status(201).json({
      success: true,
      order: { id: order.id, amount: order.amount, currency: order.currency },
      keyId: credentials.keyId,
      plan: selected.label,
    });
  } catch (error: any) {
    console.error("Fixed-duration plan order error:", error?.message || error);
    res.status(500).json({ success: false, error: "Unable to create a fixed-duration Razorpay order. Please try again." });
  }
});

router.post("/order", async (req, res) => {
  try {
    const user = await requireUser(req, res);
    if (!user) return;
    if (req.body?.termsAccepted !== true || req.body?.refundPolicyAccepted !== true) {
      return res.status(400).json({ success: false, error: "Accept the Terms & Conditions and Refund/Cancellation Policy before proceeding." });
    }
    if (user.currentPlan === "SQLWhale Premium") {
      return res.status(409).json({ success: false, error: "SQLWhale Premium is already active on this account." });
    }
    const direct = req.body?.direct === true;
    const sessionId = typeof req.body?.sessionId === "string" ? req.body.sessionId : "";
    let amountRupees = ORIGINAL_PRICE;
    if (!direct) {
      const state: any = await BargainState.findOne({
        _id: sessionId,
        localUserId: user.localUserId,
        expiresAt: { $gt: new Date() },
      }).exec();
      if (!state || !state.locked || !Number.isSafeInteger(state.acceptedPrice) || state.acceptedPrice < MIN_PRICE) {
        return res.status(400).json({ success: false, error: "Complete bargaining first. A valid deal is required before checkout." });
      }
      amountRupees = state.acceptedPrice;
    }
    if (!razorpayCredentials()) {
      return res.status(503).json({ success: false, error: "Payments are not configured yet. Add RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET to Render." });
    }

    const amountPaise = amountRupees * 100;
    const order = await razorpayRequest<{ id: string; amount: number; currency: string }>("/orders", {
      method: "POST",
      body: JSON.stringify({
        amount: amountPaise,
        currency: CURRENCY,
        receipt: "sw_" + Date.now() + "_" + crypto.randomBytes(4).toString("hex"),
        notes: { localUserId: user.localUserId, plan: "SQLWhale Premium", ...(sessionId ? { bargainSessionId: sessionId } : {}), purchaseType: direct ? "direct" : "bargain" },
      }),
    });
    const consentAt = new Date();
    await SubscriptionPayment.create({
      localUserId: user.localUserId,
      orderId: order.id,
      amountPaise,
      currency: CURRENCY,
      status: "created",
      plan: "SQLWhale Premium",
      purchaseType: direct ? "direct" : "bargain",
      termsAcceptedAt: consentAt,
      refundPolicyAcceptedAt: consentAt,
    });
    res.status(201).json({
      success: true,
      order: { id: order.id, amount: order.amount, currency: order.currency },
      keyId: process.env.RAZORPAY_KEY_ID?.trim(),
      plan: "SQLWhale Premium",
    });
  } catch (error: any) {
    console.error("Subscription order error:", error?.message || error);
    res.status(500).json({ success: false, error: "Unable to create a Razorpay order. Please try again." });
  }
});

router.post("/verify", async (req, res) => {
  try {
    const user = await requireUser(req, res);
    if (!user) return;
    const orderId = typeof req.body?.razorpay_order_id === "string" ? req.body.razorpay_order_id : "";
    const paymentId = typeof req.body?.razorpay_payment_id === "string" ? req.body.razorpay_payment_id : "";
    const signature = typeof req.body?.razorpay_signature === "string" ? req.body.razorpay_signature : "";
    if (!orderId || !paymentId || !signature) {
      return res.status(400).json({ success: false, error: "Missing Razorpay payment verification details." });
    }

    const savedPayment: any = await SubscriptionPayment.findOne({ orderId, localUserId: user.localUserId }).exec();
    if (!savedPayment) return res.status(404).json({ success: false, error: "Payment order not found for this account." });
    if (savedPayment.status === "paid") {
      if (savedPayment.paymentId === paymentId) {
        if (savedPayment.accessUntil && new Date(savedPayment.accessUntil).getTime() <= Date.now()) {
          return res.json({ success: true, verified: true, subscribed: false, expired: true, message: "This fixed-duration Premium plan has expired." });
        }
        const entitlementUpdate: any = { $set: { currentPlan: "SQLWhale Premium" }, $unset: { adminPlanOverride: 1 } };
        if (savedPayment.accessUntil) entitlementUpdate.$set.premiumAccessUntil = savedPayment.accessUntil;
        else entitlementUpdate.$unset.premiumAccessUntil = 1;
        await User.updateOne({ localUserId: user.localUserId }, entitlementUpdate).exec();
        return res.json({ success: true, verified: true, subscribed: true, currentPeriodEnd: savedPayment.accessUntil ?? null, message: "Payment is already verified." });
      }
      return res.status(409).json({ success: false, error: "This order has already been paid." });
    }

    const credentials = razorpayCredentials();
    if (!credentials) return res.status(503).json({ success: false, error: "Payment verification is not configured." });
    const expected = crypto.createHmac("sha256", credentials.keySecret).update(orderId + "|" + paymentId).digest("hex");
    const actualBuffer = Buffer.from(signature, "hex");
    const expectedBuffer = Buffer.from(expected, "hex");
    if (actualBuffer.length !== expectedBuffer.length || !crypto.timingSafeEqual(actualBuffer, expectedBuffer)) {
      return res.status(400).json({ success: false, verified: false, error: "Payment signature verification failed." });
    }

    const payment = await razorpayRequest<{ order_id: string; status: string; amount: number; currency: string }>(
      "/payments/" + encodeURIComponent(paymentId),
    );
    if (payment.order_id !== orderId || payment.status !== "captured" || Number(payment.amount) !== savedPayment.amountPaise || payment.currency !== CURRENCY) {
      return res.status(400).json({ success: false, verified: false, error: "Payment is not captured or does not match this order." });
    }

    savedPayment.paymentId = paymentId;
    savedPayment.status = "paid";
    savedPayment.verifiedAt = new Date();

    if (savedPayment.purchaseType === "fixed_duration") {
      const months = Number(savedPayment.durationMonths);
      const expectedAmountPaise = months === 5 ? 14900 : months === 10 ? 24900 : null;
      if (!expectedAmountPaise || Number(savedPayment.amountPaise) !== expectedAmountPaise) {
        return res.status(400).json({ success: false, verified: false, error: "The saved fixed-duration plan details do not match the amount." });
      }
      const activeTimedPayment: any = await SubscriptionPayment.findOne({
        localUserId: user.localUserId,
        status: "paid",
        accessUntil: { $gt: new Date() },
      }).sort({ accessUntil: -1 }).lean().exec();
      const startsAt = activeTimedPayment?.accessUntil ? new Date(activeTimedPayment.accessUntil) : new Date();
      savedPayment.accessUntil = addCalendarMonths(startsAt, months);
    }
    await savedPayment.save();

    let recurringCancellationPending = false;
    if (savedPayment.purchaseType === "fixed_duration") {
      const previousMonthly: any = await MonthlySubscription.findOne({
        localUserId: user.localUserId,
        cancelAtCycleEnd: false,
        status: { $in: ["active", "authenticated"] },
      }).sort({ createdAt: -1 }).exec();
      if (previousMonthly) {
        try {
          const remote: any = await razorpayRequest(
            "/subscriptions/" + encodeURIComponent(previousMonthly.subscriptionId) + "/cancel",
            { method: "POST", body: JSON.stringify({ cancel_at_cycle_end: false }) },
          );
          previousMonthly.status = remote?.status || "cancelled";
          previousMonthly.cancelAtCycleEnd = false;
          if (typeof remote?.current_end === "number") previousMonthly.currentPeriodEnd = new Date(remote.current_end * 1000);
          await previousMonthly.save();
        } catch (cancelError: any) {
          recurringCancellationPending = true;
          console.error("Paid plan switch: unable to cancel old monthly subscription:", cancelError?.message || cancelError);
        }
      }
      await User.updateOne(
        { localUserId: user.localUserId },
        { $set: { currentPlan: "SQLWhale Premium", premiumAccessUntil: savedPayment.accessUntil }, $unset: { adminPlanOverride: 1 } },
      ).exec();
    } else {
      await User.updateOne(
        { localUserId: user.localUserId },
        { $set: { currentPlan: "SQLWhale Premium" }, $unset: { adminPlanOverride: 1, premiumAccessUntil: 1 } },
      ).exec();
    }

    res.json({
      success: true, verified: true, subscribed: true, plan: savedPayment.plan || "SQLWhale Premium",
      currentPeriodEnd: savedPayment.accessUntil ?? null,
      recurringCancellationPending,
      message: recurringCancellationPending
        ? "Payment verified and Premium is active, but the previous monthly renewal could not be cancelled automatically. Please cancel it from your profile or contact support to avoid another renewal."
        : "Payment verified! SQLWhale Premium is active.",
    });
  } catch (error: any) {
    console.error("Payment verification error:", error?.message || error);
    res.status(500).json({ success: false, error: "Unable to verify payment. Contact support if money was deducted." });
  }
});

export default router;
