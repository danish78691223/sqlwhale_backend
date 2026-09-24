import db from "../config/database";

type LegacyEmployee = {
  employee_id: number;
  name: string;
  department: string;
  salary: number | null;
};

type LegacyProject = {
  project_id: number;
  employee_id: number | null;
  project: string;
};

function tableExists(name: string): boolean {
  const row = db
    .prepare(
      `SELECT name
       FROM sqlite_master
       WHERE type = 'table'
       AND name = ?`
    )
    .get(name);

  return Boolean(row);
}

function hasColumn(tableName: string, columnName: string): boolean {
  const columns = db
    .prepare(`PRAGMA table_info("${tableName}")`)
    .all() as Array<{ name: string }>;

  return columns.some((column) => column.name === columnName);
}

function createLearningSchema(): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS departments (
      department_id INTEGER PRIMARY KEY,
      department_name TEXT NOT NULL,
      location TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS employees (
      employee_id INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      department_id INTEGER NOT NULL,
      FOREIGN KEY (department_id)
        REFERENCES departments(department_id)
    );

    CREATE TABLE IF NOT EXISTS projects (
      project_id INTEGER PRIMARY KEY,
      employee_id INTEGER NOT NULL,
      project_name TEXT NOT NULL,
      FOREIGN KEY (employee_id)
        REFERENCES employees(employee_id)
    );

    CREATE TABLE IF NOT EXISTS salary (
      salary_id INTEGER PRIMARY KEY,
      employee_id INTEGER NOT NULL,
      amount INTEGER NOT NULL,
      effective_date TEXT NOT NULL,
      FOREIGN KEY (employee_id)
        REFERENCES employees(employee_id)
    );
  `);
}

function seedFreshData(): void {
  const insertDepartment = db.prepare(`
    INSERT INTO departments
      (department_id, department_name, location)
    VALUES (?, ?, ?)
  `);

  const insertEmployee = db.prepare(`
    INSERT INTO employees
      (employee_id, name, department_id)
    VALUES (?, ?, ?)
  `);

  const insertProject = db.prepare(`
    INSERT INTO projects
      (project_id, employee_id, project_name)
    VALUES (?, ?, ?)
  `);

  const insertSalary = db.prepare(`
    INSERT INTO salary
      (salary_id, employee_id, amount, effective_date)
    VALUES (?, ?, ?, ?)
  `);

  const transaction = db.transaction(() => {
    insertDepartment.run(1, "IT", "Pune");
    insertDepartment.run(2, "HR", "Mumbai");
    insertDepartment.run(3, "Finance", "Bengaluru");

    insertEmployee.run(1, "Aisha", 1);
    insertEmployee.run(2, "Rahul", 2);
    insertEmployee.run(3, "Kabir", 1);
    insertEmployee.run(4, "Sara", 3);

    insertProject.run(1, 1, "Website");
    insertProject.run(2, 3, "API");
    insertProject.run(3, 3, "Dashboard");
    insertProject.run(4, 4, "Billing");

    insertSalary.run(1, 1, 50000, "2026-01-01");
    insertSalary.run(2, 2, 45000, "2026-01-01");
    insertSalary.run(3, 3, 55000, "2026-01-01");
    insertSalary.run(4, 4, 60000, "2026-01-01");
  });

  transaction();
}

export function seedDatabase(): void {
  const employeesExist = tableExists("employees");

  if (employeesExist && !hasColumn("employees", "department_id")) {
    const legacyEmployees = db
      .prepare(`SELECT employee_id, name, department, salary FROM employees`)
      .all() as LegacyEmployee[];

    const legacyProjects = tableExists("projects")
      ? (db
          .prepare(`SELECT project_id, employee_id, project FROM projects`)
          .all() as LegacyProject[])
      : [];

    db.transaction(() => {
      db.exec(`
        DROP TABLE IF EXISTS salary;
        DROP TABLE IF EXISTS projects;
        DROP TABLE IF EXISTS employees;
        DROP TABLE IF EXISTS departments;
      `);

      createLearningSchema();

      const departments = new Map<string, number>();
      const insertDepartment = db.prepare(`
        INSERT INTO departments
          (department_id, department_name, location)
        VALUES (?, ?, ?)
      `);

      const insertEmployee = db.prepare(`
        INSERT INTO employees
          (employee_id, name, department_id)
        VALUES (?, ?, ?)
      `);

      const insertSalary = db.prepare(`
        INSERT INTO salary
          (salary_id, employee_id, amount, effective_date)
        VALUES (?, ?, ?, ?)
      `);

      const insertProject = db.prepare(`
        INSERT INTO projects
          (project_id, employee_id, project_name)
        VALUES (?, ?, ?)
      `);

      let nextDepartmentId = 1;

      for (const employee of legacyEmployees) {
        if (!departments.has(employee.department)) {
          const departmentId = nextDepartmentId++;
          departments.set(employee.department, departmentId);
          insertDepartment.run(
            departmentId,
            employee.department,
            "India"
          );
        }
      }

      for (const employee of legacyEmployees) {
        const departmentId = departments.get(employee.department);

        if (!departmentId) {
          continue;
        }

        insertEmployee.run(
          employee.employee_id,
          employee.name,
          departmentId
        );

        if (employee.salary !== null) {
          insertSalary.run(
            employee.employee_id,
            employee.employee_id,
            employee.salary,
            "2026-01-01"
          );
        }
      }

      for (const project of legacyProjects) {
        if (project.employee_id === null) {
          continue;
        }

        insertProject.run(
          project.project_id,
          project.employee_id,
          project.project
        );
      }
    })();

    return;
  }

  if (!employeesExist) {
    createLearningSchema();
    seedFreshData();
  }
}
