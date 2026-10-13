import mongoose, { Schema, type InferSchemaType } from "mongoose";

const TaskTableConfigSchema = new Schema({
  templateId: { type: String, default: null },
  tableName: { type: String, required: true, trim: true },
  mode: { type: String, enum: ["template", "custom"], default: "template" },
  columns: { type: [Schema.Types.Mixed], default: [] },
  relationships: { type: [Schema.Types.Mixed], default: [] },
  seedRows: { type: [[Schema.Types.Mixed]], default: [] },
}, { _id: false });

const TaskSchema = new Schema({
  title: { type: String, required: true, trim: true },
  description: { type: String, required: true, trim: true },
  expectedQuery: { type: String, required: true, trim: true },
  expectedColumns: { type: [String], default: null },
  expectedRows: { type: [Schema.Types.Mixed], default: null },
  requiredTables: { type: [TaskTableConfigSchema], default: [] },
  difficulty: { type: String, enum: ["Easy", "Medium", "Hard"], default: "Easy" },
  isActive: { type: Boolean, default: true, index: true },
  createdBy: { type: String, default: null },
}, { timestamps: true, collection: "sqlwhale_tasks" });

export type TaskDocument = InferSchemaType<typeof TaskSchema> & {
  _id: mongoose.Types.ObjectId;
};

export default mongoose.models.SQLWhaleTask ||
  mongoose.model("SQLWhaleTask", TaskSchema);
