# Activity history query plan

Measured during PR #51 on a disposable PostgreSQL 18.6 database. This is a local
synthetic comparison, not a production latency guarantee. The database was removed
by `withTestDatabase` after the run; no development data was used.

Dataset: 300,000 rows, 1,000 owners (300 rows each), start dates spread over 366 days,
one third running and two thirds cycling. After `ANALYZE activities`, queries selected
one owner and a year of history with `ORDER BY started_at DESC, id DESC LIMIT 101`.

| Query | Before index | With owner/date/ID index | Shared buffers before/after |
| --- | --- | --- | --- |
| All sports | 8.904 ms, parallel sequential scan + sort | 0.150 ms, ordered index scan | 4378 / 101 |
| Running | 7.127 ms, parallel sequential scan + sort | 0.294 ms, bitmap scan + sort | 4378 / 303 |

Use `EXPLAIN (ANALYZE, BUFFERS)` to reproduce with representative data:

```sql
SELECT * FROM activities
WHERE owner_id = '<existing-owner-uuid>'
  AND started_at >= '2020-01-01T00:00:00Z'
  AND started_at < '2021-01-01T00:00:00Z'
  -- AND sport = 'running'
ORDER BY started_at DESC, id DESC
LIMIT 101;
```

The generated index starts with mandatory owner equality, then the date range and
the stable ID tie-breaker. Its descending NULL ordering matches the query even
though both columns are non-nullable. The sport predicate remains a residual filter.
A separate `(owner_id, sport, started_at DESC, id DESC)` index may help owners with
large, highly selective histories, but adds write and storage cost. Measure that
workload before adding it. The current result cap alone never guaranteed bounded
scan work.

The migration uses ordinary `CREATE INDEX`. On a large live table, plan an
appropriate maintenance window or a separately managed concurrent index rollout;
ordinary creation can block writes. The current application is local-development-only.
