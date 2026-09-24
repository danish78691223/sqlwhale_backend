export interface TableColumn {
  name: string;
  type: string;
  notNull?: boolean;
  primaryKey?: boolean;
  defaultValue?: unknown;
  foreignKey?: boolean;
  referencesTable?: string;
  referencesColumn?: string;
}

export interface TableInfo {
  name: string;
  columns: TableColumn[];
}

export interface TableData {
  tableName: string;
  columns: TableColumn[];
  rows: unknown[][];
  rowCount: number;
}
