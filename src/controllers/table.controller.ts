import { Request, Response } from "express";
import { getCurrentUser } from "../services/mongoAuth";
import { resolveWorkspace } from "../database/workspaces";
import { runWithDatabase } from "../database/databaseContext";
import { getAllTables, getTableData, getTableInfo } from "../database/sandbox";

export async function getTablesController(req: Request, res: Response): Promise<void> {
  try {
    const user = await getCurrentUser(req);
    const workspace = await resolveWorkspace(req, res, user?.localUserId ?? null);
    const tables = runWithDatabase(workspace.database, () => getAllTables());
    res.status(200).json({ success: true, tables });
  } catch (error) {
    console.error("Get Tables Error:", error);
    res.status(500).json({ success: false, error: "Unable to retrieve tables." });
  }
}

export async function getTableController(req: Request, res: Response): Promise<void> {
  try {
    const tableNameParam = req.params.tableName;
    const tableName = typeof tableNameParam === "string" ? tableNameParam : Array.isArray(tableNameParam) ? tableNameParam[0] : undefined;
    if (!tableName) { res.status(400).json({ success: false, error: "Table name is required." }); return; }

    const user = await getCurrentUser(req);
    const workspace = await resolveWorkspace(req, res, user?.localUserId ?? null);
    const result = runWithDatabase(workspace.database, () => ({
      tableInfo: getTableInfo(tableName),
      tableData: getTableData(tableName),
    }));
    res.status(200).json({
      success: true,
      table: { name: result.tableInfo.name, columns: result.tableInfo.columns },
      data: { rows: result.tableData.rows, rowCount: result.tableData.rowCount },
    });
  } catch (error) {
    console.error("Get Table Error:", error);
    const message = error instanceof Error ? error.message : "Unable to retrieve table.";
    res.status(404).json({ success: false, error: message });
  }
}