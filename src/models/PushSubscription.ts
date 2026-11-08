import { Schema, model, models } from "mongoose";

const schema = new Schema({
  // Anonymous browser subscriptions are valid; when a visitor is signed in,
  // localUserId links the endpoint to their account for account-level settings.
  localUserId: { type: String, default: null, index: true },
  endpoint: { type: String, required: true, unique: true },
  keys: { p256dh: { type: String, required: true }, auth: { type: String, required: true } },
  dailyEnabled: { type: Boolean, default: true },
  announcementsEnabled: { type: Boolean, default: true },
  lastDailySentDate: { type: String, default: "" },
}, { timestamps: true, collection: "push_subscriptions" });
export default models.SQLWhalePushSubscription || model("SQLWhalePushSubscription", schema);
