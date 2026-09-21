import { Request, Response } from "express";

import {
  getAllTables,
  getTableData,
  getTableInfo,
} from "../database/sandbox";

export function getTablesController(
  _req: Request,
  res: Response
): void {
  try {
    const tables = getAllTables();

    res.status(200).json({
      success: true,
      tables,
    });
  } catch (error) {
    console.error("Get Tables Error:", error);

    res.status(500).json({
      success: false,
      error: "Unable to retrieve tables.",
    });
  }
}

export function getTableController(
  req: Request,
  res: Response
): void {
  try {
    const tableNameParam = req.params.tableName;

    const tableName =
      typeof tableNameParam === "string"
        ? tableNameParam
        : Array.isArray(tableNameParam)
          ? tableNameParam[0]
          : undefined;

    if (!tableName) {
      res.status(400).json({
        success: false,
        error: "Table name is required.",
      });

      return;
    }

    const tableInfo = getTableInfo(tableName);
    const tableData = getTableData(tableName);

    res.status(200).json({
      success: true,

      table: {
        name: tableInfo.name,
        columns: tableInfo.columns,
      },

      data: {
        rows: tableData.rows,
        rowCount: tableData.rowCount,
      },
    });
  } catch (error) {
    console.error("Get Table Error:", error);

    const message =
      error instanceof Error
        ? error.message
        : "Unable to retrieve table.";

    res.status(404).json({
      success: false,
      error: message,
    });
  }
}