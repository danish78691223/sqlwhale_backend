import { Schema, model, models } from "mongoose";

const LearningAssessmentSchema = new Schema({
  localUserId: { type: String, required: true, unique: true, index: true },
  answers: { type: Schema.Types.Mixed, default: {} },
  mcqScore: { type: Number, default: 0, min: 0, max: 50 },
  longAnswerScore: { type: Number, default: 0, min: 0, max: 20 },
  queryScore: { type: Number, default: 0, min: 0, max: 20 },
  totalScore: { type: Number, default: 0, min: 0, max: 50 },
  status: { type: String, enum: ["in_progress", "pending_review", "passed", "failed"], default: "in_progress" },
  attempts: { type: Number, default: 0, min: 0 },
  startedAt: { type: Date, default: null },
  durationSeconds: { type: Number, default: 0, min: 0, max: 3000 },
  submittedAt: { type: Date, default: null },
  reviewedAt: { type: Date, default: null },
}, { timestamps: true, collection: "learning_assessments" });

export default models.SQLWhaleLearningAssessment ||
  model("SQLWhaleLearningAssessment", LearningAssessmentSchema);
