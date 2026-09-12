# PaceCraft engineering rules

- Keep the public repository, code, commits, and documentation in English.
- Use Bun 1.4.2 and exact dependency versions from the lockfile.
- Keep domain and application code independent from Fastify, Drizzle, and Bun SQL.
- Add ports only at real external boundaries; do not introduce generic repositories or mappers speculatively.
- Keep Bun SQL imports inside the persistence adapter.
- Treat Zod schemas as HTTP contracts, not as domain models.
- Generate SQL migrations and commit them; never use schema push outside disposable databases.
- Run `task check` before pushing and keep the CI result authoritative.
- Use Conventional Commits with one coherent purpose per commit.
- Name branches `<type>/<kebab-case-description>` using a Conventional Commit type such as `feat`,
  `fix`, `chore`, `docs`, or `refactor`; never add a tool-specific prefix.
- Do not bypass type, lint, test, migration, or security failures.
