import type { QueryAnalysis, QueryJoin } from "../types/sql.types";

const STOP_WORDS = new Set(["JOIN","LEFT","RIGHT","FULL","INNER","OUTER","CROSS","WHERE","ON","GROUP","ORDER","LIMIT","HAVING","UNION"]);

function stripComments(query: string): string {
  return query.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/--[^\n]*/g, " ");
}

function unique(values: string[]): string[] {
  return [...new Set(values.map((value) => value.replace(/['"`]/g, "").trim()).filter(Boolean))];
}

export function analyzeQuery(query: string): QueryAnalysis {
  const sql = stripComments(query).trim().replace(/;\s*$/, "");
  if (!sql) return { tables: [], aliases: {}, joins: [] };

  const aliases: Record<string, string> = {};
  const tables: string[] = [];
  const tablePattern = /\b(?:FROM|JOIN)\s+([A-Za-z_][\w$]*)(?:\s+(?:AS\s+)?([A-Za-z_][\w$]*))?/gi;
  let match: RegExpExecArray | null;

  while ((match = tablePattern.exec(sql)) !== null) {
    const table = match[1];
    const possibleAlias = match[2] || "";
    const alias = STOP_WORDS.has(possibleAlias.toUpperCase()) ? "" : possibleAlias;
    tables.push(table);
    aliases[table.toLowerCase()] = table;
    if (alias) aliases[alias.toLowerCase()] = table;
  }

  const fromMatch = sql.match(/\bFROM\s+([\s\S]*?)(?=\bWHERE\b|\bGROUP\s+BY\b|\bORDER\s+BY\b|\bHAVING\b|\bLIMIT\b|\bUNION\b|$)/i);
  if (fromMatch) {
    for (const part of fromMatch[1].split(/,(?![^()]*\))/)) {
      const first = part.trim().match(/^([A-Za-z_][\w$]*)/);
      if (!first) continue;
      const table = first[1];
      tables.push(table);
      aliases[table.toLowerCase()] = table;
    }
  }

  const joins: QueryJoin[] = [];
  const joinPattern = /\b((?:LEFT|RIGHT|FULL|INNER|CROSS)?\s*JOIN)\s+([A-Za-z_][\w$]*)(?:\s+(?:AS\s+)?([A-Za-z_][\w$]*))?\s+ON\s+([\s\S]*?)(?=\b(?:LEFT|RIGHT|FULL|INNER|CROSS)?\s*JOIN\b|\bWHERE\b|\bGROUP\s+BY\b|\bORDER\s+BY\b|\bHAVING\b|\bLIMIT\b|$)/gi;

  while ((match = joinPattern.exec(sql)) !== null) {
    const joinKeyword = match[1].replace(/\s+/g, " ").trim().toUpperCase();
    const joinedTable = match[2];
    const possibleAlias = match[3] || "";
    const alias = STOP_WORDS.has(possibleAlias.toUpperCase()) ? "" : possibleAlias;
    const condition = match[4].trim().replace(/\s+/g, " ");
    aliases[joinedTable.toLowerCase()] = joinedTable;
    if (alias) aliases[alias.toLowerCase()] = joinedTable;
    tables.push(joinedTable);

    const equality = condition.match(/([A-Za-z_][\w$]*)\.([A-Za-z_][\w$]*)\s*=\s*([A-Za-z_][\w$]*)\.([A-Za-z_][\w$]*)/i);
    const join: QueryJoin = {
      type: joinKeyword.replace(/\s+JOIN$/, "_JOIN").replace(/\s/g, "_"),
      table: joinedTable,
      alias: alias || undefined,
      condition,
    };

    if (equality) {
      join.leftTable = aliases[equality[1].toLowerCase()] ?? equality[1];
      join.leftColumn = equality[2];
      join.rightTable = aliases[equality[3].toLowerCase()] ?? equality[3];
      join.rightColumn = equality[4];
    }
    joins.push(join);
  }

  return { tables: unique(tables), aliases, joins };
}
