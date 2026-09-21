import { Request, Response } from "express";

interface Lesson {
  id: number;
  title: string;
  slug: string;
  description: string;
  exampleQuery: string;
}

const lessons: Lesson[] = [
  {
    id: 1,
    title: "SELECT",
    slug: "select",
    description:
      "Learn how SELECT chooses columns from a table.",
    exampleQuery:
      "SELECT name FROM employees;",
  },

  {
    id: 2,
    title: "WHERE",
    slug: "where",
    description:
      "Learn how WHERE filters rows based on a condition.",
    exampleQuery:
      "SELECT * FROM employees WHERE department = 'IT';",
  },

  {
    id: 3,
    title: "ORDER BY",
    slug: "order-by",
    description:
      "Learn how ORDER BY changes the order of rows.",
    exampleQuery:
      "SELECT * FROM employees ORDER BY salary DESC;",
  },

  {
    id: 4,
    title: "LIMIT",
    slug: "limit",
    description:
      "Learn how LIMIT restricts the number of returned rows.",
    exampleQuery:
      "SELECT * FROM employees LIMIT 2;",
  },

  {
    id: 5,
    title: "INNER JOIN",
    slug: "inner-join",
    description:
      "Learn how INNER JOIN combines matching rows from tables.",
    exampleQuery: `
SELECT employees.name, projects.project
FROM employees
INNER JOIN projects
ON employees.employee_id = projects.employee_id;
    `.trim(),
  },

  {
    id: 6,
    title: "LEFT JOIN",
    slug: "left-join",
    description:
      "Learn how LEFT JOIN keeps all rows from the left table.",
    exampleQuery: `
SELECT employees.name, projects.project
FROM employees
LEFT JOIN projects
ON employees.employee_id = projects.employee_id;
    `.trim(),
  },

  {
    id: 7,
    title: "GROUP BY",
    slug: "group-by",
    description:
      "Learn how GROUP BY creates groups before aggregation.",
    exampleQuery:
      "SELECT department, COUNT(*) FROM employees GROUP BY department;",
  },

  {
    id: 8,
    title: "COUNT / SUM / AVG",
    slug: "aggregates",
    description:
      "Learn how aggregate functions calculate values from groups or rows.",
    exampleQuery:
      "SELECT department, COUNT(*) FROM employees GROUP BY department;",
  },
];

export function getLessonsController(
  _req: Request,
  res: Response
): void {
  res.status(200).json({
    success: true,
    lessons,
  });
}

export function getLessonController(
  req: Request,
  res: Response
): void {
  const id = Number(req.params.id);

  const lesson = lessons.find(
    (item) => item.id === id
  );

  if (!lesson) {
    res.status(404).json({
      success: false,
      error: "Lesson not found.",
    });

    return;
  }

  res.status(200).json({
    success: true,
    lesson,
  });
}