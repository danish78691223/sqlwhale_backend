import db from "../config/database";
import { TableColumn, TableData, TableInfo } from "../types/table.types";

export function getAllTables(): string[] {
  const rows = db
    .prepare(`
      SELECT name
      FROM sqlite_master
      WHERE type = 'table'
      AND name NOT LIKE 'sqlite_%'
      ORDER BY name
    `)
    .all() as { name: string }[];

  return rows.map((row) => row.name);
}

export function tableExists(tableName: string): boolean {
  const result = db
    .prepare(`
      SELECT name
      FROM sqlite_master
      WHERE type = 'table'
      AND name = ?
    `)
    .get(tableName);

  return Boolean(result);
}

export function getTableInfo(tableName: string): TableInfo {
  if (!tableExists(tableName)) {
    throw new Error(`Table '${tableName}' does not exist.`);
  }

  const columns = db
    .prepare(`PRAGMA table_info(${escapeIdentifier(tableName)})`)
    .all() as Array<{
    name: string;
    type: string;
    notnull: number;
    pk: number;
    dflt_value: unknown;
  }>;

  return {
    name: tableName,
    columns: columns.map((column) => ({
      name: column.name,
      type: column.type,
      notNull: Boolean(column.notnull),
      primaryKey: Boolean(column.pk),
      defaultValue: column.dflt_value,
    })),
  };
}

export function getTableData(tableName: string): TableData {
  const tableInfo = getTableInfo(tableName);

  const rows = db
    .prepare(`SELECT * FROM ${escapeIdentifier(tableName)}`)
    .all() as Record<string, unknown>[];

  const values = rows.map((row) =>
    tableInfo.columns.map((column) => row[column.name])
  );

  return {
    tableName,
    columns: tableInfo.columns,
    rows: values,
    rowCount: values.length,
  };
}

export function escapeIdentifier(identifier: string): string {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(identifier)) {
    throw new Error(`Invalid SQL identifier: ${identifier}`);
  }

  return `"${identifier.replace(/"/g, '""')}"`;
}

export function getColumnNames(tableName: string): string[] {
  const tableInfo = getTableInfo(tableName);

  return tableInfo.columns.map((column) => column.name);
}