import { Schema, model, models } from "mongoose";

const RecurringSubscriptionSchema = new Schema({
  localUserId: { type: String, required: true, index: true },
  razorpaySubscriptionId: { type: String, required: true, unique: true, index: true },
  razorpayPlanId: { type: String, required: true },
  status: {
    type: String,
    enum: ["created", "authenticated", "active", "pending", "halted", "cancelled", "completed", "expired"],
    default: "created",
    index: true,
  },
  initialPaymentId: { type: String, default: null },
  termsAcceptedAt: { type: Date, required: true },
  refundPolicyAcceptedAt: { type: Date, required: true },
  recurringConsentAt: { type: Date, required: true },
  termsVersion: { type: String, required: true },
  refundPolicyVersion: { type: String, required: true },
  cancelAtCycleEnd: { type: Boolean, default: false },
  activatedAt: { type: Date, default: null },
  lastVerifiedAt: { type: Date, default: null },
}, { timestamps: true, collection: "recurring_subscriptions" });

export default models.SQLWhaleRecurringSubscription ||
  model("SQLWhaleRecurringSubscription", RecurringSubscriptionSchema);
