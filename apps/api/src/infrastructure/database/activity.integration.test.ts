import { expect } from "bun:test";
import type { ProblemDetails } from "@pacecraft/contracts";
import { buildApp } from "../../app";
import { createDrizzleActivityStore } from "./drizzle-activity-store";

import { insertActivityFixture } from "./testing/activity-fixture";
import { databaseTest, withTestDatabase } from "./testing/test-database";

databaseTest(
  "persists each sport with database-generated values and enforces measurement constraints",
  () =>
    withTestDatabase(async ({ client, databaseUrl }) => {
      const writer = createDrizzleActivityStore(databaseUrl);
      const ownerId = crypto.randomUUID();
      const base = {
        ownerId,
        startedAt: new Date("2020-01-01Z"),
        effort: 0,
        averageHeartRate: 140,
        maxHeartRate: 170,
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
          expect(await writer.findOwned(activity.id, ownerId)).toEqual(activity);
          expect(await writer.findOwned(activity.id.toUpperCase(), ownerId.toUpperCase())).toEqual(
            activity,
          );
          expect(await writer.findOwned(activity.id, crypto.randomUUID())).toBeUndefined();
          const [row] =
            await client`SELECT owner_id, sport, average_swolf, average_power FROM activities WHERE id = ${activity.id}`;
          expect(row.owner_id).toBe(ownerId);
          expect(row.sport).toBe(sport);
          expect(row.average_swolf).toBe(sport === "swimming" ? 40 : null);
          expect(row.average_power).toBe(sport === "swimming" ? null : 180);
        }
        const minimal = await writer.create({
          ownerId,
          sport: "running",
          startedAt: base.startedAt,
          durationSeconds: 1800,
          distanceMeters: 1000,
        });
        expect(await writer.findOwned(minimal.id, ownerId)).toEqual(minimal);
        const missingId = crypto.randomUUID();
        expect(await writer.findOwned(missingId, ownerId)).toBeUndefined();
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
        await writer.close();
      }
    }),
);

databaseTest("GET hides Bob's activity from Alice despite spoofed ownership", () =>
  withTestDatabase(async ({ client, databaseUrl }) => {
    const store = createDrizzleActivityStore(databaseUrl);
    const aliceId = crypto.randomUUID();
    const bobId = crypto.randomUUID();
    try {
      const bobActivity = await insertActivityFixture(client, { ownerId: bobId });
      const aliceActivity = await insertActivityFixture(client, { ownerId: aliceId });
      const app = await buildApp({
        readinessProbe: { async check() {} },
        activityReader: store,
        developmentOwnerId: aliceId,
      });
      try {
        // A successful owned read prevents an endpoint that always returns 404 from passing.
        const owned = await app.inject(`/activities/${aliceActivity.id}`);
        expect(owned.statusCode).toBe(200);
        expect(owned.json()).toMatchObject({ id: aliceActivity.id, ownerId: aliceId });

        const missingId = crypto.randomUUID();
        for (const spoofIdentity of [false, true]) {
          const query = spoofIdentity ? `?ownerId=${bobId}` : "";
          const headers = spoofIdentity ? { "x-owner-id": bobId } : {};
          const foreignUrl = `/activities/${bobActivity.id}${query}`;
          const foreign = await app.inject({ url: foreignUrl, headers });
          const missing = await app.inject({ url: `/activities/${missingId}${query}`, headers });

          expect(foreign.statusCode).toBe(404);
          expect(missing.statusCode).toBe(404);
          for (const response of [foreign, missing]) {
            expect(response.headers["content-type"]).toContain("application/problem+json");
            expect(response.json<ProblemDetails>()).toMatchObject({
              type: "about:blank",
              title: "Not Found",
              status: 404,
            });
          }
          expect(foreign.json<ProblemDetails>()).toEqual({
            ...missing.json<ProblemDetails>(),
            instance: foreignUrl,
          });
          const { instance: _instance, ...problem } = foreign.json<ProblemDetails>();
          expect(JSON.stringify(problem)).not.toContain(bobId);
          expect(foreign.body).not.toContain('"distanceMeters"');
        }
      } finally {
        await app.close();
      }
    } finally {
      await store.close();
    }
  }),
);
