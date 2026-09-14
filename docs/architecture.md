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
