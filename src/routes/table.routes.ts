import { Router } from "express";

import {
  getTableController,
  getTablesController,
} from "../controllers/table.controller";

const router = Router();

router.get("/", getTablesController);

router.get("/:tableName", getTableController);

export default router;