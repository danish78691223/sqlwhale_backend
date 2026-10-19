import { Router, type Request, type Response } from "express";
import { getCurrentUser } from "../services/mongoAuth";
import LearningProgress from "../models/LearningProgress";
import LearningAssessment from "../models/LearningAssessment";
import LearningQuizAttempt from "../models/LearningQuizAttempt";
import db from "../config/database";

const router = Router();

const modules = [
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

const mcqs = [
  { id: "m1", question: "Which SQL clause chooses the columns returned?", options: ["WHERE", "SELECT", "ORDER BY", "GROUP BY"], answer: 1 },
  { id: "m2", question: "Which condition correctly checks for a missing value?", options: ["value = NULL", "value == NULL", "value IS NULL", "value EQUALS NULL"], answer: 2 },
  { id: "m3", question: "Which clause filters rows before grouping?", options: ["HAVING", "ORDER BY", "WHERE", "SELECT"], answer: 2 },
  { id: "m4", question: "Which aggregate counts rows?", options: ["TOTAL()", "COUNT(*)", "ROWS()", "NUMBER()"], answer: 1 },
  { id: "m5", question: "Which clause sorts the result?", options: ["ORDER BY", "SORT", "GROUP BY", "ARRANGE"], answer: 0 },
  { id: "m6", question: "Which JOIN returns matching rows from both tables?", options: ["LEFT JOIN", "CROSS JOIN", "INNER JOIN", "FULL JOIN"], answer: 2 },
  { id: "m7", question: "Which clause filters aggregate groups?", options: ["WHERE", "HAVING", "LIMIT", "ON"], answer: 1 },
  { id: "m8", question: "What does a primary key guarantee?", options: ["Rows are sorted", "A row is uniquely identifiable", "All values are text", "Duplicates are preferred"], answer: 1 },
  { id: "m9", question: "Which command adds a row?", options: ["APPEND", "ALTER", "INSERT", "CREATE ROW"], answer: 2 },
  { id: "m10", question: "Which keyword begins a Common Table Expression?", options: ["LET", "WITH", "TEMP", "DEFINE"], answer: 1 },
] as const;

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
      assessment: assessment ? { status: assessment.status, attempts: assessment.attempts, totalScore: assessment.totalScore, mcqScore: assessment.mcqScore, longAnswerScore: assessment.longAnswerScore, queryScore: assessment.queryScore, submittedAt: assessment.submittedAt, reviewedAt: assessment.reviewedAt } : null,
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

router.post("/modules/:id/quiz/submit", async (req: Request, res: Response) => {
  const user = await getCurrentUser(req);
  if (!user) return res.status(401).json({ success: false, error: "Sign in to save your quiz result." });
  const id = Number(req.params.id);
  const quiz = id === 1 ? moduleOneQuiz : id === 2 ? moduleTwoQuiz : null;
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
    if (id === 1) {
      const quizAttempt: any = await LearningQuizAttempt.findOne({ localUserId: user.localUserId, moduleId: id }).lean().exec();
      if (!quizAttempt?.passed) return res.status(409).json({ success: false, code: "QUIZ_NOT_PASSED", error: "Pass this module quiz with at least 3 out of 5 correct answers before marking the module complete." });
    } else {
      return res.status(409).json({ success: false, code: "MODULE_QUIZ_UNAVAILABLE", error: "This module is not available yet." });
    }
    if (id > 1 && !completed.has(modules[id - 2].sectionId)) return res.status(409).json({ success: false, code: "MODULE_LOCKED", error: "Complete the previous module first to unlock this module." });
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
    const completed = new Set((await LearningProgress.find({ localUserId: user.localUserId }).select("sectionId").lean().exec()).map((x: any) => x.sectionId));
    if (!modules.every((m) => completed.has(m.sectionId))) return res.status(403).json({ success: false, code: "ASSESSMENT_LOCKED", error: "Complete all 10 modules before starting the final assessment." });
    const assessment: any = await LearningAssessment.findOne({ localUserId: user.localUserId }).lean().exec();
    return res.json({
      success: true,
      paper: { mcqs: mcqs.map(({ answer, ...q }) => q), longQuestions, queryQuestions: queryQuestions.map(({ expected, ...q }) => q), totalMarks: 50, passMarks: 40, scoring: { mcq: 10, longAnswers: 20, queries: 20 } },
      attempt: assessment ? { status: assessment.status, attempts: assessment.attempts, answers: assessment.answers, totalScore: assessment.totalScore, mcqScore: assessment.mcqScore, longAnswerScore: assessment.longAnswerScore, queryScore: assessment.queryScore } : null,
    });
  } catch (error) {
    console.error("Assessment load failed:", error);
    return res.status(500).json({ success: false, error: "Unable to load the final assessment." });
  }
});

router.post("/assessment/submit", async (req: Request, res: Response) => {
  const user = await getCurrentUser(req);
  if (!user) return res.status(401).json({ success: false, error: "Sign in to submit the final assessment." });
  try {
    const completed = new Set((await LearningProgress.find({ localUserId: user.localUserId }).select("sectionId").lean().exec()).map((x: any) => x.sectionId));
    if (!modules.every((m) => completed.has(m.sectionId))) {
      return res.status(403).json({ success: false, error: "Complete all 10 modules before submitting the assessment." });
    }

    const current: any = await LearningAssessment.findOne({ localUserId: user.localUserId }).lean().exec();
    if (current?.status === "passed") {
      return res.status(409).json({ success: false, error: "You have already passed the final assessment." });
    }

    const submitted = req.body?.answers || {};
    const submittedMcq = submitted.mcq || {};
    const submittedLong = submitted.longAnswers || {};
    const submittedQueries = submitted.queries || {};
    const mcqScore = mcqs.reduce((score, q) => { const value = submittedMcq[q.id]; return score + (value !== undefined && value !== null && value !== "" && Number(value) === q.answer ? 1 : 0); }, 0);
    const longResults = longQuestions.map((q) => {
      const answer = String(submittedLong[q.id] || "").slice(0, 10000);
      const graded = gradeLongAnswer(q.id, answer);
      return { id: q.id, score: graded.score, maxScore: 5, feedback: graded.feedback };
    });
    const queryResults = queryQuestions.map((q) => {
      const answer = String(submittedQueries[q.id] || "").slice(0, 4000);
      const graded = gradeSqlQuery(q.id, answer, q.expected);
      return { id: q.id, score: graded.correct ? 5 : 0, maxScore: 5, correct: graded.correct, feedback: graded.feedback };
    });
    const longAnswerScore = longResults.reduce((total, item) => total + item.score, 0);
    const queryScore = queryResults.reduce((total, item) => total + item.score, 0);
    const totalScore = mcqScore + longAnswerScore + queryScore;
    const status = totalScore >= 40 ? "passed" : "failed";
    const cleanAnswers = {
      mcq: mcqs.reduce((answers: Record<string, number>, q) => {
        const value = submittedMcq[q.id];
        if (value !== undefined && value !== null && value !== "" && Number.isInteger(Number(value)) && Number(value) >= 0 && Number(value) < q.options.length) {
          answers[q.id] = Number(value);
        }
        return answers;
      }, {}),
      longAnswers: longQuestions.reduce((answers: Record<string, string>, q) => {
        answers[q.id] = String(submittedLong[q.id] || "").slice(0, 10000);
        return answers;
      }, {}),
      queries: queryQuestions.reduce((answers: Record<string, string>, q) => {
        answers[q.id] = String(submittedQueries[q.id] || "").slice(0, 4000);
        return answers;
      }, {}),
    };
    const attempt: any = await LearningAssessment.findOneAndUpdate(
      { localUserId: user.localUserId },
      {
        $set: {
          answers: cleanAnswers, mcqScore, longAnswerScore, queryScore, totalScore,
          status, submittedAt: new Date(), reviewedAt: new Date(),
        },
        $inc: { attempts: 1 },
      },
      { new: true, upsert: true, setDefaultsOnInsert: true },
    ).lean().exec();

    return res.json({
      success: true,
      message: status === "passed"
        ? "Congratulations! You passed the SQLWhale final assessment."
        : "Assessment submitted. Review the feedback and try again; you need at least 40 out of 50 marks to pass.",
      status,
      totalScore,
      passMarks: 40,
      breakdown: { mcqScore, longAnswerScore, queryScore },
      longResults,
      queryResults,
      attempt: { status: attempt.status, attempts: attempt.attempts, submittedAt: attempt.submittedAt },
    });
  } catch (error) {
    console.error("Assessment submit failed:", error);
    return res.status(500).json({ success: false, error: "Unable to submit the final assessment." });
  }
});

export default router;
