# ADR 0001: Use the Drizzle Bun SQL release candidate

## Status

Accepted as a time-boxed experiment.

## Context

Native Bun SQL support requires Drizzle ORM and Drizzle Kit `1.0.0-rc.4`. Their declaration
files, together with the Bun declarations, do not currently pass TypeScript 7 library checking.

## Decision

- Keep ORM and Kit pinned to the same exact release candidate.
- Isolate Bun SQL inside the persistence adapter.
- Enable `skipLibCheck` only in the API workspace; project source is still checked strictly.
- Commit generated SQL migrations and snapshots. Do not use schema push outside disposable databases.
- Track the stable Drizzle v1 release in a dedicated issue and upgrade through an isolated pull request.

## Exit criteria

Adopt stable Drizzle v1 when its Bun SQL adapter passes the database and concurrency test suite. Fall
back to stable `node-postgres` if the release candidate blocks TypeScript upgrades, migrations, or
required PostgreSQL behavior.
