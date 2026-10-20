import { Schema, model, models } from "mongoose";

const CertificateSchema = new Schema({
  localUserId: { type: String, required: true, index: true },
  certificateId: { type: String, required: true, unique: true },
  courseKey: { type: String, required: true, default: "sql-fundamentals" },
  kind: { type: String, required: true, enum: ["demo", "issued"], default: "demo" },
  createdAt: { type: Date, default: Date.now },
}, { collection: "certificates" });

CertificateSchema.index({ localUserId: 1, courseKey: 1, kind: 1 }, { unique: true });
export default models.SQLWhaleCertificate || model("SQLWhaleCertificate", CertificateSchema);
