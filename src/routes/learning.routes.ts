import { Router, type Request, type Response } from "express";
import { getCurrentUser } from "../services/mongoAuth";
import LearningProgress from "../models/LearningProgress";
import LearningAssessment from "../models/LearningAssessment";
import LearningQuizAttempt from "../models/LearningQuizAttempt";

const router = Router();
const modules = Array.from({ length: 10 }, (_, index) => ({ id: index + 1, sectionId: `module-${index + 1}` }));
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
const safeQuestion = ({ answer, ...question }: Mcq) => question;

router.get("/progress", async (req: Request, res: Response) => {
  const user = await getCurrentUser(req);
  if (!user) return res.status(401).json({ success: false, error: "Sign in to save your learning progress." });
  try {
    const items: any[] = await LearningProgress.find({ localUserId: user.localUserId }).lean().exec();
    const completed = new Set(items.map(item => item.sectionId));
    const assessment: any = await LearningAssessment.findOne({ localUserId: user.localUserId }).lean().exec();
    const count = modules.filter(module => completed.has(module.sectionId)).length;
    return res.json({ success: true, completedModules: modules.filter(module => completed.has(module.sectionId)).map(module => module.id), completedCount: count, progressPercent: count * 10, unlockedThrough: Math.min(10, count + 1), assessment: assessment ? { status: assessment.status, attempts: assessment.attempts, totalScore: assessment.totalScore, submittedAt: assessment.submittedAt, startedAt: assessment.startedAt, durationSeconds: assessment.durationSeconds } : null });
  } catch (error) {
    console.error("Learning progress lookup failed:", error);
    return res.status(500).json({ success: false, error: "Unable to load learning progress." });
  }
});

router.post("/modules/:id/quiz/submit", async (req: Request, res: Response) => {
  const user = await getCurrentUser(req);
  if (!user) return res.status(401).json({ success: false, error: "Sign in to save your quiz result." });
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id < 1 || id > 10) return res.status(404).json({ success: false, error: "This module quiz is not available." });
  const answers = req.body?.answers;
  if (!answers || typeof answers !== "object" || Array.isArray(answers)) return res.status(400).json({ success: false, error: "Invalid quiz answers." });
  try {
    const saved: any = await LearningQuizAttempt.findOne({ localUserId: user.localUserId, moduleId: id }).lean().exec();
    if (!saved?.passed) return res.status(400).json({ success: false, error: "Submit the module quiz from its lesson page first." });
    return res.json({ success: true, moduleId: id, score: saved.score, total: 5, passed: saved.passed, passMark: 3 });
  } catch {
    return res.status(500).json({ success: false, error: "Unable to verify module quiz." });
  }
});

router.post("/modules/:id/complete", async (req: Request, res: Response) => {
  const user = await getCurrentUser(req);
  if (!user) return res.status(401).json({ success: false, error: "Sign in to save module completion." });
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id < 1 || id > 10) return res.status(400).json({ success: false, error: "Invalid module." });
  try {
    const items: any[] = await LearningProgress.find({ localUserId: user.localUserId }).lean().exec();
    const completed = new Set(items.map(item => item.sectionId));
    const module = modules[id - 1];
    if (completed.has(module.sectionId)) {
      const count = modules.filter(item => completed.has(item.sectionId)).length;
      return res.json({ success: true, completedModules: modules.filter(item => completed.has(item.sectionId)).map(item => item.id), completedCount: count, progressPercent: count * 10, unlockedThrough: Math.min(10, count + 1) });
    }
    if (id > 1 && !completed.has(modules[id - 2].sectionId)) return res.status(409).json({ success: false, code: "MODULE_LOCKED", error: "Complete the previous module first to unlock this module." });
    const quiz: any = await LearningQuizAttempt.findOne({ localUserId: user.localUserId, moduleId: id }).lean().exec();
    if (!quiz?.passed) return res.status(409).json({ success: false, code: "QUIZ_NOT_PASSED", error: "Pass this module quiz with at least 3 out of 5 correct answers before marking the module complete." });
    await LearningProgress.updateOne({ localUserId: user.localUserId, sectionId: module.sectionId }, { $setOnInsert: { localUserId: user.localUserId, sectionId: module.sectionId, completedAt: new Date() } }, { upsert: true });
    const fresh = new Set((await LearningProgress.find({ localUserId: user.localUserId }).select("sectionId").lean().exec()).map((item: any) => item.sectionId));
    const count = modules.filter(item => fresh.has(item.sectionId)).length;
    return res.json({ success: true, completedModules: modules.filter(item => fresh.has(item.sectionId)).map(item => item.id), completedCount: count, progressPercent: count * 10, unlockedThrough: Math.min(10, count + 1) });
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
    if (!modules.every(module => completed.has(module.sectionId))) return res.status(403).json({ success: false, code: "ASSESSMENT_LOCKED", error: "Complete all 10 modules before starting the final assessment." });
    const assessment: any = await LearningAssessment.findOne({ localUserId: user.localUserId }).lean().exec();
    if (assessment?.status === "passed") return res.json({ success: true, alreadyPassed: true, attempt: { status: assessment.status, attempts: assessment.attempts, totalScore: assessment.totalScore, submittedAt: assessment.submittedAt } });
    return res.json({ success: true, paper: { mcqs: mcqs.map(safeQuestion), totalMarks: 50, passMarks: 35, durationSeconds: 3000 }, attempt: assessment ? { status: assessment.status, attempts: assessment.attempts, answers: assessment.answers, totalScore: assessment.totalScore, startedAt: assessment.startedAt } : null });
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
    if (!modules.every(module => completed.has(module.sectionId))) return res.status(403).json({ success: false, error: "Complete all 10 modules before starting the assessment." });
    const current: any = await LearningAssessment.findOne({ localUserId: user.localUserId }).lean().exec();
    if (current?.status === "passed") return res.status(409).json({ success: false, error: "You have already passed the final assessment." });
    if (current?.status === "in_progress" && current.startedAt && Date.now() < new Date(current.startedAt).getTime() + 3000000) {
      return res.json({ success: true, startedAt: current.startedAt, durationSeconds: 3000, answers: current.answers?.mcq || {} });
    }
    const startedAt = new Date();
    await LearningAssessment.findOneAndUpdate({ localUserId: user.localUserId }, { $set: { status: "in_progress", startedAt, submittedAt: null, answers: { mcq: {} }, mcqScore: 0, longAnswerScore: 0, queryScore: 0, totalScore: 0, durationSeconds: 0 } }, { upsert: true, new: true, setDefaultsOnInsert: true }).exec();
    return res.json({ success: true, startedAt, durationSeconds: 3000, answers: {} });
  } catch (error) {
    console.error("Assessment start failed:", error);
    return res.status(500).json({ success: false, error: "Unable to start the assessment." });
  }
});

router.post("/assessment/submit", async (req: Request, res: Response) => {
  const user = await getCurrentUser(req);
  if (!user) return res.status(401).json({ success: false, error: "Sign in to submit the final assessment." });
  try {
    const completed = new Set((await LearningProgress.find({ localUserId: user.localUserId }).select("sectionId").lean().exec()).map((item: any) => item.sectionId));
    if (!modules.every(module => completed.has(module.sectionId))) return res.status(403).json({ success: false, error: "Complete all 10 modules before submitting the assessment." });
    const current: any = await LearningAssessment.findOne({ localUserId: user.localUserId }).lean().exec();
    if (!current?.startedAt || current.status !== "in_progress") return res.status(409).json({ success: false, error: "Start the assessment before submitting your answers." });
    const startedAt = new Date(current.startedAt).getTime();
    const elapsedSeconds = Math.max(0, Math.floor((Date.now() - startedAt) / 1000));
    const expired = elapsedSeconds >= 3000;
    const submittedMcq = req.body?.answers?.mcq && typeof req.body.answers.mcq === "object" ? req.body.answers.mcq : {};
    const cleanAnswers: Record<string, number> = {};
    for (const q of mcqs) {
      const value = submittedMcq[q.id];
      if (value !== undefined && value !== null && value !== "" && Number.isInteger(Number(value)) && Number(value) >= 0 && Number(value) < q.options.length) cleanAnswers[q.id] = Number(value);
    }
    const score = mcqs.reduce((total, q) => total + (cleanAnswers[q.id] === q.answer ? 1 : 0), 0);
    const finalScore = expired ? score : score;
    const status = finalScore >= 35 ? "passed" : "failed";
    await LearningAssessment.findOneAndUpdate({ localUserId: user.localUserId }, { $set: { answers: { mcq: cleanAnswers }, mcqScore: finalScore, longAnswerScore: 0, queryScore: 0, totalScore: finalScore, status, submittedAt: new Date(), reviewedAt: new Date(), durationSeconds: Math.min(3000, elapsedSeconds) }, $inc: { attempts: 1 } }, { new: true, upsert: true, setDefaultsOnInsert: true }).exec();
    return res.json({ success: true, status, totalScore: finalScore, totalMarks: 50, passMarks: 35, elapsedSeconds, expired, message: expired ? "Time is over. Your selected answers were auto-submitted." : status === "passed" ? "Congratulations! You passed the SQLWhale final assessment." : "Assessment submitted. You need at least 35 out of 50 marks to pass.", breakdown: { mcqScore: finalScore }, attempt: { status, attempts: (current.attempts || 0) + 1, submittedAt: new Date() }, review: mcqs.map(q => ({ id: q.id, question: q.question, selectedAnswer: cleanAnswers[q.id] ?? null, correctAnswer: q.answer, correct: cleanAnswers[q.id] === q.answer, explanation: q.explanation })) });
  } catch (error) {
    console.error("Assessment submit failed:", error);
    return res.status(500).json({ success: false, error: "Unable to submit the final assessment." });
  }
});

export default router;
