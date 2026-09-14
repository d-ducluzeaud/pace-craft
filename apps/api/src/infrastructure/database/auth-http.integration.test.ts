import { expect } from "bun:test";
import { signUpResponseSchema } from "@pacecraft/contracts";
import { buildApp } from "../../app";
import { createDrizzleAuth } from "./drizzle-auth";
import { databaseTest, withTestDatabase } from "./testing/test-database";

const url = "/api/auth/sign-up/email";
const body = { name: "Alice", email: "alice@example.com", password: "test-password-95c71ab3" };

function createTestApp(databaseUrl: string, logs?: string[]) {
  return buildApp({
    ...(logs === undefined
      ? {}
      : {
          logger: {
            level: "error",
            stream: {
              write(message: string) {
                logs.push(message);
              },
            },
          },
        }),
    readinessProbe: { check: async () => undefined },
    authentication: createDrizzleAuth({
      databaseUrl,
      baseURL: "http://localhost:3000",
      secret: "integration-test-secret-only-9c8f2e734a0d65b1",
    }),
  });
}

databaseTest(
  "registration validates input, preserves origin checks and hides existing accounts",
  () =>
    withTestDatabase(async ({ client, databaseUrl }) => {
      const app = await createTestApp(databaseUrl);
      try {
        for (const payload of [
          { ...body, password: "short" },
          { ...body, email: "not-an-email" },
          { ...body, name: " " },
          { ...body, ownerId: crypto.randomUUID() },
        ]) {
          const invalid = await app.inject({ method: "POST", url, payload });
          expect(invalid.statusCode).toBe(400);
          expect(invalid.headers["content-type"]).toContain("application/problem+json");
          expect(invalid.body).not.toContain(payload.password);
        }
        const forbidden = await app.inject({
          method: "POST",
          url,
          payload: body,
          headers: { origin: "https://untrusted.example" },
        });
        expect(forbidden.statusCode).toBe(403);
        expect(forbidden.headers["content-type"]).toContain("application/problem+json");
        expect(await client`SELECT id FROM "user"`).toHaveLength(0);

        const created = await app.inject({ method: "POST", url, payload: body });
        const duplicate = await app.inject({
          method: "POST",
          url,
          payload: { ...body, email: "ALICE@EXAMPLE.COM", name: "Different name" },
        });
        for (const response of [created, duplicate]) {
          expect(response.statusCode).toBe(200);
          expect(signUpResponseSchema.safeParse(response.json()).success).toBe(true);
          expect(response.json().token).toBeNull();
          expect(response.headers["set-cookie"]).toBeUndefined();
          expect(response.headers["cache-control"]).toBe("no-store");
        }
        expect(duplicate.json().user.name).toBe("Different name");
        expect(duplicate.json().user.id).not.toBe(created.json().user.id);
        const users = await client`SELECT email, name FROM "user"`;
        expect(users).toHaveLength(1);
        expect(users[0].email).toBe(body.email);
        expect(users[0].name).toBe(body.name);
        expect(await client`SELECT id FROM account`).toHaveLength(1);
        expect(await client`SELECT id FROM session`).toHaveLength(0);
      } finally {
        await app.close();
      }
    }),
);

databaseTest(
  "registration rate limits are shared across instances and ignore spoofed IP headers",
  () =>
    withTestDatabase(async ({ databaseUrl }) => {
      const first = await createTestApp(databaseUrl);
      const second = await createTestApp(databaseUrl);
      try {
        for (let index = 0; index < 5; index++) {
          const app = index % 2 === 0 ? first : second;
          const response = await app.inject({
            method: "POST",
            url,
            payload: body,
            headers: {
              "x-pacecraft-client-ip": `192.0.2.${index}`,
              "x-forwarded-for": `192.0.2.${index}`,
            },
          });
          expect(response.statusCode).toBe(200);
        }
        const limited = await second.inject({ method: "POST", url, payload: body });
        expect(limited.statusCode).toBe(429);
        expect(limited.headers["content-type"]).toContain("application/problem+json");
        expect(Number(limited.headers["retry-after"])).toBeGreaterThan(0);
      } finally {
        await Promise.all([first.close(), second.close()]);
      }
    }),
);

databaseTest("concurrent registrations cannot create two accounts for one email", () =>
  withTestDatabase(async ({ client, databaseUrl }) => {
    const app = await createTestApp(databaseUrl);
    try {
      const responses = await Promise.all([
        app.inject({ method: "POST", url, payload: body }),
        app.inject({ method: "POST", url, payload: body }),
      ]);
      for (const response of responses) expect(response.statusCode).toBe(200);
      expect(await client`SELECT id FROM "user"`).toHaveLength(1);
      expect(await client`SELECT id FROM account`).toHaveLength(1);
    } finally {
      await app.close();
    }
  }),
);

databaseTest("registration retries do not hide persistent storage failures", () =>
  withTestDatabase(async ({ client, databaseUrl }) => {
    await client.unsafe(`
      CREATE FUNCTION reject_user_insert() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN RAISE EXCEPTION 'Deliberate registration storage failure'; END; $$;
      CREATE TRIGGER reject_user_insert BEFORE INSERT ON "user"
      FOR EACH ROW EXECUTE FUNCTION reject_user_insert();
    `);
    const app = await createTestApp(databaseUrl);
    try {
      const response = await app.inject({ method: "POST", url, payload: body });
      expect(response.statusCode).toBe(503);
      expect(response.headers["content-type"]).toContain("application/problem+json");
      expect(response.body).not.toContain("Deliberate registration storage failure");
      expect(response.body).not.toContain(body.password);
      expect(await client`SELECT id FROM "user"`).toHaveLength(0);
      expect(await client`SELECT id FROM account`).toHaveLength(0);
    } finally {
      await app.close();
    }
  }),
);

databaseTest(
  "a failing credential insert rolls back the user and keeps retry errors out of logs",
  () =>
    withTestDatabase(async ({ client, databaseUrl }) => {
      // Sequence increments survive rollback, so only the first attempt fails before user creation.
      await client.unsafe(`
      CREATE SEQUENCE registration_attempt;
      CREATE FUNCTION fail_first_user_insert() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN
        IF nextval('registration_attempt') = 1 THEN RAISE EXCEPTION 'first attempt'; END IF;
        RETURN NEW;
      END; $$;
      CREATE TRIGGER fail_first_user_insert BEFORE INSERT ON "user"
      FOR EACH ROW EXECUTE FUNCTION fail_first_user_insert();
      CREATE FUNCTION reject_account_insert() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN RAISE EXCEPTION 'credential-hash-marker-%', NEW.password; END; $$;
      CREATE TRIGGER reject_account_insert BEFORE INSERT ON account
      FOR EACH ROW EXECUTE FUNCTION reject_account_insert();
    `);
      const logs: string[] = [];
      const app = await createTestApp(databaseUrl, logs);
      try {
        const response = await app.inject({ method: "POST", url, payload: body });
        expect(response.statusCode).toBe(503);
        expect(response.headers["content-type"]).toContain("application/problem+json");
        expect(response.body).not.toContain("credential-hash-marker");
        const output = logs.join("");
        expect(output).toContain("Authentication request failed.");
        expect(output).not.toContain("credential-hash-marker");
        expect(output).not.toContain(body.password);
        expect(output).not.toContain("insert into");
        expect(await client`SELECT id FROM "user"`).toHaveLength(0);
        expect(await client`SELECT id FROM account`).toHaveLength(0);
        expect(await client`SELECT id FROM session`).toHaveLength(0);
        await client.unsafe(`DROP TRIGGER reject_account_insert ON account`);
        const recovered = await app.inject({ method: "POST", url, payload: body });
        expect(recovered.statusCode).toBe(200);
        expect(await client`SELECT id FROM "user"`).toHaveLength(1);
        expect(await client`SELECT id FROM account`).toHaveLength(1);
      } finally {
        await app.close();
      }
    }),
);
