import mongoose, { Schema } from "mongoose";

const TaskCompletionSchema = new Schema({
  localUserId: { type: String, required: true, index: true },
  taskId: { type: mongoose.Schema.Types.ObjectId, ref: "SQLWhaleTask", required: true, index: true },
  pointsAwarded: { type: Number, required: true, default: 0, min: 0 },
  completedAt: { type: Date, default: Date.now },
}, { collection: "sqlwhale_task_completions" });

TaskCompletionSchema.index({ localUserId: 1, taskId: 1 }, { unique: true });
TaskCompletionSchema.index({ localUserId: 1, completedAt: -1 });

export default mongoose.models.SQLWhaleTaskCompletion ||
  mongoose.model("SQLWhaleTaskCompletion", TaskCompletionSchema);
