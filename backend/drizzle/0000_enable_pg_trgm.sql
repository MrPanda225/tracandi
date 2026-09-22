-- T-002 — ADR-08, EF-CAN-03 / Q-05: trigram indexes for substring search without full scan (ENF-PERF-04).
-- Non destructive. Must run before the initial schema, which creates gin_trgm_ops indexes.
CREATE EXTENSION IF NOT EXISTS pg_trgm;
