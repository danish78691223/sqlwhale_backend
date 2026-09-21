import { SQLCommand } from "../types/sql.types";

const supportedCommands: SQLCommand[] = [
  "CREATE_TABLE",
  "INSERT",
  "SELECT",
];

export function validateCommand(command: SQLCommand): void {
  if (command === "UNKNOWN") {
    throw new Error(
      "Unsupported SQL command. SQLCrew currently supports CREATE TABLE, INSERT and SELECT."
    );
  }

  if (!supportedCommands.includes(command)) {
    throw new Error(
      `The '${command}' operation is not enabled in the current SQLCrew MVP.`
    );
  }
}

export function validateQuery(query: string): void {
  const trimmedQuery = query.trim();

  if (!trimmedQuery) {
    throw new Error("SQL query cannot be empty.");
  }

  if (trimmedQuery.length > 10000) {
    throw new Error("SQL query is too long.");
  }
}