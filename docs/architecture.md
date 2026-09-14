# Architecture

PaceCraft starts as a modular monolith with progressive hexagonal boundaries.

```text
HTTP adapter (Fastify + Zod)
            |
            v
Application use cases -- ports --> external capabilities
            ^                              |
            |                              v
       domain model          persistence adapter (Drizzle + Bun SQL)
```

Dependencies point inward. HTTP contracts belong to `packages/contracts`; business invariants will
belong to the domain; database mappings belong to the persistence adapter. A port is introduced only
when an application use case needs an external capability.

Activity creation and owner-scoped retrieval use separate writer and reader ports, implemented
by one Drizzle adapter. Retrieval filters by activity ID and owner ID in the SQL query;
another athlete's activity is indistinguishable from a missing resource.

Activity history keeps mandatory ownership separate from `ActivityFilters`. The HTTP adapter
validates the query and obtains the server identity; a framework-independent application function
resolves calendar periods or explicit date bounds. The SQL adapter combines owner, date and optional
sport predicates, orders by start time and ID, and applies a bounded limit. The HTTP adapter requests
one extra row to signal truncation through `X-Has-More` without returning that extra row. The same
local row conversion serves individual and list reads. Cursor pagination is intentionally separate.
