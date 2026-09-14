import { SQL } from "bun";
import { and, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/bun-sql";
import type { ActivityReader } from "../../application/activities/activity-reader";
import type { ActivityWriter } from "../../application/activities/activity-writer";
import { activities } from "./schema/activities";

export function createDrizzleActivityStore(
  databaseUrl: string,
): ActivityWriter & ActivityReader & { close(): Promise<void> } {
  const client = new SQL(databaseUrl);
  const database = drizzle({ client });

  return {
    async findOwned(id, ownerId) {
      const [row] = await database
        .select()
        .from(activities)
        .where(and(eq(activities.id, id), eq(activities.ownerId, ownerId)))
        .limit(1);
      if (row === undefined) return undefined;
      const {
        effort,
        averageHeartRate,
        maxHeartRate,
        averagePower,
        maxPower,
        averageSwolf,
        sport,
        ...required
      } = row;
      const heartRate =
        averageHeartRate === null || maxHeartRate === null
          ? {}
          : { averageHeartRate, maxHeartRate };
      const common = {
        ...required,
        ...(effort === null ? {} : { effort }),
        ...heartRate,
      };
      if (sport === "swimming") {
        return { ...common, sport, ...(averageSwolf === null ? {} : { averageSwolf }) };
      }
      const power = averagePower === null || maxPower === null ? {} : { averagePower, maxPower };
      if (sport === "running") return { ...common, ...power, sport };
      return { ...common, ...power, sport };
    },
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
