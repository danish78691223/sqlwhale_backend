import { Router } from "express";

import {
  getLessonController,
  getLessonsController,
} from "../controllers/lesson.controller";

const router = Router();

router.get("/", getLessonsController);

router.get("/:id", getLessonController);

export default router;