import { Schema, model, models } from "mongoose";
const schema = new Schema({
  localUserId: { type: String, required: true, index: true },
  endpoint: { type: String, required: true, unique: true },
  keys: { p256dh: { type: String, required: true }, auth: { type: String, required: true } },
  dailyEnabled: { type: Boolean, default: true },
  announcementsEnabled: { type: Boolean, default: true },
  lastDailySentDate: { type: String, default: "" },
}, { timestamps: true, collection: "push_subscriptions" });
export default models.SQLWhalePushSubscription || model("SQLWhalePushSubscription", schema);
