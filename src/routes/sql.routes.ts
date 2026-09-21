import { Router } from "express";

import { executeSQLController } from "../controllers/sql.controller";

const router = Router();

router.post("/", executeSQLController);

export default router;