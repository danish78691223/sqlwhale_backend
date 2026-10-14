import crypto from "crypto";
import { Router, type Request, type Response } from "express";
import { getCurrentUser } from "../services/mongoAuth";
import { BargainState, SubscriptionPayment } from "../models/SubscriptionPayment";
import User from "../models/User";

const router = Router();
const MIN_PRICE = 600;
const ORIGINAL_PRICE = 1000;
const CURRENCY = "INR";
const SESSION_TTL_MS = 30 * 60 * 1000;

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
    const payment = await SubscriptionPayment.findOne({ localUserId: user.localUserId, status: "paid" })
      .sort({ verifiedAt: -1 }).lean().exec() as any;
    const subscribed = Boolean(payment) || user.currentPlan === "SQLWhale Premium";
    res.json({
      success: true,
      subscribed,
      plan: subscribed ? (payment?.plan || user.currentPlan) : null,
      paidAt: payment?.verifiedAt ?? null,
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

    if (req.body?.termsAccepted !== true || req.body?.refundPolicyAccepted !== true) {
      return res.status(400).json({
        success: false,
        error: "Accept the Terms & Conditions and Refund/Cancellation Policy before proceeding.",
      });
    }
    if (user.currentPlan === "SQLWhale Premium") {
      return res.status(409).json({ success: false, error: "SQLWhale Premium is already active on this account." });
    }
    if (!razorpayCredentials()) {
      return res.status(503).json({
        success: false,
        error: "Payments are not configured yet. Add RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET to Render.",
      });
    }

    const amountPaise = 4900; // ₹49 one-time payment
    const order = await razorpayRequest<{ id: string; amount: number; currency: string }>("/orders", {
      method: "POST",
      body: JSON.stringify({
        amount: amountPaise,
        currency: CURRENCY,
        receipt: "sw49_" + Date.now() + "_" + crypto.randomBytes(4).toString("hex"),
        notes: { localUserId: user.localUserId, plan: "SQLWhale Premium", purchaseType: "fixed_49", billingType: "one_time" },
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
      purchaseType: "fixed_49",
      termsAcceptedAt: consentAt,
      refundPolicyAcceptedAt: consentAt,
    });

    res.status(201).json({
      success: true,
      order: { id: order.id, amount: order.amount, currency: order.currency },
      keyId: process.env.RAZORPAY_KEY_ID?.trim(),
      plan: "SQLWhale Premium ₹49 Plan (one-time payment)",
    });
  } catch (error: any) {
    console.error("SQLWhale ₹49 order error:", error?.message || error);
    res.status(500).json({ success: false, error: "Unable to create a Razorpay order. Please try again." });
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
        await User.updateOne({ localUserId: user.localUserId }, { $set: { currentPlan: "SQLWhale Premium" } }).exec();
        return res.json({ success: true, verified: true, subscribed: true, message: "Subscription is already active." });
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
    await savedPayment.save();

    await User.updateOne({ localUserId: user.localUserId }, { $set: { currentPlan: "SQLWhale Premium" } }).exec();

    res.json({ success: true, verified: true, subscribed: true, plan: "SQLWhale Premium", message: "Payment verified! SQLWhale Premium is active." });
  } catch (error: any) {
    console.error("Payment verification error:", error?.message || error);
    res.status(500).json({ success: false, error: "Unable to verify payment. Contact support if money was deducted." });
  }
});

export default router;
