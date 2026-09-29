import { Schema, model, models } from "mongoose";

const SessionSchema = new Schema({
  sessionHash: { type: String, required: true, unique: true, index: true },
  localUserId: { type: String, required: true, index: true },
  expiresAt: { type: Date, required: true, index: true },
}, { timestamps: true, collection: "sessions" });

export default models.SQLWhaleSession || model("SQLWhaleSession", SessionSchema);