import { Schema, model, models } from "mongoose";

const SiteSettingsSchema = new Schema({
  key: { type: String, required: true, unique: true, index: true },
  maintenance: {
    enabled: { type: Boolean, default: false },
    title: { type: String, default: "SQLWhale is under maintenance" },
    message: { type: String, default: "We are making a few improvements. Please check back soon." },
    estimatedReturn: { type: String, default: "" },
  },
}, { timestamps: true, collection: "site_settings" });

export default models.SQLWhaleSiteSettings || model("SQLWhaleSiteSettings", SiteSettingsSchema);
