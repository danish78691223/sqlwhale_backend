import { executeSQL } from "../sql-engine/executor";
import { SQLResponse } from "../types/sql.types";

export function executeQuery(query: string): SQLResponse {
  return executeSQL(query);
}