import mongoose from "mongoose";

let connected = false;

function validateMongoUri(uri: string): void {
  let parsed: URL;
  try {
    parsed = new URL(uri);
  } catch {
    throw new Error("MONGODB_URI is not a valid MongoDB connection string.");
  }

  if (parsed.protocol !== "mongodb:" && parsed.protocol !== "mongodb+srv:") {
    throw new Error("MONGODB_URI must start with mongodb:// or mongodb+srv://.");
  }

  if (!parsed.hostname) {
    throw new Error("MONGODB_URI does not contain a MongoDB host.");
  }

  if (parsed.protocol === "mongodb+srv:" && parsed.hostname === "sqlwhale") {
    throw new Error(
      "MONGODB_URI is using 'mongodb+srv://sqlwhale'. 'sqlwhale' is a database name, not an Atlas cluster hostname. Copy the full MongoDB Atlas connection string from Connect → Drivers."
    );
  }

  if (parsed.hostname.includes("<") || parsed.hostname.includes(">")) {
    throw new Error("MONGODB_URI still contains placeholder values. Copy the real MongoDB Atlas connection string.");
  }
}

export async function connectMongo(): Promise<void> {
  if (connected && mongoose.connection.readyState === 1) return;

  const uri = process.env.MONGODB_URI?.trim();

  if (!uri) {
    throw new Error(
      "MONGODB_URI is missing. Add the MongoDB Atlas connection string in Render Environment Variables."
    );
  }

  validateMongoUri(uri);

  try {
    await mongoose.connect(uri, {
      dbName: process.env.MONGODB_DB_NAME?.trim() || "sqlwhale",
      serverSelectionTimeoutMS: 15000,
      connectTimeoutMS: 15000,
    });

    connected = true;
    console.log("SQLWhale MongoDB connected.");
  } catch (error: any) {
    console.error("SQLWhale MongoDB connection failed:", {
      code: error?.code,
      message: error?.message,
    });

    throw new Error(
      "Unable to connect to MongoDB. Check MONGODB_URI, MongoDB Atlas Network Access, and database credentials."
    );
  }
}