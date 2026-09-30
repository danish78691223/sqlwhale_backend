import mongoose, { Schema, type InferSchemaType } from "mongoose";

const MaintenanceSchema = new Schema({
  enabled: { type: Boolean, default: false },
  title: { type: String, default: "SQLWhale is under maintenance" },
  message: { type: String, default: "We are making a few improvements. Please check back soon." },
  estimatedReturn: { type: String, default: "" },
}, { _id: false });

const SiteSettingsSchema = new Schema({
  key: { type: String, required: true, unique: true, index: true },
  maintenance: { type: MaintenanceSchema, default: () => ({}) },
}, { timestamps: true, collection: "site_settings" });

export type SiteSettingsDocument = InferSchemaType<typeof SiteSettingsSchema> & {
  _id: mongoose.Types.ObjectId;
};

export default mongoose.models.SQLWhaleSiteSettings ||
  mongoose.model("SQLWhaleSiteSettings", SiteSettingsSchema);
