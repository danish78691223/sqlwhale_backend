import mongoose from "mongoose";

let connected = false;

export async function connectMongo(): Promise<void> {
  if (connected && mongoose.connection.readyState === 1) return;
  const uri = process.env.MONGODB_URI?.trim();
  if (!uri) throw new Error("MONGODB_URI is required for SQLWhale authentication.");
  await mongoose.connect(uri, {
    dbName: process.env.MONGODB_DB_NAME?.trim() || undefined,
    serverSelectionTimeoutMS: 15000,
  });
  connected = true;
  console.log("SQLWhale MongoDB connected.");
}