import { initializeSchema } from "./schema";
import { seedDatabase } from "./seed";

initializeSchema();
seedDatabase();

console.log("SQLCrew database initialized successfully.");