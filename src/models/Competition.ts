import mongoose, { Schema } from "mongoose";

const CompetitionSchema = new Schema({
  title: { type: String, required: true, trim: true, maxlength: 120 },
  slug: { type: String, required: true, trim: true, lowercase: true, unique: true, index: true },
  description: { type: String, default: "", maxlength: 4000 },
  status: { type: String, enum: ["draft", "scheduled", "live", "completed", "archived"], default: "draft", index: true },
  taskIds: [{ type: Schema.Types.ObjectId, ref: "SQLWhaleTask" }],
  points: {
    Easy: { type: Number, default: 5, min: 0 },
    Medium: { type: Number, default: 10, min: 0 },
    Hard: { type: Number, default: 15, min: 0 },
  },
  registrationStartsAt: { type: Date, default: null },
  registrationEndsAt: { type: Date, default: null },
  startsAt: { type: Date, default: null },
  endsAt: { type: Date, default: null },
  certificateTopN: { type: Number, default: 3, min: 0, max: 100 },
  finalizedAt: { type: Date, default: null },
  frozenRanking: { type: [Schema.Types.Mixed], default: [] },
  createdBy: { type: String, default: null },
}, { timestamps: true, collection: "sqlwhale_competitions" });

CompetitionSchema.index({ status: 1, startsAt: 1 });
export default mongoose.models.SQLWhaleCompetition || mongoose.model("SQLWhaleCompetition", CompetitionSchema);
