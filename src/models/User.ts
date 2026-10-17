import mongoose, { Schema, type InferSchemaType } from "mongoose";

const UserSchema = new Schema({
  localUserId: { type: String, required: true, unique: true, index: true },
  name: { type: String, required: true, trim: true },
  email: { type: String, required: true, unique: true, index: true, lowercase: true, trim: true },
  passwordHash: { type: String, required: true },
  role: { type: String, default: "user" },
  currentPlan: { type: String, enum: ["Starter", "SQLWhale Premium"], default: "Starter" },
  adminPlanOverride: { type: String, enum: ["Starter", "SQLWhale Premium", null], default: null },
  premiumAccessUntil: { type: Date, default: null, index: true },
}, { timestamps: true, collection: "users" });

export type UserDocument = InferSchemaType<typeof UserSchema> & { _id: mongoose.Types.ObjectId };
export default mongoose.models.SQLWhaleUser || mongoose.model("SQLWhaleUser", UserSchema);