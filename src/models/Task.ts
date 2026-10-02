import mongoose, { Schema, type InferSchemaType } from "mongoose";

const TaskSchema = new Schema({
  title: { type: String, required: true, trim: true },
  description: { type: String, required: true, trim: true },
  expectedQuery: { type: String, required: true, trim: true },
  difficulty: { type: String, enum: ["Easy", "Medium", "Hard"], default: "Easy" },
  isActive: { type: Boolean, default: true, index: true },
  createdBy: { type: String, default: null },
}, { timestamps: true, collection: "sqlwhale_tasks" });

export type TaskDocument = InferSchemaType<typeof TaskSchema> & {
  _id: mongoose.Types.ObjectId;
};

export default mongoose.models.SQLWhaleTask ||
  mongoose.model("SQLWhaleTask", TaskSchema);
