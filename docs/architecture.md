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

The initial slice deliberately contains health probes and operational contracts only.
