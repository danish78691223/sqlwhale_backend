import express, {
  NextFunction,
  Request,
  Response,
} from "express";

import cors from "cors";
import dotenv from "dotenv";

import { initializeSchema } from "./database/schema";
import { seedDatabase } from "./database/seed";

import sqlRoutes from "./routes/sql.routes";
import tableRoutes from "./routes/table.routes";
import lessonRoutes from "./routes/lesson.routes";

dotenv.config();

const app = express();

const PORT = Number(process.env.PORT) || 5000;

/*
|--------------------------------------------------------------------------
| Database Initialization
|--------------------------------------------------------------------------
*/

try {
  initializeSchema();
  seedDatabase();

  console.log("SQLCrew database initialized successfully.");
} catch (error) {
  console.error("Database initialization failed:", error);
  process.exit(1);
}

/*
|--------------------------------------------------------------------------
| Middleware
|--------------------------------------------------------------------------
*/

app.use(
  cors({
    origin: process.env.FRONTEND_URL || "*",
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  })
);

app.use(express.json({ limit: "1mb" }));

app.use(express.urlencoded({ extended: true }));

/*
|--------------------------------------------------------------------------
| Request Logger
|--------------------------------------------------------------------------
*/

app.use(
  (
    req: Request,
    _res: Response,
    next: NextFunction
  ): void => {
    console.log(
      `[${new Date().toISOString()}] ${req.method} ${req.originalUrl}`
    );

    next();
  }
);

/*
|--------------------------------------------------------------------------
| Health Check
|--------------------------------------------------------------------------
*/

app.get(
  "/api/health",
  (_req: Request, res: Response): void => {
    res.status(200).json({
      success: true,
      message: "SQLCrew backend is running.",
      timestamp: new Date().toISOString(),
    });
  }
);

/*
|--------------------------------------------------------------------------
| API Routes
|--------------------------------------------------------------------------
*/

app.use("/api/sql", sqlRoutes);

app.use("/api/tables", tableRoutes);

app.use("/api/lessons", lessonRoutes);

/*
|--------------------------------------------------------------------------
| 404 Handler
|--------------------------------------------------------------------------
*/

app.use(
  (
    req: Request,
    res: Response
  ): void => {
    res.status(404).json({
      success: false,
      error: `Route not found: ${req.method} ${req.originalUrl}`,
    });
  }
);

/*
|--------------------------------------------------------------------------
| Global Error Handler
|--------------------------------------------------------------------------
*/

app.use(
  (
    error: Error,
    _req: Request,
    res: Response,
    _next: NextFunction
  ): void => {
    console.error("Unhandled Server Error:", error);

    res.status(500).json({
      success: false,
      error: "Internal server error.",
    });
  }
);

/*
|--------------------------------------------------------------------------
| Start Server
|--------------------------------------------------------------------------
*/

app.listen(PORT, () => {
  console.log("========================================");
  console.log("        SQLCrew Backend Server");
  console.log("========================================");
  console.log(`Server: http://localhost:${PORT}`);
  console.log(`Health: http://localhost:${PORT}/api/health`);
  console.log(`SQL:    http://localhost:${PORT}/api/sql`);
  console.log(`Tables: http://localhost:${PORT}/api/tables`);
  console.log(`Lessons:http://localhost:${PORT}/api/lessons`);
  console.log("========================================");
});