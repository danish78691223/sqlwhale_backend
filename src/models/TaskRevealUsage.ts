import mongoose, { Schema } from "mongoose";

const TaskRevealUsageSchema = new Schema({
  localUserId: { type: String, required: true, unique: true, index: true },
  count: { type: Number, required: true, default: 0, min: 0, max: 5 },
  windowStartedAt: { type: Date, required: true, default: Date.now },
}, { timestamps: true, collection: "sqlwhale_task_reveal_usage" });

export default mongoose.models.SQLWhaleTaskRevealUsage ||
  mongoose.model("SQLWhaleTaskRevealUsage", TaskRevealUsageSchema);
