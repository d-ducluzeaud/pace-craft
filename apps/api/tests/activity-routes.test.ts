import { expect, mock, test } from "bun:test";
import { buildApp } from "../src/app";
import { loadEnvironment } from "../src/config";
import type { CreateActivityInput } from "../src/domain/activity";

const ownerId = "019f3ed0-0000-7000-8000-000000000001";
const id = "019f3ed0-0000-7000-8000-000000000002";
const body = {
  sport: "running",
  startedAt: "2020-01-01T10:00:00+02:00",
  durationSeconds: 1800,
  distanceMeters: 5000,
};
const readinessProbe = { async check() {} };
const create = () =>
  mock(async (input: CreateActivityInput) => ({
    ...input,
    id,
    createdAt: new Date("2026-01-01Z"),
    updatedAt: new Date("2026-01-01Z"),
  }));

test.each(["running", "cycling", "swimming"])(
  "POST persists %s with server ownership and returns its location",
  async (sport) => {
    const write = create();
    const app = await buildApp({
      readinessProbe,
      developmentOwnerId: ownerId,
      activityWriter: { create: write },
    });
    try {
      const response = await app.inject({
        method: "POST",
        url: "/activities",
        payload: { ...body, sport },
      });
      expect(response.statusCode).toBe(201);
      expect(response.headers.location).toBe(`/activities/${id}`);
      expect(response.json()).toMatchObject({
        id,
        ownerId,
        sport,
        startedAt: "2020-01-01T08:00:00.000Z",
      });
      expect(write).toHaveBeenCalledTimes(1);
      expect(write.mock.calls[0]?.[0].startedAt).toEqual(new Date(body.startedAt));
    } finally {
      await app.close();
    }
  },
);

test.each([
  ["negative distance", { distanceMeters: -100 }],
  ["future date", { startedAt: "2999-01-01T00:00:00Z" }],
  ["UTC year zero", { startedAt: "0000-01-01T00:00:00Z" }],
  ["timezone offset crossing into year zero", { startedAt: "0001-01-01T00:00:00+02:00" }],
  ["client ownership", { ownerId }],
  ["incomplete heart rate", { averageHeartRate: 150 }],
  ["swimming power", { sport: "swimming", averagePower: 100, maxPower: 200 }],
])("POST rejects %s before persistence", async (_label, invalid) => {
  const write = create();
  const app = await buildApp({
    readinessProbe,
    developmentOwnerId: ownerId,
    activityWriter: { create: write },
  });
  try {
    const response = await app.inject({
      method: "POST",
      url: "/activities",
      payload: { ...body, ...invalid },
    });
    expect(response.statusCode).toBe(400);
    expect(response.headers["content-type"]).toContain("application/problem+json");
    expect(write).not.toHaveBeenCalled();
  } finally {
    await app.close();
  }
});

test("POST requires server identity and ignores spoofed identity headers", async () => {
  const write = create();
  const app = await buildApp({ readinessProbe, activityWriter: { create: write } });
  try {
    const response = await app.inject({
      method: "POST",
      url: "/activities",
      payload: body,
      headers: { "x-owner-id": ownerId },
    });
    expect(response.statusCode).toBe(401);
    expect(write).not.toHaveBeenCalled();
  } finally {
    await app.close();
  }
});

test("POST hides persistence failure details", async () => {
  const app = await buildApp({
    readinessProbe,
    developmentOwnerId: ownerId,
    activityWriter: {
      async create() {
        throw new Error("database secret");
      },
    },
  });
  try {
    const response = await app.inject({ method: "POST", url: "/activities", payload: body });
    expect(response.statusCode).toBe(500);
    expect(response.body).not.toContain("secret");
  } finally {
    await app.close();
  }
});

test("development identity cannot be enabled in production", () => {
  const environment = { DATABASE_URL: "postgresql://localhost/pacecraft", DEV_ATHLETE_ID: ownerId };
  expect(() => loadEnvironment(environment)).toThrow();
  expect(() => loadEnvironment({ ...environment, NODE_ENV: "production" })).toThrow();
  expect(loadEnvironment({ ...environment, NODE_ENV: "development" }).DEV_ATHLETE_ID).toBe(ownerId);
});
