import { SQL } from "bun";
import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/bun-sql";

import type { ReadinessProbe } from "../../application/health/readiness-probe";

export function createDrizzleReadinessProbe(databaseUrl: string): ReadinessProbe {
  const client = new SQL(databaseUrl);
  const database = drizzle({ client });

  return {
    async check(): Promise<void> {
      await database.execute(sql`select 1`);
    },
    async close(): Promise<void> {
      await client.close();
    },
  };
}
