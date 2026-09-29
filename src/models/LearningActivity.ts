import { Schema, model, models } from "mongoose";

const LearningActivitySchema = new Schema({
  localUserId: { type: String, required: true, index: true },
  activityDate: { type: String, required: true },
}, { collection: "learning_activity" });
LearningActivitySchema.index({ localUserId: 1, activityDate: 1 }, { unique: true });
export default models.SQLWhaleLearningActivity || model("SQLWhaleLearningActivity", LearningActivitySchema);