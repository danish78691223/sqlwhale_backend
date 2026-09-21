import { SQLCommand } from "../types/sql.types";

export function parseCommand(query: string): SQLCommand {
  const normalizedQuery = query.trim().replace(/\s+/g, " ");

  if (!normalizedQuery) {
    return "UNKNOWN";
  }

  const match = normalizedQuery.match(/^([A-Za-z]+)/);

  if (!match) {
    return "UNKNOWN";
  }

  const command = match[1].toUpperCase();

  switch (command) {
    case "CREATE":
      if (/^CREATE\s+TABLE/i.test(normalizedQuery)) {
        return "CREATE_TABLE";
      }
      return "UNKNOWN";

    case "INSERT":
      return "INSERT";

    case "SELECT":
      return "SELECT";

    case "UPDATE":
      return "UPDATE";

    case "DELETE":
      return "DELETE";

    case "DROP":
      if (/^DROP\s+TABLE/i.test(normalizedQuery)) {
        return "DROP_TABLE";
      }
      return "UNKNOWN";

    default:
      return "UNKNOWN";
  }
}

export function normalizeQuery(query: string): string {
  return query.trim().replace(/;\s*$/, "");
}