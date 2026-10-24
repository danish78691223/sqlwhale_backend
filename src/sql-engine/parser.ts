import { SQLCommand } from "../types/sql.types";

function stripLeadingComments(query: string): string {
  return query
    .replace(/^\s*(?:--[^\n]*(?:\n|$)|#[^\n]*(?:\n|$)|\/\*[\s\S]*?\*\/\s*)+/g, "")
    .trim();
}

export function parseCommand(query: string): SQLCommand {
  const normalizedQuery = stripLeadingComments(query).replace(/\s+/g, " ");

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

    case "ALTER":
      return /^ALTER\s+TABLE\b/i.test(normalizedQuery) ? "ALTER_TABLE" : "UNKNOWN";

    case "GRANT":
      return /^GRANT\s+/i.test(normalizedQuery) ? "GRANT" : "UNKNOWN";

    default:
      return "UNKNOWN";
  }
}

export function normalizeQuery(query: string): string {
  return query.trim().replace(/;\s*$/, "");
}

/** Split a SQL script at semicolons outside quoted strings and comments. */
export function splitSQLStatements(script: string): string[] {
  const statements: string[] = [];
  let current = ""; let quote: string | null = null; let lineComment = false; let blockComment = false;
  for (let i = 0; i < script.length; i++) {
    const ch = script[i], next = script[i + 1];
    if (lineComment) { current += ch; if (ch === "\n") lineComment = false; continue; }
    if (blockComment) { current += ch; if (ch === "*" && next === "/") { current += next; i++; blockComment = false; } continue; }
    if (quote) { current += ch; if (ch === "\\" && i + 1 < script.length) { current += script[++i]; continue; } if (ch === quote) { if (next === quote && quote !== String.fromCharCode(96)) { current += next; i++; } else quote = null; } continue; }
    if (ch === "'" || ch === String.fromCharCode(34) || ch.charCodeAt(0) === 96) { quote = ch; current += ch; continue; }
    if (ch === "-" && next === "-") { current += ch + next; i++; lineComment = true; continue; }
    if (ch === "/" && next === "*") { current += ch + next; i++; blockComment = true; continue; }
    if (ch === ";") { if (current.trim()) statements.push(current.trim()); current = ""; continue; }
    current += ch;
  }
  if (quote) throw new Error("Unterminated quoted string or identifier in SQL script.");
  if (blockComment) throw new Error("Unterminated block comment in SQL script.");
  if (current.trim()) statements.push(current.trim());
  return statements;
}
