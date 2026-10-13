import mongoose, { Schema } from "mongoose";

const ColumnSchema = new Schema({
  name: { type: String, required: true, trim: true },
  type: { type: String, enum: ["INTEGER", "REAL", "TEXT", "BOOLEAN", "DATE"], required: true },
  primaryKey: { type: Boolean, default: false },
  notNull: { type: Boolean, default: false },
}, { _id: false });

const RelationshipSchema = new Schema({
  column: { type: String, required: true },
  referencesTable: { type: String, required: true },
  referencesColumn: { type: String, required: true },
}, { _id: false });

const TemplateSchema = new Schema({
  name: { type: String, required: true, unique: true, trim: true },
  description: { type: String, default: "" },
  columns: { type: [ColumnSchema], required: true },
  relationships: { type: [RelationshipSchema], default: [] },
  seedRows: { type: [Schema.Types.Mixed], default: [] },
  isDefault: { type: Boolean, default: false },
}, { timestamps: true, collection: "sqlwhale_task_table_templates" });

export default mongoose.models.SQLWhaleTaskTableTemplate ||
  mongoose.model("SQLWhaleTaskTableTemplate", TemplateSchema);
