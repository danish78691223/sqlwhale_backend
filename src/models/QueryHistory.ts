import { Schema, model, models } from "mongoose";

const QueryHistorySchema = new Schema({
  localUserId: { type: String, required: true, index: true },
  query: { type: String, required: true },
  command: { type: String, default: null },
  status: { type: String, enum: ["success", "error"], required: true },
  executionTimeMs: { type: Number, default: 0 },
  rowsReturned: { type: Number, default: 0 },
  errorMessage: { type: String, default: null },
}, { timestamps: { createdAt: "createdAt", updatedAt: false }, collection: "query_history" });
QueryHistorySchema.index({ localUserId: 1, createdAt: -1 });
export default models.SQLWhaleQueryHistory || model("SQLWhaleQueryHistory", QueryHistorySchema);