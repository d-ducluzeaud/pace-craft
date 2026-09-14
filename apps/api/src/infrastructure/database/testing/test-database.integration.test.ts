import { expect } from "bun:test";
import { insertActivityFixture } from "./activity-fixture";
import { databaseTest, withTestDatabase } from "./test-database";

databaseTest("overlapping test databases isolate fixtures and cleanup", () =>
  withTestDatabase(async ({ client: first, databaseUrl: firstUrl }) => {
    const ownerId = crypto.randomUUID();
    await insertActivityFixture(first, { ownerId, distanceMeters: 1000 });
    await withTestDatabase(async ({ client: second, databaseUrl: secondUrl }) => {
      expect(firstUrl).not.toBe(secondUrl);
      expect(await second`SELECT id FROM activities`).toHaveLength(0);
      await insertActivityFixture(second, { ownerId, distanceMeters: 2000 });
      const [[firstRow], [secondRow]] = await Promise.all([
        first`SELECT distance_meters FROM activities`,
        second`SELECT distance_meters FROM activities`,
      ]);
      expect(Number(firstRow.distance_meters)).toBe(1000);
      expect(Number(secondRow.distance_meters)).toBe(2000);
    });
    // Dropping the second database must leave the first one's fixture intact.
    expect(await first`SELECT id FROM activities`).toHaveLength(1);
  }),
);

databaseTest("a failed scenario drops only its temporary database", () =>
  withTestDatabase(async ({ client }) => {
    let failedDatabase = "";
    const failure = new Error("Deliberate scenario failure");
    await expect(
      withTestDatabase(async ({ client: failedClient, databaseUrl }) => {
        failedDatabase = new URL(databaseUrl).pathname.slice(1);
        await insertActivityFixture(failedClient, { ownerId: crypto.randomUUID() });
        throw failure;
      }),
    ).rejects.toBe(failure);
    expect(failedDatabase).toStartWith("pacecraft_test_");
    expect(
      await client`SELECT datname FROM pg_database WHERE datname = ${failedDatabase}`,
    ).toHaveLength(0);
    expect(await client`SELECT id FROM activities`).toHaveLength(0);
  }),
);
