import mongoose, { Schema } from "mongoose";

const TaskCompletionSchema = new Schema({
  localUserId: { type: String, required: true, index: true },
  taskId: { type: mongoose.Schema.Types.ObjectId, ref: "SQLWhaleTask", required: true, index: true },
  completedAt: { type: Date, default: Date.now },
}, { collection: "sqlwhale_task_completions" });

TaskCompletionSchema.index({ localUserId: 1, taskId: 1 }, { unique: true });

export default mongoose.models.SQLWhaleTaskCompletion ||
  mongoose.model("SQLWhaleTaskCompletion", TaskCompletionSchema);
