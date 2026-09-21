import { executeQuery } from "./execution.service";
import { SQLResponse } from "../types/sql.types";

export function runSQLQuery(query: string): SQLResponse {
  const result = executeQuery(query);

  return result;
}