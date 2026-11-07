import mongoose, { Schema } from "mongoose";

const CompetitionRegistrationSchema = new Schema({
  competitionId: { type: Schema.Types.ObjectId, ref: "SQLWhaleCompetition", required: true },
  localUserId: { type: String, required: true },
  userEmail: { type: String, required: true, lowercase: true, trim: true },
  displayName: { type: String, required: true, trim: true },
  registeredAt: { type: Date, default: Date.now },
}, { collection: "sqlwhale_competition_registrations" });

CompetitionRegistrationSchema.index({ competitionId: 1, localUserId: 1 }, { unique: true });
CompetitionRegistrationSchema.index({ competitionId: 1, userEmail: 1 }, { unique: true });
export default mongoose.models.SQLWhaleCompetitionRegistration || mongoose.model("SQLWhaleCompetitionRegistration", CompetitionRegistrationSchema);
