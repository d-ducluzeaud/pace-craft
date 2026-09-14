import { expect } from "bun:test";
import type { ActivityResponse, ProblemDetails } from "@pacecraft/contracts";
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

databaseTest("GET /activities returns only the current owner's activities", () => {
  return withTestDatabase(async ({ client, databaseUrl }) => {
    const store = createDrizzleActivityStore(databaseUrl);
    const aliceId = crypto.randomUUID();
    const bobId = crypto.randomUUID();

    try {
      await insertActivityFixture(client, { ownerId: bobId });
      const aliceFirstActivity = await insertActivityFixture(client, { ownerId: aliceId });
      const aliceSecondActivity = await insertActivityFixture(client, { ownerId: aliceId });

      const app = await buildApp({
        readinessProbe: { async check() {} },
        activityReader: store,
        developmentOwnerId: aliceId,
      });

      try {
        const owned = await app.inject(
          "/activities?from=2020-01-01T00:00:00Z&to=2020-02-01T00:00:00Z",
        );
        expect(owned.statusCode).toBe(200);

        const activities = owned.json<Array<{ id: string }>>();
        expect(activities.map((activity) => activity.id).sort()).toEqual(
          [aliceFirstActivity.id, aliceSecondActivity.id].sort(),
        );
      } finally {
        await app.close();
      }
    } finally {
      await store.close();
    }
  });
});

databaseTest(
  "GET /activities returns an empty array when only another owner has activities",
  () => {
    return withTestDatabase(async ({ client, databaseUrl }) => {
      const store = createDrizzleActivityStore(databaseUrl);
      const aliceId = crypto.randomUUID();
      const bobId = crypto.randomUUID();

      try {
        await insertActivityFixture(client, { ownerId: bobId });

        const app = await buildApp({
          readinessProbe: { async check() {} },
          activityReader: store,
          developmentOwnerId: aliceId,
        });

        try {
          const response = await app.inject(
            "/activities?from=2020-01-01T00:00:00Z&to=2020-02-01T00:00:00Z",
          );
          expect(response.statusCode).toBe(200);
          const body = response.json<unknown>();
          expect(body).toEqual([]);
        } finally {
          await app.close();
        }
      } finally {
        await store.close();
      }
    });
  },
);

databaseTest("GET /activities returns newest activities first", () => {
  return withTestDatabase(async ({ client, databaseUrl }) => {
    const store = createDrizzleActivityStore(databaseUrl);
    const aliceId = crypto.randomUUID();

    try {
      const olderActivity = await insertActivityFixture(client, {
        ownerId: aliceId,
        startedAt: new Date("2020-01-01T10:00:00Z"),
      });
      const newerActivity = await insertActivityFixture(client, {
        ownerId: aliceId,
        startedAt: new Date("2020-01-02T10:00:00Z"),
      });

      const app = await buildApp({
        readinessProbe: { async check() {} },
        activityReader: store,
        developmentOwnerId: aliceId,
      });

      try {
        const response = await app.inject(
          "/activities?from=2020-01-01T00:00:00Z&to=2020-02-01T00:00:00Z",
        );
        expect(response.statusCode).toBe(200);
        const activities = response.json<ActivityResponse[]>();

        expect(activities.map((activity) => activity.id)).toEqual([
          newerActivity.id,
          olderActivity.id,
        ]);
      } finally {
        await app.close();
      }
    } finally {
      await store.close();
    }
  });
});

databaseTest("GET /activities orders equal start dates by descending id", () =>
  withTestDatabase(async ({ client, databaseUrl }) => {
    const store = createDrizzleActivityStore(databaseUrl);
    const aliceId = crypto.randomUUID();
    const startedAt = new Date("2020-01-01T10:00:00Z");

    try {
      const firstActivity = await insertActivityFixture(client, { ownerId: aliceId, startedAt });
      const secondActivity = await insertActivityFixture(client, { ownerId: aliceId, startedAt });
      const expectedIds = [firstActivity.id, secondActivity.id].sort().reverse();
      const app = await buildApp({
        readinessProbe: { async check() {} },
        activityReader: store,
        developmentOwnerId: aliceId,
      });

      try {
        const response = await app.inject(
          "/activities?from=2020-01-01T00:00:00Z&to=2020-02-01T00:00:00Z",
        );
        expect(response.statusCode).toBe(200);
        const activities = response.json<ActivityResponse[]>();
        expect(activities.map((activity) => activity.id)).toEqual(expectedIds);
      } finally {
        await app.close();
      }
    } finally {
      await store.close();
    }
  }),
);

databaseTest("GET /activities filters by sport while preserving ownership", () =>
  withTestDatabase(async ({ client, databaseUrl }) => {
    const store = createDrizzleActivityStore(databaseUrl);
    const aliceId = crypto.randomUUID();
    const bobId = crypto.randomUUID();

    try {
      const aliceRunning = await insertActivityFixture(client, {
        ownerId: aliceId,
        sport: "running",
      });
      await insertActivityFixture(client, { ownerId: aliceId, sport: "cycling" });
      await insertActivityFixture(client, { ownerId: bobId, sport: "running" });
      const app = await buildApp({
        readinessProbe: { async check() {} },
        activityReader: store,
        developmentOwnerId: aliceId,
      });

      try {
        const response = await app.inject(
          "/activities?sport=running&from=2020-01-01T00:00:00Z&to=2020-02-01T00:00:00Z",
        );
        expect(response.statusCode).toBe(200);
        const activities = response.json<ActivityResponse[]>();
        expect(activities.map((activity) => activity.id)).toEqual([aliceRunning.id]);
      } finally {
        await app.close();
      }
    } finally {
      await store.close();
    }
  }),
);

databaseTest("history combines sports, offset bounds, stable order and result limits", () =>
  withTestDatabase(async ({ client, databaseUrl }) => {
    const store = createDrizzleActivityStore(databaseUrl);
    const ownerId = crypto.randomUUID();
    const from = new Date("2020-01-01T00:00:00Z");
    const to = new Date("2020-01-02T00:00:00Z");
    try {
      const included = [];
      for (const sport of ["running", "cycling", "swimming"] as const) {
        const activity = await insertActivityFixture(client, { ownerId, sport, startedAt: from });
        included.push({ ...activity, sport });
        await insertActivityFixture(client, { ownerId, sport, startedAt: to });
        await insertActivityFixture(client, {
          ownerId,
          sport,
          startedAt: new Date(from.getTime() - 1),
        });
        await insertActivityFixture(client, {
          ownerId: crypto.randomUUID(),
          sport,
          startedAt: from,
        });
      }
      const app = await buildApp({
        readinessProbe: { async check() {} },
        activityReader: store,
        developmentOwnerId: ownerId,
      });
      try {
        const query = new URLSearchParams({
          from: "2020-01-01T02:00:00+02:00",
          to: to.toISOString(),
        });
        for (const activity of included) {
          const response = await app.inject(`/activities?${query}&sport=${activity.sport}`);
          expect(response.statusCode).toBe(200);
          expect(response.json<ActivityResponse[]>().map((row) => row.id)).toEqual([activity.id]);
          expect(response.headers["x-has-more"]).toBe("false");
        }
        const expected = included
          .map((row) => row.id)
          .sort()
          .reverse();
        const limited = await app.inject(`/activities?${query}&limit=2`);
        expect(limited.statusCode).toBe(200);
        expect(limited.json<ActivityResponse[]>().map((row) => row.id)).toEqual(
          expected.slice(0, 2),
        );
        expect(limited.headers["x-has-more"]).toBe("true");
        const exact = await app.inject(`/activities?${query}&limit=3`);
        expect(exact.json<ActivityResponse[]>().map((row) => row.id)).toEqual(expected);
        expect(exact.headers["x-has-more"]).toBe("false");
        const empty = await app.inject(
          "/activities?from=2021-01-01T00:00:00Z&to=2021-01-02T00:00:00Z&sport=running",
        );
        expect(empty.statusCode).toBe(200);
        expect(empty.json<unknown>()).toEqual([]);
      } finally {
        await app.close();
      }
    } finally {
      await store.close();
    }
  }),
);
