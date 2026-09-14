import { test } from "bun:test";
import { fileURLToPath } from "node:url";
import { SQL } from "bun";
import { drizzle } from "drizzle-orm/bun-sql";
import { migrate } from "drizzle-orm/bun-sql/migrator";

const { TEST_DATABASE_ADMIN_URL: adminUrl } = process.env;
export const databaseTest = adminUrl === undefined ? test.skip : test.concurrent;

export async function withTestDatabase(
  run: (context: { client: SQL; databaseUrl: string }) => Promise<void>,
): Promise<void> {
  if (adminUrl === undefined) throw new Error("TEST_DATABASE_ADMIN_URL is required.");
  const name = `pacecraft_test_${crypto.randomUUID().replaceAll("-", "")}`;
  const admin = new SQL(adminUrl, { max: 1 });
  const url = new URL(adminUrl);
  url.pathname = `/${name}`;
  const databaseUrl = url.toString();
  try {
    // The identifier is generated here, never taken from configuration or test input.
    await admin.unsafe(`CREATE DATABASE "${name}"`);
    try {
      const client = new SQL(databaseUrl, { max: 2 });
      try {
        await migrate(drizzle({ client }), {
          migrationsFolder: fileURLToPath(new URL("../../../../drizzle/", import.meta.url)),
        });
        await run({ client, databaseUrl });
      } finally {
        await client.close();
      }
    } finally {
      await admin.unsafe(`DROP DATABASE "${name}" WITH (FORCE)`);
    }
  } finally {
    await admin.close();
  }
}
