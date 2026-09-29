import { Schema, model, models } from "mongoose";

const LearningProgressSchema = new Schema({
  localUserId: { type: String, required: true, index: true },
  sectionId: { type: String, required: true },
  completedAt: { type: Date, default: Date.now },
}, { collection: "learning_progress" });
LearningProgressSchema.index({ localUserId: 1, sectionId: 1 }, { unique: true });
export default models.SQLWhaleLearningProgress || model("SQLWhaleLearningProgress", LearningProgressSchema);