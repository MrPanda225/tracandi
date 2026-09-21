# Query Optimization Reference

## What is a Query Execution Plan?

The execution plan describes the sequence of operations MySQL performs to answer a query.
The **query optimizer** automatically picks the most efficient plan among all possible ones.
It can be wrong — which is why EXPLAIN and optimizer hints exist.

---

## EXPLAIN — Reading the execution plan

### Available syntaxes

```sql
-- Tabular format (default)
EXPLAIN SELECT * FROM film WHERE rating = 'PG';

-- JSON format — more detail (MySQL 5.6+)
EXPLAIN FORMAT=JSON SELECT ...;

-- Actual execution with real stats (MySQL 8.0.18+) — most precise
EXPLAIN ANALYZE SELECT ...;
```

### Key columns and warning signals

| Column | What it tells you | Warning signal |
|--------|------------------|----------------|
| `type` | Table access method | `ALL` = full scan → missing index |
| `key` | Index used | `NULL` = no index |
| `rows` | Estimated rows read | Very high vs actual result |
| `filtered` | % of rows kept after filter | Low (<10%) = inefficient filter |
| `Extra` | Additional info | `Using filesort`, `Using temporary` |

### `type` values from worst to best

```
ALL → index → range → ref → eq_ref → const → system
(bad)                                          (optimal)
```

- `ALL`: full table scan — add an index
- `range`: index range scan — acceptable
- `ref`: non-unique index lookup — good
- `const`: primary key lookup — optimal

### `Extra` values that need action

| Extra | Problem | Fix |
|-------|---------|-----|
| `Using filesort` | In-memory/disk sort outside index | Index on ORDER BY column |
| `Using temporary` | Temporary table created | Review GROUP BY / ORDER BY |
| `Using where` | Post-scan filter | Index on WHERE column |
| `Using index` | ✅ Covering index — no table access | Ideal, nothing to do |

---

## Indexing strategy

### Basic rule — index columns used in:

1. `WHERE col = value` (equality)
2. `WHERE col > value` (range)
3. `JOIN ... ON col`
4. `ORDER BY col`
5. `GROUP BY col`

### Composite indexes — column order matters

```sql
-- For this query:
SELECT * FROM payment
WHERE customer_id = 1 AND amount > 5
ORDER BY payment_date;

-- Optimal index (equality first, range next, ORDER BY last)
CREATE INDEX idx_pay ON payment(customer_id, amount, payment_date);
```

**Prefix rule**: a composite index `(A, B, C)` also serves `(A)` and `(A, B)` — but NOT `(B)` alone.

### When NOT to index

- Low-cardinality columns (e.g. a `gender` column with 2 values) — optimizer often ignores the index
- Very small tables (<1000 rows) — full scan is often faster
- Columns rarely used in filters
- Frequently updated columns (every UPDATE must maintain the index)

### Check existing indexes

```sql
SHOW INDEX FROM table_name;

-- Unused indexes (Performance Schema — MySQL 5.6+)
SELECT object_name, index_name
FROM performance_schema.table_io_waits_summary_by_index_usage
WHERE index_name IS NOT NULL
AND count_star = 0
AND object_schema = 'your_database';
```

---

## Optimizer Hints (MySQL 8.0+)

Used when the optimizer makes the wrong choice — use sparingly.

```sql
-- Force index usage
SELECT /*+ INDEX(film idx_rating) */ *
FROM film
WHERE rating = 'PG';

-- Force join type
SELECT /*+ BNL(e, j) */ *
FROM EMPLOYEES e, JOBS j
WHERE e.JOB_ID = j.JOB_IDENT;

-- Ignore an index
SELECT /*+ NO_INDEX(film idx_rating) */ *
FROM film WHERE rating = 'PG';
```

**Before using a hint:**
1. Confirm with EXPLAIN ANALYZE that the optimizer is making the wrong choice
2. Document why the hint is necessary
3. Re-test after every MySQL upgrade (behavior can change)

---

## Visual tools

| RDBMS | Tool | Feature |
|-------|------|---------|
| MySQL | MySQL Workbench | Visual Explain Plan (graph + JSON) |
| PostgreSQL | PgAdmin | Graphical explain plan |
| IBM Db2 | Visual Explain | SQL/XQuery access plan graph |

### Using MySQL Workbench Visual EXPLAIN

1. Open MySQL Workbench → SQL Editor
2. Write the query
3. Click "Explain" (magnifying glass icon)
4. "Visual Explain" tab → color-coded nodes by cost

Node color coding:
- 🔵 Blue: low cost
- 🟡 Yellow: moderate cost
- 🔴 Red: high cost → needs optimization

---

## Common patterns and fixes

### 1. Slow query on large table — diagnosis workflow

```sql
-- Step 1: identify slow queries
SHOW VARIABLES LIKE 'slow_query_log';
SET GLOBAL slow_query_log = 'ON';
SET GLOBAL long_query_time = 1; -- log if > 1 second

-- Step 2: EXPLAIN on the suspect query
EXPLAIN SELECT * FROM rental WHERE rental_date > '2005-01-01';

-- Step 3: add the missing index
ALTER TABLE rental ADD INDEX idx_rental_date (rental_date);

-- Step 4: verify the improvement
EXPLAIN ANALYZE SELECT * FROM rental WHERE rental_date > '2005-01-01';
```

### 2. N+1 queries — frequent anti-pattern

```sql
-- BAD: 1 query for the list + N queries for details
SELECT film_id FROM film;
-- Then for each film_id:
SELECT * FROM film_actor WHERE film_id = ?;

-- GOOD: single query with JOIN
SELECT f.film_id, f.title, fa.actor_id
FROM film f
JOIN film_actor fa ON f.film_id = fa.film_id;
```

### 3. Avoid functions in WHERE (breaks indexes)

```sql
-- BAD — index on rental_date is unusable
SELECT * FROM rental WHERE YEAR(rental_date) = 2005;

-- GOOD — range scan on the index
SELECT * FROM rental
WHERE rental_date >= '2005-01-01'
  AND rental_date < '2006-01-01';
```

### 4. LIKE with leading wildcard (forces full scan)

```sql
-- BAD — full scan forced
SELECT * FROM film WHERE title LIKE '%ACADEMY%';

-- GOOD (wildcard only at end)
SELECT * FROM film WHERE title LIKE 'ACADEMY%';

-- Alternative for full-text search
ALTER TABLE film ADD FULLTEXT INDEX ft_title (title);
SELECT * FROM film WHERE MATCH(title) AGAINST('ACADEMY');
```
