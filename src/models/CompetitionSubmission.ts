import mongoose, { Schema } from "mongoose";

const CompetitionSubmissionSchema = new Schema({
  competitionId: { type: Schema.Types.ObjectId, ref: "SQLWhaleCompetition", required: true },
  localUserId: { type: String, required: true },
  taskId: { type: Schema.Types.ObjectId, ref: "SQLWhaleTask", required: true },
  attempts: { type: Number, default: 0, min: 0 },
  isCorrect: { type: Boolean, default: false },
  pointsAwarded: { type: Number, default: 0, min: 0 },
  firstCorrectAt: { type: Date, default: null },
  lastAttemptAt: { type: Date, default: Date.now },
}, { collection: "sqlwhale_competition_submissions", timestamps: true });

CompetitionSubmissionSchema.index({ competitionId: 1, localUserId: 1, taskId: 1 }, { unique: true });
CompetitionSubmissionSchema.index({ competitionId: 1, localUserId: 1, isCorrect: 1 });
export default mongoose.models.SQLWhaleCompetitionSubmission || mongoose.model("SQLWhaleCompetitionSubmission", CompetitionSubmissionSchema);
