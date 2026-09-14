import { expect } from "bun:test";
import { createDrizzleReadinessProbe } from "../src/infrastructure/database/drizzle-readiness-probe";
import {
  databaseTest,
  withTestDatabase,
} from "../src/infrastructure/database/testing/test-database";

databaseTest("connects to PostgreSQL through the Drizzle Bun SQL adapter", () =>
  withTestDatabase(async ({ databaseUrl }) => {
    const probe = createDrizzleReadinessProbe(databaseUrl);
    try {
      await expect(probe.check()).resolves.toBeUndefined();
    } finally {
      await probe.close?.();
    }
  }),
);
