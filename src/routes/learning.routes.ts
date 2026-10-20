import { Router, type Request, type Response } from "express";
import { getCurrentUser } from "../services/mongoAuth";
import LearningProgress from "../models/LearningProgress";
import LearningAssessment from "../models/LearningAssessment";
import LearningQuizAttempt from "../models/LearningQuizAttempt";
import db from "../config/database";

const router = Router();

export const modules = [
  { id: 1, sectionId: "module-1", title: "SQL & Database Foundations", summary: "Understand databases, tables, rows, columns, keys and schemas.", lessons: [
    { title: "What is SQL?", body: "SQL (Structured Query Language) is used to define, query and manipulate data in relational databases.", example: "SELECT name FROM employees;" },
    { title: "Tables, rows and columns", body: "A table stores records in rows; columns describe each record's attributes.", example: "SELECT * FROM employees;" },
    { title: "Primary and foreign keys", body: "A primary key identifies a row uniquely; a foreign key links related tables.", example: "SELECT e.name, d.department_name FROM employees e JOIN departments d ON e.department_id = d.department_id;" },
  ]},
  { id: 2, sectionId: "module-2", title: "SELECT & Expressions", summary: "Choose columns, use aliases, literals and DISTINCT.", lessons: [
    { title: "Selecting columns", body: "Use SELECT to choose columns and expressions from a source table.", example: "SELECT name, department_id FROM employees;" },
    { title: "Aliases and DISTINCT", body: "Aliases make result labels easier to read. DISTINCT removes duplicate output rows.", example: "SELECT DISTINCT department_id AS department FROM employees;" },
    { title: "Calculated expressions", body: "Arithmetic and expressions can be returned as computed columns.", example: "SELECT name, amount * 1.18 AS amount_with_tax FROM salary;" },
  ]},
  { id: 3, sectionId: "module-3", title: "Filtering with WHERE", summary: "Use comparisons, logical operators, ranges, patterns and NULL checks.", lessons: [
    { title: "Comparison & logical operators", body: "WHERE filters source rows. Combine predicates with AND, OR and NOT.", example: "SELECT * FROM employees WHERE department_id = 1 AND employee_id > 1;" },
    { title: "IN, BETWEEN and LIKE", body: "These operators express membership, ranges and simple text patterns.", example: "SELECT * FROM employees WHERE employee_id BETWEEN 1 AND 3;" },
    { title: "NULL handling", body: "NULL means missing or unknown; test it with IS NULL and IS NOT NULL.", example: "SELECT * FROM employees WHERE department_id IS NOT NULL;" },
  ]},
  { id: 4, sectionId: "module-4", title: "Sorting, Limiting & Query Order", summary: "Sort results, limit output and understand logical query processing.", lessons: [
    { title: "ORDER BY", body: "Sort returned rows with ASC or DESC.", example: "SELECT * FROM salary ORDER BY amount DESC;" },
    { title: "LIMIT", body: "LIMIT caps the number of returned rows (syntax varies by database).", example: "SELECT * FROM employees ORDER BY employee_id LIMIT 3;" },
    { title: "Logical query order", body: "A useful mental model is FROM/JOIN, WHERE, GROUP BY, HAVING, SELECT, DISTINCT, ORDER BY, LIMIT.", example: "SELECT employee_id, amount FROM salary WHERE amount >= 50000 ORDER BY amount DESC LIMIT 3;" },
  ]},
  { id: 5, sectionId: "module-5", title: "Aggregate Functions & GROUP BY", summary: "Summarize data with COUNT, SUM, AVG, MIN, MAX and HAVING.", lessons: [
    { title: "Aggregate functions", body: "Aggregates calculate a summary across a set of rows.", example: "SELECT COUNT(*) AS employee_count FROM employees;" },
    { title: "GROUP BY", body: "GROUP BY creates one result group for each distinct combination of grouping values.", example: "SELECT department_id, COUNT(*) AS total FROM employees GROUP BY department_id;" },
    { title: "HAVING", body: "HAVING filters groups after aggregation, unlike WHERE which filters rows before grouping.", example: "SELECT department_id, AVG(amount) AS average_salary FROM employees JOIN salary USING (employee_id) GROUP BY department_id HAVING AVG(amount) > 50000;" },
  ]},
  { id: 6, sectionId: "module-6", title: "JOINs & Relationships", summary: "Combine tables with INNER, LEFT and self joins.", lessons: [
    { title: "INNER JOIN", body: "Returns rows with matching keys on both sides.", example: "SELECT e.name, d.department_name FROM employees e INNER JOIN departments d ON e.department_id = d.department_id;" },
    { title: "LEFT JOIN", body: "Preserves every left-side row and includes matching right-side values when found.", example: "SELECT e.name, p.project_name FROM employees e LEFT JOIN projects p ON e.employee_id = p.employee_id;" },
    { title: "Join discipline", body: "Use aliases and explicit ON conditions. Check whether joins multiply rows.", example: "SELECT e.name, p.project_name FROM employees e JOIN projects p ON e.employee_id = p.employee_id ORDER BY e.name;" },
  ]},
  { id: 7, sectionId: "module-7", title: "Subqueries, CTEs & Set Operations", summary: "Compose readable multi-step queries using nested queries, WITH and UNION.", lessons: [
    { title: "Subqueries", body: "A subquery is a query nested inside another query.", example: "SELECT name FROM employees WHERE employee_id IN (SELECT employee_id FROM projects);" },
    { title: "Common Table Expressions", body: "A CTE gives a named query expression to improve readability.", example: "WITH project_counts AS (SELECT employee_id, COUNT(*) AS total FROM projects GROUP BY employee_id) SELECT * FROM project_counts;" },
    { title: "Set operations", body: "UNION combines compatible results and removes duplicates by default; UNION ALL retains them.", example: "SELECT employee_id FROM employees UNION SELECT employee_id FROM projects;" },
  ]},
  { id: 8, sectionId: "module-8", title: "Data Modification & Integrity", summary: "Learn INSERT, UPDATE, DELETE, constraints and safe changes.", lessons: [
    { title: "INSERT", body: "INSERT adds rows; specify target columns to make intent clear.", example: "INSERT INTO departments (department_id, department_name, location) VALUES (4, 'Design', 'Pune');" },
    { title: "UPDATE and DELETE", body: "Use a selective WHERE clause and preview target rows before changing or deleting data.", example: "UPDATE employees SET department_id = 2 WHERE employee_id = 4;" },
    { title: "Constraints & transactions", body: "Keys and constraints protect integrity; transactions group changes into a unit of work.", example: "BEGIN; UPDATE salary SET amount = amount + 1000 WHERE employee_id = 1; COMMIT;" },
  ]},
  { id: 9, sectionId: "module-9", title: "Database Design & Performance", summary: "Learn normalization, indexes, query plans and maintainable schemas.", lessons: [
    { title: "Normalization", body: "Normalization reduces avoidable redundancy and update anomalies by organizing related facts.", example: "SELECT employee_id, department_id FROM employees;" },
    { title: "Indexes", body: "Indexes may speed up selected reads but require storage and can slow writes.", example: "CREATE INDEX idx_salary_amount ON salary(amount);" },
    { title: "Query performance", body: "Filter early when appropriate, select needed columns, understand join keys and inspect execution plans where supported.", example: "SELECT employee_id, amount FROM salary WHERE amount >= 50000 ORDER BY amount DESC;" },
  ]},
  { id: 10, sectionId: "module-10", title: "Advanced SQL & Final Revision", summary: "Bring window functions, CASE expressions and analytical patterns together.", lessons: [
    { title: "CASE expressions", body: "CASE evaluates conditions and returns a value for the first matching branch.", example: "SELECT employee_id, CASE WHEN amount >= 55000 THEN 'High' ELSE 'Standard' END AS band FROM salary;" },
    { title: "Window functions", body: "Window functions calculate across related rows without collapsing them into one row per group.", example: "SELECT employee_id, amount, RANK() OVER (ORDER BY amount DESC) AS salary_rank FROM salary;" },
    { title: "Final revision", body: "Review selecting, filtering, grouping, joining and writing safe, readable SQL before starting the final assessment.", example: "SELECT d.department_name, COUNT(e.employee_id) AS team_size FROM departments d LEFT JOIN employees e ON e.department_id = d.department_id GROUP BY d.department_id, d.department_name;" },
  ]},
] as const;

type Mcq = { id: string; question: string; options: string[]; answer: number; level: string; explanation: string };
const rawQuestions: Omit<Mcq, "id">[] = [
{level:"Beginner",question:"Which SQL clause selects the columns returned by a query?",options:["WHERE","SELECT","ORDER BY","GROUP BY"],answer:1,explanation:"SELECT specifies the expressions or columns in the result."},
{level:"Beginner",question:"Which clause specifies the source table?",options:["FROM","INTO","VALUES","HAVING"],answer:0,explanation:"FROM identifies the table or query supplying rows."},
{level:"Beginner",question:"What does SELECT * usually request?",options:["Only key columns","Every column from the selected source","Only unique rows","Only numeric columns"],answer:1,explanation:"The asterisk requests all columns from the source."},
{level:"Beginner",question:"Which keyword removes duplicate result rows?",options:["UNIQUE ROWS","ONLY","DISTINCT","DEDUP"],answer:2,explanation:"DISTINCT removes duplicate result rows."},
{level:"Beginner",question:"What is the purpose of an alias in a SELECT expression?",options:["Renames a stored table permanently","Names a result expression","Filters the result","Creates an index"],answer:1,explanation:"AS gives a selected expression a readable output label."},
{level:"Beginner",question:"Which clause filters individual rows before grouping?",options:["HAVING","WHERE","ORDER BY","LIMIT"],answer:1,explanation:"WHERE filters rows before aggregation."},
{level:"Beginner",question:"Which condition correctly checks for a NULL value?",options:["column = NULL","column == NULL","column IS NULL","column EQUALS NULL"],answer:2,explanation:"Use IS NULL or IS NOT NULL to test nullness."},
{level:"Beginner",question:"What does BETWEEN 10 AND 20 include in standard SQL?",options:["Excludes both endpoints","Values from 10 through 20, including endpoints","Only strings","Only NULL values"],answer:1,explanation:"BETWEEN is inclusive of both endpoints."},
{level:"Beginner",question:"Which operator tests whether a value matches any value in a list?",options:["LIKE","IN","IS","EXISTS ONLY"],answer:1,explanation:"IN compares an expression to a listed set or subquery result."},
{level:"Beginner",question:"In a LIKE pattern, what does percent (%) represent?",options:["Exactly one character","Any sequence of zero or more characters","A numeric value only","A literal quote"],answer:1,explanation:"In LIKE, percent matches any sequence of characters."},
{level:"Beginner",question:"Which clause sorts query output?",options:["GROUP BY","SORT ROWS","ORDER BY","ARRANGE"],answer:2,explanation:"ORDER BY sorts result rows."},
{level:"Beginner",question:"Which order direction places larger numeric values first?",options:["ASC","DESC","UP","REVERSE ASC"],answer:1,explanation:"DESC sorts from higher to lower values."},
{level:"Beginner",question:"In SQLite, what does LIMIT 5 do?",options:["Skips five rows","Returns at most five rows","Groups rows into five groups","Creates five copies"],answer:1,explanation:"LIMIT caps the number of returned rows."},
{level:"Beginner",question:"Which function counts all rows, including rows with NULL values in some columns?",options:["COUNT(*)","COUNT(column)","SUM(*)","TOTAL ROWS()"],answer:0,explanation:"COUNT(*) counts rows; COUNT(column) ignores NULL values in that column."},
{level:"Beginner",question:"Which function calculates the arithmetic mean of non-NULL values?",options:["SUM","MEAN","AVG","MID"],answer:2,explanation:"AVG calculates the average of non-NULL numeric values."},
{level:"Beginner",question:"Which clause creates groups for aggregate calculations?",options:["ORDER BY","GROUP BY","WHERE","DISTINCT BY"],answer:1,explanation:"GROUP BY forms groups based on grouping expressions."},
{level:"Beginner",question:"Which clause filters groups after aggregation?",options:["WHERE","HAVING","ON","LIMIT"],answer:1,explanation:"HAVING filters aggregate groups."},
{level:"Beginner",question:"Which JOIN returns only rows matching on both sides?",options:["LEFT JOIN","INNER JOIN","CROSS JOIN","SELF JOIN always"],answer:1,explanation:"INNER JOIN preserves rows for which the join condition matches."},
{level:"Beginner",question:"What is the key behavior of LEFT JOIN?",options:["Keeps all right rows only","Keeps all left rows and matching right data","Removes all NULL values","Always returns one row"],answer:1,explanation:"Unmatched left rows remain; right-side columns become NULL."},
{level:"Beginner",question:"What does the ON clause typically define in a JOIN?",options:["A matching condition","A sort order","A transaction boundary","A new table name"],answer:0,explanation:"ON specifies the join predicate."},
{level:"Intermediate",question:"What happens when a left row matches three right rows in a one-to-many JOIN?",options:["The left row can appear three times","Only the first match can appear","The query deletes two rows","The query always errors"],answer:0,explanation:"Each matching pair contributes a joined row."},
{level:"Intermediate",question:"Which expression counts non-NULL values in a phone column?",options:["COUNT(*)","COUNT(phone)","SUM(phone)","ROWS(phone)"],answer:1,explanation:"COUNT(phone) counts rows where phone is not NULL."},
{level:"Intermediate",question:"Which expression returns the maximum value of amount?",options:["TOP(amount)","HIGH(amount)","MAX(amount)","LAST(amount)"],answer:2,explanation:"MAX returns the greatest value in the input set."},
{level:"Intermediate",question:"Which clause normally filters grouped totals?",options:["HAVING","WHERE","FROM","VALUES"],answer:0,explanation:"HAVING filters grouped results."},
{level:"Intermediate",question:"Which query clause is appropriate for departments with more than five employees?",options:["WHERE COUNT(*) > 5","HAVING COUNT(*) > 5 after GROUP BY department","ORDER BY COUNT(*) > 5","LIMIT COUNT(*) > 5"],answer:1,explanation:"Aggregate conditions belong in HAVING after grouping."},
{level:"Intermediate",question:"What does UNION do by default?",options:["Always keeps every duplicate","Combines compatible results and removes duplicates","Matches tables by key","Updates the first table"],answer:1,explanation:"UNION deduplicates combined rows; UNION ALL retains duplicates."},
{level:"Intermediate",question:"What must be true for two SELECT statements combined with UNION?",options:["Same table name","Same number of result columns with compatible types","Same WHERE clause","Same number of rows"],answer:1,explanation:"Corresponding result sets need compatible column counts and types."},
{level:"Intermediate",question:"When is UNION ALL preferable to UNION?",options:["When duplicates must be removed","When duplicates should remain and deduplication is unnecessary","When joining tables","When deleting rows"],answer:1,explanation:"UNION ALL avoids unnecessary duplicate elimination."},
{level:"Intermediate",question:"What is a subquery?",options:["A query nested inside another statement","A database user","A table constraint","A sort direction"],answer:0,explanation:"A subquery is an inner query used by an outer statement."},
{level:"Intermediate",question:"Which keyword starts a common table expression?",options:["LET","WITH","TEMP","DEFINE"],answer:1,explanation:"WITH introduces one or more CTEs."},
{level:"Intermediate",question:"Which operator checks whether a subquery returns at least one row?",options:["EXISTS","CONTAINS ROW","HAS","IN ROWS ONLY"],answer:0,explanation:"EXISTS evaluates whether the subquery yields any row."},
{level:"Intermediate",question:"If IN finds no matching value and there are no NULL complications, what is the result?",options:["TRUE","FALSE","Always NULL","A syntax error"],answer:1,explanation:"IN is false when there is no match and no NULL ambiguity."},
{level:"Intermediate",question:"Which command adds new rows to an existing table?",options:["UPDATE","ALTER","INSERT","DROP"],answer:2,explanation:"INSERT adds records to a table."},
{level:"Intermediate",question:"What can happen when UPDATE is run without a WHERE clause?",options:["Only one row changes","Every row may be updated","Rollback is guaranteed","The table is renamed"],answer:1,explanation:"Without WHERE, an UPDATE may affect every row."},
{level:"Intermediate",question:"Which command removes selected records but leaves the table structure?",options:["DROP TABLE","DELETE","REMOVE TABLE","TRUNCATE DATABASE"],answer:1,explanation:"DELETE removes rows while retaining the table definition."},
{level:"Intermediate",question:"What does a PRIMARY KEY enforce?",options:["Unique and non-NULL row identity","Automatic alphabetical sorting","A speedup for every query","Duplicate records"],answer:0,explanation:"A primary key uniquely identifies each row and cannot be NULL."},
{level:"Intermediate",question:"What does a foreign key primarily represent?",options:["A result alias","A relationship to a key in another or the same table","A sort direction","An index-only column"],answer:1,explanation:"A foreign key references a key and supports referential integrity."},
{level:"Intermediate",question:"What does ROLLBACK do to uncommitted transactional changes?",options:["Makes them permanent","Cancels them","Exports the table","Creates an index"],answer:1,explanation:"ROLLBACK aborts the current transaction's uncommitted changes."},
{level:"Intermediate",question:"Which constraint rejects a value that violates a specified condition?",options:["DEFAULT","CHECK","ORDER BY","ALIAS"],answer:1,explanation:"CHECK enforces a Boolean condition on inserted or updated values."},
{level:"Intermediate",question:"What is a common goal of normalization?",options:["Repeat every fact","Reduce redundant data and update anomalies","Remove every relationship","Make every table one row"],answer:1,explanation:"Normalization reduces avoidable redundancy and anomalies."},
{level:"Advanced",question:"What is a common cost of adding indexes?",options:["Indexes always break SELECT","Extra storage and write-maintenance overhead","All NULLs are removed","Tables stop accepting inserts"],answer:1,explanation:"Indexes use storage and must be maintained when rows change."},
{level:"Advanced",question:"Which SQLite statement inspects a high-level query plan?",options:["SHOW PLAN","EXPLAIN QUERY PLAN SELECT ...","DESCRIBE QUERY","TRACE TABLE"],answer:1,explanation:"EXPLAIN QUERY PLAN shows the planner's high-level strategy in SQLite."},
{level:"Advanced",question:"What does a CASE expression return?",options:["Always a table","The first matching WHEN result, otherwise ELSE or NULL","A transaction ID","A new index"],answer:1,explanation:"CASE returns the first matching branch result."},
{level:"Advanced",question:"How does a window function usually differ from GROUP BY?",options:["It deletes duplicates permanently","It adds calculations while retaining individual rows","It cannot use ORDER BY","It always returns one row"],answer:1,explanation:"Window calculations generally retain each input row, unlike grouping."},
{level:"Advanced",question:"What does PARTITION BY do within a window definition?",options:["Deletes partitions","Splits rows into groups for the window calculation","Filters rows before FROM","Replaces ORDER BY"],answer:1,explanation:"PARTITION BY defines independent row groups for window calculations."},
{level:"Advanced",question:"What does ROW_NUMBER() OVER (PARTITION BY team ORDER BY score DESC) do?",options:["Counts all rows in every table","Assigns a sequential number within each team","Deletes tied scores","Returns one row per team"],answer:1,explanation:"ROW_NUMBER assigns sequential values within each partition."},
{level:"Advanced",question:"What does COALESCE(a, b, c) return?",options:["The last non-NULL value","The first non-NULL argument","Always the sum","The number of arguments"],answer:1,explanation:"COALESCE returns the first non-NULL expression."},
{level:"Advanced",question:"What is SQL injection?",options:["A database index strategy","Untrusted input alters intended SQL structure","A form of normalization","A transaction isolation level"],answer:1,explanation:"Injection occurs when input is interpreted as SQL syntax."},
{level:"Advanced",question:"What is a recommended defense against SQL injection for value inputs?",options:["String concatenation","Parameterized queries","Removing constraints","Hiding errors only"],answer:1,explanation:"Parameterized queries keep values separate from SQL syntax."},
{level:"Advanced",question:"For filtering by department_id and sorting by salary, which index may be worth evaluating?",options:["An unrelated biography column","A composite index on department_id and salary, then measure the plan","Every possible index without testing","Dropping the primary key"],answer:1,explanation:"A composite index may help predicates and ordering; confirm with a query plan."}
];
const mcqs: Mcq[] = rawQuestions.map((q, i) => ({ ...q, id: `m${String(i + 1).padStart(2, "0")}` }));
const safeQuestion = (question: Mcq) => ({ id: question.id, question: question.question, options: question.options, level: question.level });



const longQuestions = [
  { id: "l1", question: "Explain the difference between WHERE and HAVING. Include when each is evaluated and a short example." },
  { id: "l2", question: "Explain primary keys and foreign keys, including how they preserve relationships between tables." },
  { id: "l3", question: "Compare INNER JOIN and LEFT JOIN and provide a practical use case for each." },
  { id: "l4", question: "Explain normalization and indexes, including one benefit and one trade-off of each." },
] as const;

const queryQuestions = [
  { id: "q1", question: "From employees, return name and department_id for employees belonging to department 1. Sort by name ascending.", expected: "SELECT name, department_id FROM employees WHERE department_id = 1 ORDER BY name ASC;", hint: "SELECT, WHERE, ORDER BY" },
  { id: "q2", question: "List every department_id and its employee count. Include only groups with at least 1 employee.", expected: "SELECT department_id, COUNT(*) AS total FROM employees GROUP BY department_id HAVING COUNT(*) >= 1;", hint: "GROUP BY, COUNT, HAVING" },
  { id: "q3", question: "Return employee names with their project names, keeping employees even if they have no project.", expected: "SELECT e.name, p.project_name FROM employees e LEFT JOIN projects p ON e.employee_id = p.employee_id;", hint: "LEFT JOIN, ON" },
  { id: "q4", question: "Return employee_id and amount for salary records with amount at least 50000, highest amount first.", expected: "SELECT employee_id, amount FROM salary WHERE amount >= 50000 ORDER BY amount DESC;", hint: "WHERE, ORDER BY DESC" },
] as const;

function gradeLongAnswer(questionId: string, answer: string): { score: number; feedback: string } {
  const text = answer.trim();
  if (text.length < 20) return { score: 0, feedback: "Add a fuller explanation with SQL terminology and an example." };
  const rubric: Record<string, string[][]> = {
    l1: [
      ["\\bwhere\\b"], ["\\b(rows?|records?|individual)\\b"], ["\\bhaving\\b"],
      ["\\b(groups?|aggregate|aggregation)\\b"], ["\\b(before|prior|after|once)\\b"],
    ],
    l2: [
      ["primary key"], ["unique|uniquely|identifier"], ["foreign key"],
      ["reference|relationship|link|refer"], ["referential integrity|parent|child|related table"],
    ],
    l3: [
      ["inner join"], ["matching|matches|matched rows"], ["left join"],
      ["all rows|every row|left table"], ["unmatched|no match|null|optional|preserve"],
    ],
    l4: [
      ["normalization|normalisation"], ["redundancy|duplicate data|update anomaly|anomalies"],
      ["\\bindexes?\\b"], ["performance|faster|speed|query time"], ["storage|write cost|trade.?off|slows writes"],
    ],
  };
  const criteria = rubric[questionId] || [];
  const score = criteria.reduce((total, patterns) =>
    total + (patterns.some((pattern) => new RegExp(pattern, "i").test(text)) ? 1 : 0), 0);
  return {
    score: Math.min(5, score),
    feedback: score >= 4
      ? "Good coverage of the core rubric concepts."
      : "Review the key terms in the question and explain each concept more explicitly.",
  };
}

function gradeSqlQuery(questionId: string, submittedQuery: string, expectedQuery: string): { correct: boolean; feedback: string } {
  const sql = submittedQuery.trim().replace(/;+\s*$/, "");
  if (!sql) return { correct: false, feedback: "No SQL query was provided." };
  if (!/^(SELECT|WITH)\b/i.test(sql) || sql.includes(";") ||
      /\b(INSERT|UPDATE|DELETE|DROP|ALTER|CREATE|ATTACH|DETACH|PRAGMA|VACUUM|REPLACE)\b/i.test(sql)) {
    return { correct: false, feedback: "Submit one read-only SELECT query for this assessment question." };
  }

  const required: Record<string, RegExp[]> = {
    q1: [/\bWHERE\b/i, /\bORDER\s+BY\b/i],
    q2: [/\bGROUP\s+BY\b/i, /\bHAVING\b/i, /\bCOUNT\s*\(/i],
    q3: [/\bLEFT\s+JOIN\b/i, /\bON\b/i],
    q4: [/\bWHERE\b/i, /\bORDER\s+BY\b/i],
  };
  if ((required[questionId] || []).some((pattern) => !pattern.test(sql))) {
    return { correct: false, feedback: "The query is missing one or more required SQL clauses." };
  }

  try {
    const actualRows = db.prepare(sql).all() as Record<string, unknown>[];
    const expectedRows = db.prepare(expectedQuery).all() as Record<string, unknown>[];
    const values = (rows: Record<string, unknown>[]) => rows.map((row) => Object.values(row));
    const actual = values(actualRows);
    const expected = values(expectedRows);
    const unordered = questionId === "q2" || questionId === "q3";
    const comparableActual = unordered ? [...actual].sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b))) : actual;
    const comparableExpected = unordered ? [...expected].sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b))) : expected;
    const correct = JSON.stringify(comparableActual) === JSON.stringify(comparableExpected);
    return {
      correct,
      feedback: correct
        ? "Correct: the output matches the expected result."
        : "The query ran, but its output does not match the expected result. Check selected columns, filters, joins and ordering.",
    };
  } catch {
    return { correct: false, feedback: "The query could not be executed against the assessment dataset. Check table and column names." };
  }
}

router.get("/progress", async (req: Request, res: Response) => {
  const user = await getCurrentUser(req);
  if (!user) return res.status(401).json({ success: false, error: "Sign in to save your learning progress." });
  try {
    const completedItems: any[] = await LearningProgress.find({ localUserId: user.localUserId }).lean().exec();
    const completed = new Set(completedItems.map((x) => x.sectionId));
    const assessment: any = await LearningAssessment.findOne({ localUserId: user.localUserId }).lean().exec();
    return res.json({
      success: true,
      completedModules: modules.filter((m) => completed.has(m.sectionId)).map((m) => m.id),
      completedCount: modules.filter((m) => completed.has(m.sectionId)).length,
      progressPercent: Math.min(100, modules.filter((m) => completed.has(m.sectionId)).length * 10),
      unlockedThrough: Math.min(10, modules.filter((m) => completed.has(m.sectionId)).length + 1),
      assessment: assessment ? { status: assessment.status, attempts: assessment.attempts, totalScore: assessment.totalScore, mcqScore: assessment.mcqScore, longAnswerScore: assessment.longAnswerScore, queryScore: assessment.queryScore, submittedAt: assessment.submittedAt, reviewedAt: assessment.reviewedAt, startedAt: assessment.startedAt, durationSeconds: assessment.durationSeconds } : null,
    });
  } catch (error) {
    console.error("Learning progress lookup failed:", error);
    return res.status(500).json({ success: false, error: "Unable to load learning progress." });
  }
});

const moduleOneQuiz = [
  { question: "What does SQL stand for?", options: ["Simple Question List", "Structured Query Language", "Sequential Queue Logic", "Standard Quick Link"], answer: 1, explanation: "SQL means Structured Query Language and is used to work with relational data." },
  { question: "What does a row in a table represent?", options: ["A field name", "A database engine", "One record", "A SQL keyword"], answer: 2, explanation: "A row contains the values describing one record." },
  { question: "Which key uniquely identifies a row?", options: ["Foreign key", "Primary key", "Sort key", "Alias"], answer: 1, explanation: "A primary key uniquely identifies a row in a table." },
  { question: "Which command family includes CREATE TABLE?", options: ["DDL", "DML", "DCL", "TCL"], answer: 0, explanation: "DDL defines or changes database structures. CREATE TABLE is a DDL command." },
  { question: "Which condition correctly checks a missing value?", options: ["value = NULL", "value IS NULL", "value == NULL", "value EQUALS NULL"], answer: 1, explanation: "SQL uses IS NULL because NULL represents an unknown or missing value." },
];

const moduleTwoQuiz = [
  { question: "Which clause names the table that supplies the data?", options: ["SELECT", "FROM", "AS", "DISTINCT"], answer: 1, explanation: "FROM identifies the source table or tables." },
  { question: "What does SELECT * return?", options: ["Only the primary key", "Only text columns", "All columns in the selected table", "Only unique rows"], answer: 2, explanation: "The asterisk selects all columns. It does not automatically remove duplicate rows." },
  { question: "What does AS do in SELECT full_name AS student?", options: ["Permanently renames the column", "Creates a temporary result heading", "Deletes duplicate names", "Filters rows"], answer: 1, explanation: "AS gives the output column a query-level alias; the table schema stays unchanged." },
  { question: "If DISTINCT is used with two columns, what is considered a duplicate?", options: ["Either column repeats", "The whole selected pair repeats", "Only the first column repeats", "Every row is removed"], answer: 1, explanation: "DISTINCT removes duplicate combinations across all selected expressions." },
  { question: "Which expression joins text in SQLWhale's SQLite sandbox?", options: ["full_name + ' student'", "full_name || ' student'", "JOIN_TEXT(full_name)", "full_name CONCAT ' student'"], answer: 1, explanation: "SQLite supports the || operator for text concatenation." },
];

const moduleThreeQuiz = [
  { question: "Which clause filters individual rows in a SELECT query?", options: ["ORDER BY", "WHERE", "GROUP BY", "AS"], answer: 1, explanation: "WHERE keeps only rows that satisfy the condition." },
  { question: "Which operator requires both conditions to be true?", options: ["OR", "NOT", "AND", "IN"], answer: 2, explanation: "AND returns true only when every connected condition is true." },
  { question: "What does BETWEEN 10 AND 20 include?", options: ["Only values above 10 and below 20", "10 and 20 as well as values between them", "Only 10 and 20", "Only values greater than 20"], answer: 1, explanation: "BETWEEN is inclusive: both endpoints are included." },
  { question: "In LIKE 'S%', what does % mean?", options: ["Exactly one character", "A numeric value", "Zero or more characters", "A missing value"], answer: 2, explanation: "% matches zero or more characters; underscore (_) matches exactly one character." },
  { question: "How should SQL test whether email is missing?", options: ["email = NULL", "email == NULL", "email IS NULL", "email LIKE NULL"], answer: 2, explanation: "Use IS NULL because NULL represents a missing or unknown value." },
];

const moduleFourQuiz = [
  { question: "Which clause sorts the rows returned by a query?", options: ["WHERE", "ORDER BY", "LIMIT", "FROM"], answer: 1, explanation: "ORDER BY sorts the result rows." },
  { question: "What is the default sort direction if ASC or DESC is omitted?", options: ["DESC", "Random", "ASC", "No rows"], answer: 2, explanation: "Ascending order is the default." },
  { question: "Which query returns the three highest salary amounts first in SQLWhale's SQLite sandbox?", options: ["SELECT * FROM salary LIMIT 3 ORDER BY amount DESC;", "SELECT * FROM salary ORDER BY amount DESC LIMIT 3;", "SELECT * FROM salary WHERE LIMIT 3;", "SELECT * FROM salary ORDER BY amount LIMIT DESC 3;"], answer: 1, explanation: "Sort amount descending first, then limit the output to three rows." },
  { question: "What does LIMIT 2 OFFSET 2 do in SQLite?", options: ["Returns two rows, skipping the first two rows", "Skips two rows and returns all remaining rows", "Returns only the first two rows", "Deletes two rows"], answer: 0, explanation: "OFFSET skips two rows and LIMIT returns the next two." },
  { question: "Which is the simplified logical processing order for a basic query?", options: ["SELECT, WHERE, FROM, LIMIT", "LIMIT, SELECT, FROM, WHERE", "FROM, WHERE, SELECT, ORDER BY, LIMIT", "ORDER BY, FROM, SELECT, WHERE"], answer: 2, explanation: "The simplified logical model starts with FROM, filters with WHERE, produces the SELECT list, then sorts and limits." },
];

const moduleFiveQuiz = [
  { question: "Which aggregate counts every row, including rows with NULL values in other columns?", options: ["COUNT(column_name)", "COUNT(*)", "SUM(*)", "TOTAL(column_name)"], answer: 1, explanation: "COUNT(*) counts every row; COUNT(column_name) skips NULL values." },
  { question: "Which function calculates the average of numeric values?", options: ["SUM()", "MAX()", "AVG()", "GROUP()"], answer: 2, explanation: "AVG() returns the arithmetic average of non-NULL numeric values." },
  { question: "What does GROUP BY department_id do?", options: ["Sorts departments alphabetically", "Creates a group for each department_id value", "Deletes duplicate departments", "Filters rows before aggregation"], answer: 1, explanation: "GROUP BY groups rows with the same department_id so aggregates can summarize each group." },
  { question: "Which clause filters groups after aggregation?", options: ["WHERE", "ORDER BY", "HAVING", "LIMIT"], answer: 2, explanation: "HAVING filters grouped results, often using COUNT, SUM or AVG." },
  { question: "What does COUNT(phone_number) count when some phone_number values are NULL?", options: ["Every row", "Only rows with a non-NULL phone_number", "Only rows with NULL phone_number", "It changes NULL to zero"], answer: 1, explanation: "COUNT(column) ignores NULL values and counts only non-NULL values in that column." },
];

const moduleSixQuiz = [
  { question: "Which rows does an INNER JOIN return?", options: ["Every row from the left table", "Only rows with matching join conditions in both tables", "Only rows with no match", "Every possible row combination"], answer: 1, explanation: "INNER JOIN returns rows where the ON condition matches records from both tables." },
  { question: "What is the key behavior of a LEFT JOIN?", options: ["It returns only matching rows", "It removes unmatched left rows", "It keeps every left-table row and fills unmatched right columns with NULL", "It sorts the joined rows"], answer: 2, explanation: "LEFT JOIN preserves all rows from the left table; right-side columns are NULL when there is no match." },
  { question: "What does the ON clause specify in a JOIN?", options: ["The join matching condition", "The final sort order", "Which columns to hide", "How many rows to return"], answer: 0, explanation: "ON defines the condition used to match rows between tables, commonly using related keys." },
  { question: "Why are table aliases such as employees e and departments d useful?", options: ["They permanently rename tables", "They make references shorter and clearer", "They automatically remove duplicates", "They create foreign keys"], answer: 1, explanation: "Aliases shorten table references and help disambiguate columns in a multi-table query." },
  { question: "If one employee matches three project rows in a JOIN, how many joined rows can that employee produce?", options: ["Always one", "Zero", "Three", "Only two"], answer: 2, explanation: "A one-to-many relationship can produce one result row for each matching project." },
];

const moduleSevenQuiz = [
  { question: "What is a subquery?", options: ["A query nested inside another SQL statement", "A table constraint", "A database login", "A command that sorts rows"], answer: 0, explanation: "A subquery is a query placed inside another query, for example inside WHERE or FROM." },
  { question: "Which keyword starts a Common Table Expression (CTE)?", options: ["LET", "WITH", "TEMP", "DEFINE"], answer: 1, explanation: "WITH introduces a named query expression that can be referenced by the statement that follows." },
  { question: "What does UNION do by default?", options: ["Keeps every duplicate row", "Combines compatible result sets and removes duplicates", "Joins tables using a foreign key", "Sorts each source table separately"], answer: 1, explanation: "UNION combines compatible SELECT results and removes duplicate rows; UNION ALL keeps duplicates." },
  { question: "What must be true of the SELECT statements combined by UNION?", options: ["They must use the same table", "They must have the same number of result columns with compatible types", "They must have identical WHERE clauses", "They must return exactly the same rows"], answer: 1, explanation: "Each SELECT in a set operation must return the same number of columns, in corresponding compatible types." },
  { question: "When is UNION ALL usually preferable to UNION?", options: ["When duplicate rows must be removed", "When you need a JOIN", "When duplicate rows should remain and deduplication is unnecessary", "When the query must update data"], answer: 2, explanation: "UNION ALL retains duplicates and can avoid the extra work needed to deduplicate results." },
];

const moduleEightQuiz = [
  { question: "Which SQL command adds new rows to a table?", options: ["INSERT", "UPDATE", "DELETE", "DROP"], answer: 0, explanation: "INSERT adds new records to a table." },
  { question: "What may happen when UPDATE is run without a WHERE clause?", options: ["Only the first row changes", "All rows may be updated", "The table is automatically backed up", "The query becomes a SELECT"], answer: 1, explanation: "Without WHERE, UPDATE applies the SET change to every row in the table." },
  { question: "Which constraint uniquely identifies each row?", options: ["CHECK", "NOT NULL", "PRIMARY KEY", "DEFAULT"], answer: 2, explanation: "A PRIMARY KEY uniquely identifies each row and cannot contain NULL." },
  { question: "What is the difference between DELETE and DROP TABLE?", options: ["There is no difference", "DELETE removes rows; DROP TABLE removes the table definition", "DROP removes only one row", "DELETE removes the database"], answer: 1, explanation: "DELETE removes records while leaving the table structure; DROP TABLE removes the table itself." },
  { question: "What does ROLLBACK do to uncommitted transaction changes?", options: ["Makes them permanent", "Cancels them", "Creates a new table", "Adds a primary key"], answer: 1, explanation: "ROLLBACK cancels uncommitted transaction changes when transaction support is available." }
];

const moduleNineQuiz = [
  { question: "What is the main purpose of a primary key?", options: ["Sort every query automatically", "Uniquely identify each row", "Store a list of values", "Speed up every possible query"], answer: 1, explanation: "A primary key uniquely identifies a row and cannot contain NULL." },
  { question: "What is a common goal of normalization?", options: ["Duplicate every fact", "Remove all foreign keys", "Reduce unnecessary duplication and update anomalies", "Make every table contain one row"], answer: 2, explanation: "Normalization organizes data to reduce repeated facts and inconsistencies." },
  { question: "What is a likely cost of adding an index?", options: ["More storage and additional work on writes", "It deletes duplicate rows automatically", "It removes the need for keys", "It always makes every query faster"], answer: 0, explanation: "Indexes take storage and must be maintained when data changes; they do not guarantee faster queries." },
  { question: "Which command shows a high-level query plan in SQLite?", options: ["SHOW QUERY", "EXPLAIN QUERY PLAN", "DESCRIBE PLAN", "TRACE TABLE"], answer: 1, explanation: "SQLite supports EXPLAIN QUERY PLAN before a SELECT to inspect its high-level execution plan." },
  { question: "Why should you avoid indexing every column without checking workload?", options: ["Indexes cannot be used in WHERE", "Indexes force all queries to fail", "Indexes may consume storage and slow INSERT, UPDATE and DELETE", "Indexes change all text into numbers"], answer: 2, explanation: "Each index has storage and maintenance costs, so choose indexes based on actual query patterns and measurements." }
];

const moduleTenQuiz = [
  { question: "What is a CTE?", options: ["A permanent table created by every SELECT", "A named temporary result used by one statement", "An automatic index", "A command to delete duplicates"], answer: 1, explanation: "A CTE is a named temporary result introduced with WITH and scoped to one SQL statement." },
  { question: "Which clause splits rows into separate windows for window-function calculations?", options: ["HAVING", "PARTITION BY", "LIMIT", "DISTINCT"], answer: 1, explanation: "PARTITION BY creates separate windows, such as one window per department." },
  { question: "How does a window function usually differ from GROUP BY?", options: ["It always removes NULL values", "It permanently changes the table", "It adds a calculation while keeping individual rows", "It cannot use ordering"], answer: 2, explanation: "Window functions normally retain the input rows, whereas GROUP BY combines rows into grouped output." },
  { question: "What is the recommended way to pass user values to SQL from application code?", options: ["Concatenate raw input into the SQL string", "Use parameterized queries", "Remove all WHERE clauses", "Always use SELECT *"], answer: 1, explanation: "Parameterized queries separate SQL structure from values and help protect against SQL injection." },
  { question: "What is the SQLWhale final assessment pass mark?", options: ["25/50", "30/50", "35/50", "40/50"], answer: 2, explanation: "The final assessment is worth 50 marks and requires at least 35 marks to pass." }
];




router.post("/modules/:id/quiz/submit", async (req: Request, res: Response) => {
  const user = await getCurrentUser(req);
  if (!user) return res.status(401).json({ success: false, error: "Sign in to save your quiz result." });
  const id = Number(req.params.id);
  const quiz = id === 1 ? moduleOneQuiz : id === 2 ? moduleTwoQuiz : id === 3 ? moduleThreeQuiz : id === 4 ? moduleFourQuiz : id === 5 ? moduleFiveQuiz : id === 6 ? moduleSixQuiz : id === 7 ? moduleSevenQuiz : id === 8 ? moduleEightQuiz : id === 9 ? moduleNineQuiz : id === 10 ? moduleTenQuiz : null;
  if (!quiz) return res.status(404).json({ success: false, error: "This module quiz is not available yet." });
  const answers = req.body?.answers;
  if (!answers || typeof answers !== "object" || Array.isArray(answers) || quiz.some((_q, index) => !Number.isInteger(answers[index]) || answers[index] < 0 || answers[index] > 3)) {
    return res.status(400).json({ success: false, error: "Answer all five quiz questions before submitting." });
  }
  const score = quiz.reduce((total, question, index) => total + (answers[index] === question.answer ? 1 : 0), 0);
  const passed = score >= 3;
  try {
    await LearningQuizAttempt.updateOne(
      { localUserId: user.localUserId, moduleId: id },
      { $set: { answers, score, passed, submittedAt: new Date() } },
      { upsert: true }
    );
    return res.json({
      success: true,
      moduleId: id,
      score,
      total: quiz.length,
      passed,
      passMark: 3,
      feedback: quiz.map((question, index) => ({
        question: question.question,
        correct: answers[index] === question.answer,
        correctAnswer: question.answer,
        explanation: question.explanation,
      })),
    });
  } catch (error) {
    console.error("Module quiz save failed:", error);
    return res.status(500).json({ success: false, error: "Unable to save quiz result." });
  }
});

router.post("/modules/:id/complete", async (req: Request, res: Response) => {
  const user = await getCurrentUser(req);
  if (!user) return res.status(401).json({ success: false, error: "Sign in to save module completion." });
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id < 1 || id > 10) return res.status(400).json({ success: false, error: "Invalid module." });
  try {
    const completedItems: any[] = await LearningProgress.find({ localUserId: user.localUserId }).lean().exec();
    const completed = new Set(completedItems.map((x) => x.sectionId));
    const module = modules[id - 1];
    if (completed.has(module.sectionId)) return res.json({ success: true, completedModules: [...completed].filter((s) => s.startsWith("module-")).map((s) => Number(s.split("-")[1])), progressPercent: Math.min(100, modules.filter((m) => completed.has(m.sectionId)).length * 10) });
    if (id > 1 && !completed.has(modules[id - 2].sectionId)) return res.status(409).json({ success: false, code: "MODULE_LOCKED", error: "Complete the previous module first to unlock this module." });
    if (id > 10) return res.status(409).json({ success: false, code: "MODULE_QUIZ_UNAVAILABLE", error: "This module quiz is not available yet." });
    const quizAttempt: any = await LearningQuizAttempt.findOne({ localUserId: user.localUserId, moduleId: id }).lean().exec();
    if (!quizAttempt?.passed) return res.status(409).json({ success: false, code: "QUIZ_NOT_PASSED", error: "Pass this module quiz with at least 3 out of 5 correct answers before marking the module complete." });
    await LearningProgress.updateOne({ localUserId: user.localUserId, sectionId: module.sectionId }, { $setOnInsert: { localUserId: user.localUserId, sectionId: module.sectionId, completedAt: new Date() } }, { upsert: true });
    const fresh = new Set((await LearningProgress.find({ localUserId: user.localUserId }).select("sectionId").lean().exec()).map((x: any) => x.sectionId));
    const count = modules.filter((m) => fresh.has(m.sectionId)).length;
    return res.json({ success: true, completedModules: modules.filter((m) => fresh.has(m.sectionId)).map((m) => m.id), completedCount: count, progressPercent: count * 10, unlockedThrough: Math.min(10, count + 1) });
  } catch (error) {
    console.error("Module completion save failed:", error);
    return res.status(500).json({ success: false, error: "Unable to save module completion." });
  }
});

router.get("/assessment", async (req: Request, res: Response) => {
  const user = await getCurrentUser(req);
  if (!user) return res.status(401).json({ success: false, error: "Sign in to take the final assessment." });
  try {
    const completed = new Set((await LearningProgress.find({ localUserId: user.localUserId }).select("sectionId").lean().exec()).map((item: any) => item.sectionId));
    if (!modules.every((module) => completed.has(module.sectionId))) return res.status(403).json({ success: false, code: "ASSESSMENT_LOCKED", error: "Complete all 10 modules before starting the final assessment." });
    const assessment: any = await LearningAssessment.findOne({ localUserId: user.localUserId }).lean().exec();
    if (assessment?.status === "passed") {
      return res.json({ success: true, alreadyPassed: true, attempt: { status: assessment.status, attempts: assessment.attempts, totalScore: assessment.totalScore, submittedAt: assessment.submittedAt } });
    }
    return res.json({
      success: true,
      paper: { mcqs: mcqs.map(safeQuestion), totalMarks: 50, passMarks: 35, durationSeconds: 3000 },
      attempt: assessment ? { status: assessment.status, attempts: assessment.attempts, answers: assessment.answers, totalScore: assessment.totalScore, startedAt: assessment.startedAt, durationSeconds: assessment.durationSeconds } : null,
    });
  } catch (error) {
    console.error("Assessment load failed:", error);
    return res.status(500).json({ success: false, error: "Unable to load the final assessment." });
  }
});

router.post("/assessment/start", async (req: Request, res: Response) => {
  const user = await getCurrentUser(req);
  if (!user) return res.status(401).json({ success: false, error: "Sign in to start the final assessment." });
  try {
    const completed = new Set((await LearningProgress.find({ localUserId: user.localUserId }).select("sectionId").lean().exec()).map((item: any) => item.sectionId));
    if (!modules.every((module) => completed.has(module.sectionId))) return res.status(403).json({ success: false, error: "Complete all 10 modules before starting the assessment." });
    const current: any = await LearningAssessment.findOne({ localUserId: user.localUserId }).lean().exec();
    if (current?.status === "passed") return res.status(409).json({ success: false, error: "You have already passed the final assessment." });
    if (current?.status === "in_progress" && current.startedAt && Date.now() < new Date(current.startedAt).getTime() + 3000000) {
      return res.json({ success: true, startedAt: current.startedAt, durationSeconds: 3000, answers: current.answers?.mcq || {} });
    }
    const startedAt = new Date();
    await LearningAssessment.findOneAndUpdate(
      { localUserId: user.localUserId },
      { $set: { status: "in_progress", startedAt, submittedAt: null, answers: { mcq: {} }, mcqScore: 0, longAnswerScore: 0, queryScore: 0, totalScore: 0, durationSeconds: 0 } },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    ).exec();
    return res.json({ success: true, startedAt, durationSeconds: 3000, answers: {} });
  } catch (error) {
    console.error("Assessment start failed:", error);
    return res.status(500).json({ success: false, error: "Unable to start the assessment." });
  }
});

router.post("/assessment/answer", async (req: Request, res: Response) => {
  const user = await getCurrentUser(req);
  if (!user) return res.status(401).json({ success: false, error: "Sign in to save your answer." });
  const questionId = String(req.body?.questionId || "");
  const answer = req.body?.answer;
  const question = mcqs.find((item) => item.id === questionId);
  if (!question || !Number.isInteger(answer) || answer < 0 || answer >= question.options.length) {
    return res.status(400).json({ success: false, error: "Invalid assessment answer." });
  }
  try {
    const now = Date.now();
    const saved = await LearningAssessment.updateOne(
      { localUserId: user.localUserId, status: "in_progress", startedAt: { $gt: new Date(now - 3000000) } },
      { $set: { [`answers.mcq.${questionId}`]: answer } }
    ).exec();
    if (!saved.matchedCount) return res.status(409).json({ success: false, code: "ASSESSMENT_EXPIRED", error: "The assessment timer has ended. Submit your saved answers or start a new attempt." });
    return res.json({ success: true, saved: true });
  } catch (error) {
    console.error("Assessment answer save failed:", error);
    return res.status(500).json({ success: false, error: "Unable to save this answer." });
  }
});

router.post("/assessment/submit", async (req: Request, res: Response) => {
  const user = await getCurrentUser(req);
  if (!user) return res.status(401).json({ success: false, error: "Sign in to submit the final assessment." });
  try {
    const completed = new Set((await LearningProgress.find({ localUserId: user.localUserId }).select("sectionId").lean().exec()).map((item: any) => item.sectionId));
    if (!modules.every((module) => completed.has(module.sectionId))) return res.status(403).json({ success: false, error: "Complete all 10 modules before submitting the assessment." });
    const current: any = await LearningAssessment.findOne({ localUserId: user.localUserId }).lean().exec();
    if (!current?.startedAt || current.status !== "in_progress") return res.status(409).json({ success: false, error: "Start the assessment before submitting your answers." });
    const elapsedSeconds = Math.max(0, Math.floor((Date.now() - new Date(current.startedAt).getTime()) / 1000));
    const expired = elapsedSeconds >= 3000;
    const supplied = req.body?.answers?.mcq;
    const sourceAnswers = expired ? (current.answers?.mcq || {}) : (supplied && typeof supplied === "object" ? supplied : (current.answers?.mcq || {}));
    const cleanAnswers: Record<string, number> = {};
    for (const question of mcqs) {
      const value = sourceAnswers[question.id];
      if (value !== undefined && value !== null && value !== "" && Number.isInteger(Number(value)) && Number(value) >= 0 && Number(value) < question.options.length) cleanAnswers[question.id] = Number(value);
    }
    const score = mcqs.reduce((total, question) => total + (cleanAnswers[question.id] === question.answer ? 1 : 0), 0);
    const status = score >= 35 ? "passed" : "failed";
    await LearningAssessment.findOneAndUpdate(
      { localUserId: user.localUserId, status: "in_progress" },
      { $set: { answers: { mcq: cleanAnswers }, mcqScore: score, longAnswerScore: 0, queryScore: 0, totalScore: score, status, submittedAt: new Date(), reviewedAt: new Date(), durationSeconds: Math.min(3000, elapsedSeconds) }, $inc: { attempts: 1 } },
      { new: true, upsert: false }
    ).exec();
    return res.json({
      success: true, status, totalScore: score, totalMarks: 50, passMarks: 35, elapsedSeconds, expired,
      message: expired ? "Time is over. Your saved answers were auto-submitted." : status === "passed" ? "Congratulations! You passed the SQLWhale final assessment." : "Assessment submitted. You need at least 35 out of 50 marks to pass.",
      breakdown: { mcqScore: score, longAnswerScore: 0, queryScore: 0 },
      attempt: { status, attempts: (current.attempts || 0) + 1, submittedAt: new Date() },
      review: mcqs.map((question) => ({ id: question.id, question: question.question, options: question.options, selectedAnswer: cleanAnswers[question.id] ?? null, correctAnswer: question.answer, correct: cleanAnswers[question.id] === question.answer, explanation: question.explanation })),
    });
  } catch (error) {
    console.error("Assessment submit failed:", error);
    return res.status(500).json({ success: false, error: "Unable to submit the final assessment." });
  }
});

export default router;
