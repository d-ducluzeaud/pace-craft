import { expect, test } from "bun:test";

import { createDrizzleReadinessProbe } from "../src/infrastructure/database/drizzle-readiness-probe";

const { DATABASE_URL: databaseUrl } = process.env;
const databaseTest = databaseUrl === undefined ? test.skip : test;

databaseTest("connects to PostgreSQL through the Drizzle Bun SQL adapter", async () => {
  if (databaseUrl === undefined) {
    throw new Error("DATABASE_URL must be set for integration tests.");
  }

  const probe = createDrizzleReadinessProbe(databaseUrl);
  try {
    await expect(probe.check()).resolves.toBeUndefined();
  } finally {
    await probe.close?.();
  }
});
