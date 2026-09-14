import { expect, test } from "bun:test";
import { SQL } from "bun";
import { createDrizzleActivityWriter } from "./drizzle-activity-writer";

const { DATABASE_URL: databaseUrl } = process.env;
const databaseTest = databaseUrl === undefined ? test.skip : test;

databaseTest(
  "persists each sport with database-generated values and enforces measurement constraints",
  async () => {
    if (databaseUrl === undefined) throw new Error("DATABASE_URL is required.");
    const client = new SQL(databaseUrl);
    const writer = createDrizzleActivityWriter(databaseUrl);
    const ownerId = crypto.randomUUID();
    const base = {
      ownerId,
      startedAt: new Date("2020-01-01Z"),
      durationSeconds: 1800,
      distanceMeters: 1000,
    };
    try {
      for (const sport of ["running", "cycling", "swimming"] as const) {
        const input =
          sport === "swimming"
            ? { ...base, sport, averageSwolf: 40 }
            : sport === "running"
              ? { ...base, sport, averagePower: 180, maxPower: 300 }
              : { ...base, sport, averagePower: 180, maxPower: 300 };
        const activity = await writer.create(input);
        expect(activity.id).toMatch(
          /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
        );
        expect(activity.createdAt).toEqual(activity.updatedAt);
        const [row] =
          await client`SELECT owner_id, sport, average_swolf, average_power FROM activities WHERE id = ${activity.id}`;
        expect(row.owner_id).toBe(ownerId);
        expect(row.sport).toBe(sport);
        expect(row.average_swolf).toBe(sport === "swimming" ? 40 : null);
        expect(row.average_power).toBe(sport === "swimming" ? null : 180);
      }
      await expect(
        writer.create({ ...base, sport: "running", startedAt: new Date(Date.now() - 1000) }),
      ).rejects.toThrow();
      await expect(
        writer.create({ ...base, sport: "running", distanceMeters: -100 }),
      ).rejects.toThrow();
      await expect(
        writer.create({ ...base, sport: "running", averageHeartRate: 170, maxHeartRate: 140 }),
      ).rejects.toThrow();
      await expect(
        writer.create({ ...base, sport: "cycling", averagePower: 180, maxPower: Infinity }),
      ).rejects.toThrow();
      await expect(
        client`INSERT INTO activities (owner_id, sport, started_at, duration_seconds, distance_meters, average_heart_rate) VALUES (${ownerId}, 'running', '2020-01-01Z', 1800, 1000, 140)`.execute(),
      ).rejects.toThrow();
      await expect(
        client`INSERT INTO activities (owner_id, sport, started_at, duration_seconds, distance_meters, average_power, max_power) VALUES (${ownerId}, 'swimming', '2020-01-01Z', 1800, 1000, 100, 200)`.execute(),
      ).rejects.toThrow();
    } finally {
      try {
        await client`DELETE FROM activities WHERE owner_id = ${ownerId}`;
      } finally {
        await Promise.all([writer.close(), client.close()]);
      }
    }
  },
);
