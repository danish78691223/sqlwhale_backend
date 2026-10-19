import { Schema, model, models } from "mongoose";

const LearningQuizAttemptSchema = new Schema({
  localUserId: { type: String, required: true, index: true },
  moduleId: { type: Number, required: true, min: 1, max: 10 },
  answers: { type: Schema.Types.Mixed, required: true },
  score: { type: Number, required: true, min: 0, max: 5 },
  passed: { type: Boolean, required: true, default: false },
  submittedAt: { type: Date, default: Date.now },
}, { collection: "learning_quiz_attempts" });
LearningQuizAttemptSchema.index({ localUserId: 1, moduleId: 1 }, { unique: true });
export default models.SQLWhaleLearningQuizAttempt || model("SQLWhaleLearningQuizAttempt", LearningQuizAttemptSchema);