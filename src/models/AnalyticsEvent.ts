import { Schema, model, models } from "mongoose";

const schema = new Schema({
  visitorId: { type: String, required: true, index: true },
  path: { type: String, required: true, index: true },
  referrer: { type: String, default: "" },
  device: { type: String, enum: ["desktop", "mobile", "tablet", "unknown"], default: "unknown", index: true },
  browser: { type: String, default: "Unknown" },
  os: { type: String, default: "Unknown" },
  country: { type: String, default: "Unknown" },
  userAgent: { type: String, default: "" },
  visitedAt: { type: Date, default: Date.now, index: true },
}, { timestamps: true, collection: "website_analytics_events" });

schema.index({ visitedAt: 1, visitorId: 1 });
export default models.SQLWhaleAnalyticsEvent || model("SQLWhaleAnalyticsEvent", schema);
