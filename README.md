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
