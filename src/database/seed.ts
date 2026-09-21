import db from "../config/database";

export function seedDatabase(): void {
  const employeesExists = db
    .prepare(`
      SELECT name
      FROM sqlite_master
      WHERE type = 'table'
      AND name = 'employees'
    `)
    .get();

  if (!employeesExists) {
    db.exec(`
      CREATE TABLE employees (
        employee_id INTEGER PRIMARY KEY,
        name TEXT NOT NULL,
        department TEXT NOT NULL,
        salary INTEGER
      );
    `);

    const insertEmployee = db.prepare(`
      INSERT INTO employees
      (employee_id, name, department, salary)
      VALUES (?, ?, ?, ?)
    `);

    const employees = [
      [1, "Aisha", "IT", 50000],
      [2, "Rahul", "HR", 45000],
      [3, "Kabir", "IT", 55000],
      [4, "Sara", "Finance", 60000],
    ];

    const transaction = db.transaction(() => {
      for (const employee of employees) {
        insertEmployee.run(...employee);
      }
    });

    transaction();
  }

  const projectsExists = db
    .prepare(`
      SELECT name
      FROM sqlite_master
      WHERE type = 'table'
      AND name = 'projects'
    `)
    .get();

  if (!projectsExists) {
    db.exec(`
      CREATE TABLE projects (
        project_id INTEGER PRIMARY KEY,
        employee_id INTEGER,
        project TEXT NOT NULL
      );
    `);

    const insertProject = db.prepare(`
      INSERT INTO projects
      (project_id, employee_id, project)
      VALUES (?, ?, ?)
    `);

    const projects = [
      [1, 1, "Website"],
      [2, 3, "API"],
      [3, 3, "Dashboard"],
    ];

    const transaction = db.transaction(() => {
      for (const project of projects) {
        insertProject.run(...project);
      }
    });

    transaction();
  }
}