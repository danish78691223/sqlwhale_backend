import mongoose, { Schema } from "mongoose";

const CompetitionCertificateSchema = new Schema({
  competitionId: { type: Schema.Types.ObjectId, ref: "SQLWhaleCompetition", required: true, index: true },
  localUserId: { type: String, required: true, index: true },
  certificateId: { type: String, required: true, unique: true, index: true },
  rank: { type: Number, required: true, min: 1 },
  participantName: { type: String, required: true },
  participantEmail: { type: String, required: true, lowercase: true, trim: true },
  status: { type: String, enum: ["approved", "revoked"], default: "approved", index: true },
  approvedBy: { type: String, required: true },
  approvedAt: { type: Date, default: Date.now },
  emailStatus: { type: String, enum: ["pending", "sent", "failed"], default: "pending" },
  emailSentAt: { type: Date, default: null },
  emailError: { type: String, default: null },
}, { timestamps: true, collection: "sqlwhale_competition_certificates" });

CompetitionCertificateSchema.index({ competitionId: 1, localUserId: 1 }, { unique: true });
export default mongoose.models.SQLWhaleCompetitionCertificate || mongoose.model("SQLWhaleCompetitionCertificate", CompetitionCertificateSchema);
