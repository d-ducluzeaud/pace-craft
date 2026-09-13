# PaceCraft

PaceCraft is a REST API for tracking running, cycling, and swimming activities. The repository is
currently establishing a reproducible backend platform before introducing domain features.

## Stack

- Bun 1.4.2 and TypeScript 7
- Fastify 5, Zod 4, and OpenAPI
- PostgreSQL 18, Drizzle ORM, and Bun SQL
- Biome, Bun Test, Bruno, Lefthook, and Commitlint
- Docker Compose, GitHub Actions, CodeQL, and Trivy

## Requirements

- Bun 1.4.2
- Docker with Compose
- Task 3.53.1

## Getting started

```sh
cp .env.example .env
task setup
task stack:up
```

The API is available at `http://localhost:3000`, with documentation at `/docs`.

## Quality commands

```sh
task check
task test:integration
task test:e2e
task openapi:check
```

Atomic JavaScript commands remain in the workspace manifests. Task only coordinates multi-tool
workflows such as Docker, database migrations, OpenAPI, and Bruno.

## Architecture

PaceCraft uses progressive hexagonal boundaries. Domain and application code remain framework
independent, while Fastify and Drizzle/Bun SQL live in adapters. See
[ADR 0001](docs/adr/0001-drizzle-bun-sql-rc.md) for the intentional release-candidate dependency.

## Troubleshooting

If npm reports a root-owned cache, repair the ownership of the npm cache outside this repository.
Do not run an unreviewed recursive `sudo` command copied from an error message. PaceCraft itself uses
Bun and does not require npm for installation.
