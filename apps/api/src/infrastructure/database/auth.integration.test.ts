import { expect } from "bun:test";
import { createDrizzleAuth } from "./drizzle-auth";
import { databaseTest, withTestDatabase } from "./testing/test-database";

databaseTest("Better Auth persists credentials and sessions across instances", () =>
  withTestDatabase(async ({ client, databaseUrl }) => {
    const options = {
      databaseUrl,
      baseURL: "http://localhost:3000",
      secret: "integration-test-secret-only-9c8f2e734a0d65b1",
    };
    const first = createDrizzleAuth(options);
    const second = createDrizzleAuth(options);
    const credentials = {
      email: "alice@example.com",
      password: "test-password-8ef7b628a4d1",
    };
    try {
      const registered = await first.auth.api.signUpEmail({
        body: { ...credentials, name: "Alice" },
      });
      expect(registered.token).toBeNull();
      expect(registered.user.id).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
      );
      const [account] = await client`
        SELECT password FROM account WHERE user_id = ${registered.user.id}::uuid
      `;
      expect(account.password).toBeTypeOf("string");
      expect(account.password).not.toBe(credentials.password);
      expect(await client`SELECT id FROM session`).toHaveLength(0);

      const duplicate = await second.auth.api.signUpEmail({
        body: { ...credentials, password: "different-password-593ec3f0", name: "Alice" },
      });
      expect(duplicate.token).toBeNull();
      expect(duplicate.user.id).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
      );
      await expect(
        second.auth.api.signInEmail({
          body: { ...credentials, password: "different-password-593ec3f0" },
        }),
      ).rejects.toMatchObject({ statusCode: 401 });

      const signedIn = await second.auth.api.signInEmail({
        body: credentials,
        returnHeaders: true,
      });
      const headers = new Headers({
        cookie: signedIn.headers
          .getSetCookie()
          .map((cookie) => cookie.split(";")[0])
          .join("; "),
      });
      const session = await first.auth.api.getSession({ headers });
      expect(session?.user.id).toBe(registered.user.id);
      const rows = await client`SELECT user_id FROM session`;
      expect(rows).toHaveLength(1);
      expect(rows[0].user_id).toBe(registered.user.id);
    } finally {
      await Promise.all([first.close(), second.close()]);
    }
  }),
);
