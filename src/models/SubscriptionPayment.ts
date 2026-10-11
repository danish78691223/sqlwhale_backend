import { Schema, model, models } from "mongoose";

const BargainStateSchema = new Schema({
  localUserId: { type: String, required: true, index: true },
  attempts: { type: Number, default: 0, min: 0, max: 3 },
  acceptedPrice: { type: Number, default: null },
  locked: { type: Boolean, default: false },
  expiresAt: { type: Date, required: true, index: { expires: 0 } },
}, { timestamps: true, collection: "bargain_sessions" });

const PaymentSchema = new Schema({
  localUserId: { type: String, required: true, index: true },
  orderId: { type: String, required: true, unique: true, index: true },
  paymentId: { type: String, default: null, index: true },
  amountPaise: { type: Number, required: true, min: 60000 },
  currency: { type: String, default: "INR" },
  status: { type: String, enum: ["created", "paid", "failed"], default: "created", index: true },
  plan: { type: String, default: "SQLWhale Premium" },
  verifiedAt: { type: Date, default: null },
}, { timestamps: true, collection: "subscription_payments" });

export const BargainState = models.SQLWhaleBargainState || model("SQLWhaleBargainState", BargainStateSchema);
export const SubscriptionPayment = models.SQLWhaleSubscriptionPayment || model("SQLWhaleSubscriptionPayment", PaymentSchema);
