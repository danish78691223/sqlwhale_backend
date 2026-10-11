import { Schema, model, models } from "mongoose";

const PasswordResetTokenSchema = new Schema({
  tokenHash: { type: String, required: true, unique: true, index: true },
  userId: { type: String, required: true, index: true },
  expiresAt: { type: Date, required: true, index: true },
  usedAt: { type: Date, default: null },
}, { timestamps: true, collection: "password_reset_tokens" });

export default models.SQLWhalePasswordResetToken || model("SQLWhalePasswordResetToken", PasswordResetTokenSchema);
