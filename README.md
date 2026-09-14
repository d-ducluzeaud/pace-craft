# PaceCraft

PaceCraft is a REST API for tracking running, cycling, and swimming activities. It supports manual
activity creation and owner-scoped retrieval with runtime validation and PostgreSQL persistence in local development.

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

The API is available at `http://127.0.0.1:3000`, with documentation at `/docs`.

## Athlete registration

Set both values in your untracked `.env` to enable registration:

```dotenv
BETTER_AUTH_URL=http://127.0.0.1:3000
BETTER_AUTH_SECRET=<generate with openssl rand -base64 32>
```

Use a random secret of at least 32 characters, shared across API instances. Use an HTTPS
origin in production. Run generated migrations before starting the API; `task stack:up`
does this automatically. With both settings empty, registration returns `503`.

`POST /api/auth/sign-up/email` accepts `name` (1–100 characters after trimming), `email`
(at most 254 characters), and `password` (8–128 characters, never trimmed). Unknown fields
are rejected. Better Auth normalizes email case and PostgreSQL enforces uniqueness.
New and existing emails both return `200` with `token: null`; an existing email gets a
synthetic user. The response is not proof of account creation and sets no session cookie.
Failures use `application/problem+json`.

Registration permits five valid requests per client IP per minute, shared in PostgreSQL.
Excess requests return `429` and `Retry-After`. Client-supplied IP headers are overwritten
with Fastify's socket-derived IP; reverse-proxy trust needs explicit configuration before
deploying behind a proxy. Better Auth origin/CSRF checks remain enabled. Its raw error
arguments are excluded from logs because database errors may contain credential hashes.

Run `task test:integration` for HTTP, concurrency, and storage checks. After enabling
registration locally, `task test:e2e` also runs the Bruno auth requests. Repeated runs within
one minute can hit the registration rate limit.

Login, logout, and authenticated activity ownership are separate upcoming slices. Activity
routes still use the development identity and this is not ready for public deployment.

Better Auth 1.7.4 can return `FAILED_TO_CREATE_USER` for a concurrent email conflict. The
route retries once after the native security checks; persistent failures return `503`.
Remove this workaround when an upstream update passes the concurrency regression test.

To update the auth schema, run `bun run --filter @pacecraft/api auth:generate`. Compare the
candidate in `apps/api/dist/auth-schema.ts` with the maintained schema and merge changes,
preserving the custom unique index on `lower(email)`. Then run `task db:generate` with
`DATABASE_URL` set and review the generated SQL migration and snapshot before committing.

## Editor setup

Install [Zed](https://zed.dev/download) or [VS Code](https://code.visualstudio.com/download)
using its official installer if needed. Keep an existing installation and its user preferences.
Run `task setup` with Bun 1.4.2, then open the repository root so the shared settings and tasks load.
The lockfile pins Biome, TypeScript, and Bun types; editor applications and extensions follow their
own update policies and are not pinned by this repository.

### VS Code

Install the official Biome extension using the workspace recommendation, or run:

```sh
code --install-extension biomejs.biome
code .
```

The [official CLI](https://code.visualstudio.com/docs/configure/command-line) supports extension
installation. The command is safe to rerun without `--force` and does not rewrite user settings.
On macOS, enable `code` with **Shell Command: Install 'code' command in PATH** if necessary.
Workspace recommendations prompt for installation; they do not install extensions automatically.

### Zed

Open **zed: extensions**, search for **Biome**, and install it once. If already installed, keep it.
See the [official Biome instructions](https://biomejs.dev/reference/zed/).
Zed's CLI has no extension-install flag. Its
[`auto_install_extensions`](https://zed.dev/docs/reference/all-settings#auto-install-extensions)
mechanism [reads global settings](https://github.com/zed-industries/zed/blob/main/crates/extension_host/src/extension_host.rs),
so putting it in `.zed/settings.json` does not install Biome.
This setup uses the native gallery and leaves global preferences intact. Installation in Zed
therefore requires this interactive step; it is not a headless bootstrap.

### Saving and checking

Project settings select Biome for TypeScript, JavaScript, JSON, and JSONC, overriding a global
Prettier formatter for these languages. After `task setup`, the extensions discover the local
Biome package and use `biome.json`. Explicit saves apply formatting, safe fixes, and import sorting;
VS Code's `explicit` code actions do not run on Auto Save. See the
[Biome VS Code configuration](https://biomejs.dev/reference/vscode/).

Keep each editor's built-in TypeScript language support enabled for completion and type diagnostics.
Bun types come from the locked `@types/bun` dependency and the package tsconfig files; no additional
Bun extension is required for these tasks. Do not point a legacy TypeScript SDK setting at
`node_modules/typescript/lib`: this repository's TypeScript 7 package does not contain `tsserver.js`.
Editor diagnostics can differ from the locked compiler; `task check` and CI remain authoritative.

Both editors provide **PaceCraft: check** (`task check`) and **PaceCraft: test coverage**
(`bun test --coverage`). Use **Tasks: Run Task** in VS Code or **task: spawn** in Zed.
Tasks run from the repository root and require Bun 1.4.2 and Task on the editor's PATH.
Coverage appears in the task terminal; no coverage viewer extension is required.

To verify setup, save a temporary TypeScript file containing unsorted, used imports and inconsistent
spacing: Biome should sort and format it. Remove the file afterwards, then run both editor tasks.
Check the Biome language-server output for the workspace binary if formatting does not run.
Restart language servers after dependency installation if diagnostics are stale. Integration tests
requiring PostgreSQL remain separate (`task test:integration`).

## Quality commands

```sh
task check
task test:integration
task test:e2e
task openapi:check
```

### Isolated PostgreSQL integration tests

`task test:integration` starts a dedicated PostgreSQL container on `127.0.0.1:5434` and runs integration tests concurrently (up to four
per file). Each test gets a fresh `pacecraft_test_<uuid>` database with the committed Drizzle
migrations applied. Fixtures are inserted only when requested with `insertActivityFixture`;
the owner is explicit and other activity facts have stable defaults. No fixture calls the
production creation endpoint or writer.

`withTestDatabase` owns the database lifecycle through `try/finally`: it closes its connection
and drops only its generated database, including after a failed scenario. Tests close their
own application and adapter connections before returning. A fresh database provides the clean
starting state; dropping it replaces shared `TRUNCATE` cleanup and permits overlapping tests
and independent test runs without deleting each other's data. No production adapter changes
are needed for this isolation.

The test container uses the same pinned PostgreSQL image as CI and stores its data in tmpfs.
It has its own Compose project, credentials, and port; the development stack and its persistent
volume are untouched. CPU and memory still share the local Docker host.

The task defaults to the test container's maintenance database. To use another test server,
set `TEST_DATABASE_ADMIN_URL` to its connection URL; its role needs `CREATEDB` and permission
to drop the databases it creates. `DATABASE_URL` is never used by the integration harness.
Leave `TEST_DATABASE_ADMIN_URL` unset for fast checks that skip integration tests. CI enables
it explicitly for the integration step.

A forcibly terminated process can leave a database behind; future runs use new UUID names.
Run `task test:integration:down` after all test runs have stopped to remove the test container
and any leftover databases. Do not tear down the container while another run is active. Applying migrations per test
has a setup cost; consider per-worker reuse only if measurements justify weakening per-test
isolation.

Atomic JavaScript commands remain in the workspace manifests. Task only coordinates multi-tool
workflows such as Docker, database migrations, OpenAPI, and Bruno.

## Architecture

PaceCraft uses progressive hexagonal boundaries. Domain and application code remain framework
independent, while Fastify and Drizzle/Bun SQL live in adapters.

Drizzle ORM and Kit are pinned together to `1.0.0-rc.4` for Bun SQL support. Their library
declarations require `skipLibCheck` in the API workspace; project source remains strictly
checked. Upgrade both together when the stable adapter passes migration and PostgreSQL
integration tests. If the release candidate blocks required behavior, use stable
`node-postgres` instead.

## Troubleshooting

If npm reports a root-owned cache, repair the ownership of the npm cache outside this repository.
Do not run an unreviewed recursive `sudo` command copied from an error message. PaceCraft itself uses
Bun and does not require npm for installation.

## Create and retrieve an activity locally

Run `task stack:up`, then open the `bruno` directory as a collection in Bruno and
select the **Local** environment. The **activities** folder contains POST requests
for running, cycling, swimming, and an invalid-distance example. Run the collection
from the terminal with `task bruno` (each successful POST creates a database row).

`POST /activities` returns `201`, the saved activity, and a `Location` header.
`GET /activities/:id` returns `200` with the complete saved activity. A malformed
UUID returns `400`; a missing activity or one owned by another athlete returns
the same `404` problem response. Optional measurements are omitted when absent.
The Bruno collection retrieves each created sport and checks malformed and missing IDs.
The OpenAPI contract
is available at <http://127.0.0.1:3000/docs>.

An activity must have ended by its creation time (`startedAt + durationSeconds`).

PostgreSQL generates UUIDv7 activity IDs and creation/update timestamps. The
`activities.owner_id` UUID column is populated from `DEV_ATHLETE_ID` in local
server configuration. The request cannot choose the owner. This development
identity requires `NODE_ENV=development`; without an identity, creation and retrieval return
`503`. This indicates unavailable server configuration, not rejected client credentials.
Compose binds the API to localhost. Replace this development identity with
session authentication before public deployment. A foreign key to users will be
added when the authentication schema exists.

Compose applies the generated SQL migration automatically. For an API running
outside Docker, copy `.env.example` to `.env` and use `task dev` after starting the
local database. Do not use schema push. The update endpoint will be responsible
for advancing `updated_at` when it is implemented.

The local Docker database is exposed at `127.0.0.1:5433` to avoid conflicting
with a PostgreSQL installation on the host. Containers use `postgres:5432`.

With the database running and `DATABASE_URL` configured in `.env`, run
`task db:studio` and open the URL printed in the terminal to inspect the database.
Stop Studio with Ctrl+C.

Keep each table in `apps/api/src/infrastructure/database/schema/` (for example,
`activities.ts`). Drizzle Kit discovers these files through its schema glob.
Generate migrations with a descriptive name:

```sh
task db:generate -- --name=create_activities
```

Choose a name describing the actual change, such as `add_activity_notes`. Do not
rename published or applied migrations: Drizzle tracks them by directory name.

### Activity history

`GET /activities` returns an array for the server-configured athlete, ordered by
`startedAt DESC, id DESC`. Optional `sport` accepts `running`, `cycling`, or
`swimming`. Dates in responses are UTC ISO timestamps; absent measurements are omitted.

Choose a preset with `period=1y|6m|3m|1m|1w|today` (default `1m`). Months and years
are calendar intervals ending at request time, clamped to the last valid day of
the target month. A week is seven days. `today` means the UTC calendar day
`[00:00, next 00:00)`, not the athlete's local timezone.

Alternatively, supply both `from` and `to` as ISO timestamps with a timezone:
Bounds support at most millisecond precision. `from` is inclusive and `to` exclusive, with `from < to` and a maximum span of
366 days. Do not combine explicit dates with `period`. For example:

```text
/activities?period=3m&sport=running
/activities?from=2026-01-01T00:00:00Z&to=2026-02-01T00:00:00Z&limit=50
```

URL-encode a positive offset's `+` as `%2B`. `limit` is a positive decimal integer,
default 100, maximum 200. The response header `X-Has-More: true` means additional
matches were omitted. Narrowing the date range may help, but cannot retrieve all
results when more than the limit share one timestamp. Complete traversal requires
the separate cursor pagination feature. The server fetches at most `limit + 1` rows. Empty results
return `200` with `[]` and `X-Has-More: false`.

Invalid or unknown filters return RFC 9457 `400` errors before storage access.
Missing development identity or storage returns `503`; unexpected storage errors
return a sanitized `500`. SQL always combines ownership with date and sport filters.
The result cap bounds transfer and application memory, not PostgreSQL scan/sort
work. The generated migration adds `(owner_id, started_at DESC, id DESC)` for
owner-scoped range scans and ordering. Sport is a residual filter; evaluate query
plans on representative data before adding a sport-specific index.
