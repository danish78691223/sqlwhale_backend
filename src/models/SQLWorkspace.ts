import mongoose, { Schema } from "mongoose";

const SQLWorkspaceSchema = new Schema({
  workspaceKey: { type: String, required: true, unique: true, index: true },
  data: { type: Buffer, required: true },
  defaultsRestored: { type: Boolean, default: false },
}, { timestamps: true, collection: "sql_workspaces" });

export default mongoose.models.SQLWorkspace || mongoose.model("SQLWorkspace", SQLWorkspaceSchema);