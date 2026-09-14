# ADR 0002: Use Better Auth with PostgreSQL sessions

## Status

Accepted for authentication infrastructure and the registration HTTP endpoint.
Login, logout, and authenticated activity ownership are pending.

## Context

Issues #4, #30, #24, #17, and #11 require secure registration, opaque sessions,
immediate revocation, and athlete data isolation. The API uses Bun 1.4.2,
Fastify 5.12.4, and Drizzle ORM/Kit 1.0.0-rc.4.

## Decision

Use Better Auth and its Drizzle adapter, both pinned to 1.7.4. Keep their integration
inside infrastructure and use PostgreSQL as the shared session store. Enable adapter
transactions and UUID identifiers to match activity owner IDs. Disable automatic
sign-in on registration and session cookie caching.

Better Auth owns credential and session mechanics. PaceCraft owns resource authorization:
application code receives a verified identity, and SQL queries retain their owner filter.
Do not import Better Auth types into domain or application code.

## Alternatives and consequences

- Custom authentication would make us maintain more security-sensitive behavior.
- A hosted identity provider would reduce operational work but introduce an external
  service dependency. Our current requirements fit database-backed authentication.
- Better Auth introduces its own schema and API conventions, upgrade work, and database
  lookups for session validation. These are acceptable costs for reducing custom auth code.
- Cookie caching stays disabled because cached sessions can outlive server-side revocation.
  Any future optimization must preserve the immediate-revocation requirement.

## Evidence and remaining checks

The isolated PostgreSQL integration test applies generated migrations, registers a user
without creating a session, checks that the stored password differs from the input, signs
in through another instance, and resolves the persisted session through the first instance.
This verifies the persistence path on our pinned versions, not the complete auth backlog.

Registration HTTP tests cover invalid input, untrusted origins, repeated and concurrent
registration, shared rate limits with spoofed IP headers, and persistent storage failures.
An account-insert failure after user creation verifies transaction rollback, sanitized
retry-error logging, and successful recovery. Repeated registration cannot replace a password.
The endpoint uses Better Auth's native handler to retain its security middleware, with
Zod contracts and RFC 9457 error translation. OpenAPI and Bruno document this route.

Better Auth 1.7.4 can return `FAILED_TO_CREATE_USER` after losing a concurrent unique-email
insert. After the native handler's security checks, the endpoint retries that operation
once through Better Auth's server API. It then observes the committed account and returns
the library's synthetic response. Persistent creation failures return `503`, never success.
Remove this bounded workaround when the upstream library passes our concurrency test.

Before enabling public authentication, test invalid login credentials, expiration, immediate
revocation, repeated logout, session cookie behavior, and cross-account authorization.

## Schema maintenance

Run `bun run --filter @pacecraft/api auth:generate` to generate a candidate schema in
`apps/api/dist/auth-schema.ts` using the pinned Better Auth CLI. Review and merge its changes
into `src/infrastructure/database/schema/auth.ts`, preserving the custom unique index on
`lower(email)`. That index enforces case-insensitive uniqueness even for direct database
writes; the raw unique index also supports Better Auth's exact-email lookups. The generator
does not overwrite this customization. A direct SQL regression test protects the invariant.
Then format the schema and run `task db:generate` with `DATABASE_URL` set. Review and commit
the generated SQL migration and snapshot. The schema-generation configuration uses
placeholders and does not connect to a runtime database.

## References

- [Email/password and enumeration protection](https://better-auth.com/docs/authentication/email-password)
- [Opaque sessions, caching, and revocation](https://better-auth.com/docs/concepts/session-management)
- [Drizzle adapter and schema generation](https://better-auth.com/docs/adapters/drizzle)
