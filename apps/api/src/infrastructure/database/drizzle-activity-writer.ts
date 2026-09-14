import { SQL } from "bun";
import { drizzle } from "drizzle-orm/bun-sql";
import type { ActivityWriter } from "../../application/activities/activity-writer";
import { activities } from "./schema/activities";

export function createDrizzleActivityWriter(
  databaseUrl: string,
): ActivityWriter & { close(): Promise<void> } {
  const client = new SQL(databaseUrl);
  const database = drizzle({ client });

  return {
    async create(input) {
      const [generated] = await database.insert(activities).values(input).returning({
        id: activities.id,
        createdAt: activities.createdAt,
        updatedAt: activities.updatedAt,
      });
      if (generated === undefined) throw new Error("Activity insert returned no row.");
      return { ...input, ...generated };
    },
    async close() {
      await client.close();
    },
  };
}
