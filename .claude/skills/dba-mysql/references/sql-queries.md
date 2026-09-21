# SQL Queries Reference

## COUNT

`COUNT(*)` — all rows, including NULLs
`COUNT(column)` — rows where `column` IS NOT NULL
`COUNT(DISTINCT column)` — unique non-NULL values

```sql
-- Total row count
SELECT COUNT(*) FROM FilmLocations;

-- Filter before counting
SELECT COUNT(Locations)
FROM FilmLocations
WHERE Writer = 'James Cameron';

-- Unique years for a studio
SELECT COUNT(DISTINCT ReleaseYear)
FROM FilmLocations
WHERE ProductionCompany = 'Warner Bros. Pictures';
```

---

## DISTINCT

Removes duplicate values from the result set.

```sql
-- Unique titles
SELECT DISTINCT Title FROM FilmLocations;

-- Unique combinations across multiple columns
SELECT DISTINCT Director, Title
FROM FilmLocations
WHERE Locations = 'City Hall';
```

---

## LIMIT / OFFSET

```sql
-- First 25 rows
SELECT * FROM FilmLocations LIMIT 25;

-- 15 rows starting at row 11 (OFFSET 10 = skip 10)
SELECT * FROM FilmLocations LIMIT 15 OFFSET 10;

-- Pagination pattern
SELECT * FROM table
ORDER BY id
LIMIT :page_size OFFSET :page_size * (:page - 1);
```

**Note**: always combine LIMIT with ORDER BY in production — without ORDER BY, row order is non-deterministic.

---

## Multi-table JOINs

### Implicit Join (WHERE clause)

```sql
-- Basic
SELECT *
FROM EMPLOYEES, JOBS
WHERE EMPLOYEES.JOB_ID = JOBS.JOB_IDENT;

-- With aliases (recommended form)
SELECT E.EMP_ID, E.F_NAME, E.L_NAME, J.JOB_TITLE
FROM EMPLOYEES E, JOBS J
WHERE E.JOB_ID = J.JOB_IDENT;
```

### Explicit JOIN (preferred in production)

```sql
-- INNER JOIN
SELECT E.EMP_ID, E.F_NAME, J.JOB_TITLE
FROM EMPLOYEES E
INNER JOIN JOBS J ON E.JOB_ID = J.JOB_IDENT;

-- LEFT JOIN (keeps all EMPLOYEES rows even without a match)
SELECT E.EMP_ID, E.F_NAME, J.JOB_TITLE
FROM EMPLOYEES E
LEFT JOIN JOBS J ON E.JOB_ID = J.JOB_IDENT;
```

**Why prefer explicit JOIN?**
- More readable for complex JOINs (3+ tables)
- Fewer mistakes: forgetting a WHERE condition in an implicit join produces a cartesian product
- ANSI SQL standard since SQL-92

---

## Sub-queries

```sql
-- Sub-query in WHERE (IN)
SELECT * FROM EMPLOYEES
WHERE JOB_ID IN (SELECT JOB_IDENT FROM JOBS);

-- Sub-query with condition
SELECT JOB_TITLE, MIN_SALARY, MAX_SALARY
FROM JOBS
WHERE JOB_IDENT IN (
    SELECT JOB_ID FROM EMPLOYEES WHERE SALARY > 70000
);
```

### Sub-query vs JOIN — when to use which?

| Situation | Choice |
|-----------|--------|
| Check existence (`IN`, `EXISTS`) | Sub-query is readable |
| Fetch columns from the other table | JOIN required |
| Performance on large tables | JOIN generally faster |
| Complex reusable logic | CTE (`WITH`) |

---

## CTEs (Common Table Expressions) — advanced

```sql
-- Simple CTE (MySQL 8.0+)
WITH high_earners AS (
    SELECT EMP_ID, F_NAME, SALARY
    FROM EMPLOYEES
    WHERE SALARY > 70000
)
SELECT h.F_NAME, j.JOB_TITLE
FROM high_earners h
JOIN JOBS j ON h.JOB_ID = j.JOB_IDENT;
```

CTEs are a better alternative to nested sub-queries: more readable, each step can be debugged independently.

---

## Practical examples — HR database

```sql
-- Employees in department 5
SELECT EMP_ID, F_NAME, L_NAME
FROM EMPLOYEES
WHERE DEP_ID = 5;

-- Employees with their department (3 tables)
SELECT E.F_NAME, E.L_NAME, D.DEP_NAME, L.DEP_ID_LOC
FROM EMPLOYEES E
JOIN DEPARTMENTS D ON E.DEP_ID = D.DEPT_ID_DEP
JOIN LOCATIONS L ON D.LOC_ID = L.LOCT_ID;

-- Employees without a matching job (LEFT JOIN + IS NULL)
SELECT E.EMP_ID, E.F_NAME
FROM EMPLOYEES E
LEFT JOIN JOBS J ON E.JOB_ID = J.JOB_IDENT
WHERE J.JOB_IDENT IS NULL;
```
