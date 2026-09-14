import { expect, mock, test } from "bun:test";
import type { ProblemDetails } from "@pacecraft/contracts";
import { buildApp } from "../src/app";
import { resolveHistoryRange } from "../src/application/activities/activity-history";
import type { ActivityFilters } from "../src/application/activities/activity-reader";
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
  ["unfinished activity", { startedAt: new Date(Date.now() - 1000).toISOString() }],
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

test("POST is unavailable without server identity and ignores spoofed identity headers", async () => {
  const write = create();
  const app = await buildApp({ readinessProbe, activityWriter: { create: write } });
  try {
    const response = await app.inject({
      method: "POST",
      url: "/activities",
      payload: body,
      headers: { "x-owner-id": ownerId },
    });
    expect(response.statusCode).toBe(503);
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

test("OpenAPI documents the created resource location", async () => {
  const app = await buildApp({ readinessProbe });
  try {
    await app.ready();
    expect(app.swagger()).toMatchObject({
      paths: {
        "/activities": {
          post: {
            responses: {
              "201": { headers: { Location: { required: true, schema: { type: "string" } } } },
            },
          },
        },
      },
    });
  } finally {
    await app.close();
  }
});

test.each(["running", "cycling", "swimming"] as const)(
  "GET returns the complete owned %s activity",
  async (sport) => {
    const common = {
      id,
      ownerId,
      startedAt: new Date(body.startedAt),
      durationSeconds: body.durationSeconds,
      distanceMeters: body.distanceMeters,
      effort: 0,
      averageHeartRate: 140,
      maxHeartRate: 170,
      createdAt: new Date("2026-01-01Z"),
      updatedAt: new Date("2026-01-02Z"),
    };
    const activity =
      sport === "swimming"
        ? { ...common, sport, averageSwolf: 42.5 }
        : { ...common, sport, averagePower: 0, maxPower: 300.5 };
    const findOwned = mock(async () => activity);
    const app = await buildApp({
      readinessProbe,
      developmentOwnerId: ownerId,
      activityReader: {
        findOwned,
        async listOwned() {
          return [];
        },
      },
    });
    try {
      const response = await app.inject({
        method: "GET",
        url: `/activities/${id}?ownerId=spoofed`,
        headers: { "x-owner-id": "spoofed" },
      });
      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual(JSON.parse(JSON.stringify(activity)));
      expect(findOwned).toHaveBeenCalledWith(id, ownerId);
    } finally {
      await app.close();
    }
  },
);

test.each(["not-a-uuid", "123", "019f3ed0000070008000000000000002"])(
  "GET rejects malformed identifier %s before persistence",
  async (invalidId) => {
    const findOwned = mock(async () => undefined);
    const app = await buildApp({
      readinessProbe,
      developmentOwnerId: ownerId,
      activityReader: {
        findOwned,
        async listOwned() {
          return [];
        },
      },
    });
    try {
      const response = await app.inject(`/activities/${invalidId}`);
      expect(response.statusCode).toBe(400);
      expect(response.headers["content-type"]).toContain("application/problem+json");
      expect(response.json()).toMatchObject({
        type: "about:blank",
        status: 400,
        instance: `/activities/${invalidId}`,
      });
      expect(findOwned).not.toHaveBeenCalled();
    } finally {
      await app.close();
    }
  },
);

test("GET returns a standard 404 when no owned activity exists", async () => {
  const app = await buildApp({
    readinessProbe,
    developmentOwnerId: ownerId,
    activityReader: {
      async findOwned() {
        return undefined;
      },
      async listOwned() {
        return [];
      },
    },
  });
  try {
    const response = await app.inject(`/activities/${id}`);
    expect(response.statusCode).toBe(404);
    expect(response.headers["content-type"]).toContain("application/problem+json");
    expect(response.json<ProblemDetails>()).toEqual({
      type: "about:blank",
      title: "Not Found",
      status: 404,
      detail: "The requested resource does not exist.",
      instance: `/activities/${id}`,
    });
  } finally {
    await app.close();
  }
});

test("GET is unavailable without server identity despite spoofed headers", async () => {
  const findOwned = mock(async () => undefined);
  const app = await buildApp({
    readinessProbe,
    activityReader: {
      findOwned,
      async listOwned() {
        return [];
      },
    },
  });

  try {
    const response = await app.inject({
      url: `/activities/${id}`,
      headers: { "x-owner-id": ownerId },
    });
    expect(response.statusCode).toBe(503);
    expect(response.headers["content-type"]).toContain("application/problem+json");
    expect(findOwned).not.toHaveBeenCalled();
  } finally {
    await app.close();
  }
});

test("GET reports unavailable storage", async () => {
  const app = await buildApp({ readinessProbe, developmentOwnerId: ownerId });
  try {
    const response = await app.inject(`/activities/${id}`);
    expect(response.statusCode).toBe(503);
    expect(response.headers["content-type"]).toContain("application/problem+json");
    expect(response.json().status).toBe(503);
  } finally {
    await app.close();
  }
});

test("GET hides persistence failure details", async () => {
  const app = await buildApp({
    readinessProbe,
    developmentOwnerId: ownerId,
    activityReader: {
      async findOwned() {
        throw new Error("database secret");
      },
      async listOwned() {
        return [];
      },
    },
  });
  try {
    const response = await app.inject(`/activities/${id}`);
    expect(response.statusCode).toBe(500);
    expect(response.headers["content-type"]).toContain("application/problem+json");
    expect(response.json<ProblemDetails>()).toEqual({
      type: "about:blank",
      title: "Internal Server Error",
      status: 500,
      instance: `/activities/${id}`,
    });
  } finally {
    await app.close();
  }
});

test("OpenAPI documents activity retrieval and every failure response", async () => {
  const app = await buildApp({ readinessProbe });
  try {
    await app.ready();
    expect(app.swagger()).toMatchObject({
      paths: {
        "/activities/{id}": {
          get: {
            parameters: [
              {
                name: "id",
                in: "path",
                required: true,
                schema: { type: "string", format: "uuid" },
              },
            ],
            responses: {
              "200": { content: { "application/json": { schema: expect.any(Object) } } },
              ...Object.fromEntries(
                [400, 404, 500, 503].map((status) => [
                  status,
                  { content: { "application/problem+json": { schema: expect.any(Object) } } },
                ]),
              ),
            },
          },
        },
      },
    });
  } finally {
    await app.close();
  }
});

test.each([
  "from=2020-01-01T00:00:00.0009Z&to=2020-02-01T00:00:00Z",
  "from=2020-01-01T00:00:00Z&to=2020-02-01T00:00:00.0009Z",
  "period=2y",
  "period=",
  "period=1m&from=2020-01-01T00:00:00Z&to=2020-02-01T00:00:00Z",
  "sport=football",
  "sport=",
  "sport=running&sport=cycling",
  "ownerId=spoofed",
  "from=bad&to=2020-02-01T00:00:00Z",
  "from=2020-01-01T00:00:00",
  "from=2020-01-01T00:00:00Z",
  "to=2020-01-01T00:00:00Z",
  "from=2020-01-02T00:00:00Z&to=2020-01-01T00:00:00Z",
  "from=2020-01-01T00:00:00Z&to=2020-01-01T00:00:00Z",
  "from=2020-01-01T00:00:00Z&to=2021-01-02T00:00:00Z",
  "limit=0",
  "limit=-1",
  "limit=201",
  "limit=1.5",
  "limit=abc",
  "limit=",
  "limit=1&limit=2",
])("history rejects invalid query %s before reading storage", async (query) => {
  const listOwned = mock(async () => []);
  const app = await buildApp({
    readinessProbe,
    developmentOwnerId: ownerId,
    activityReader: { findOwned: mock(async () => undefined), listOwned },
  });
  try {
    const response = await app.inject(`/activities?${query}`);
    expect(response.statusCode).toBe(400);
    expect(response.headers["content-type"]).toContain("application/problem+json");
    expect(response.json()).toMatchObject({
      type: "about:blank",
      title: "Bad Request",
      status: 400,
    });
    expect(listOwned).not.toHaveBeenCalled();
  } finally {
    await app.close();
  }
});

test("history resolves a bounded default window and ignores spoofed headers", async () => {
  const listOwned = mock(async (_ownerId: string, _filters: ActivityFilters) => []);
  const app = await buildApp({
    readinessProbe,
    developmentOwnerId: ownerId,
    activityReader: { findOwned: mock(async () => undefined), listOwned },
  });
  try {
    const before = new Date();
    const response = await app.inject({ url: "/activities", headers: { "x-owner-id": "spoofed" } });
    const after = new Date();
    expect(response.statusCode).toBe(200);
    expect(response.headers["x-has-more"]).toBe("false");
    expect(listOwned).toHaveBeenCalledWith(ownerId, {
      from: expect.any(Date),
      to: expect.any(Date),
      sport: undefined,
      limit: 101,
    });
    const filters = listOwned.mock.calls[0]?.[1];
    expect(filters).toBeDefined();
    if (filters === undefined) throw new Error("Expected history call");
    expect(filters.to.getTime()).toBeGreaterThanOrEqual(before.getTime());
    expect(filters.to.getTime()).toBeLessThanOrEqual(after.getTime());
    expect(filters.to.getTime() - filters.from.getTime()).toBeGreaterThanOrEqual(28 * 86_400_000);
    expect(filters.to.getTime() - filters.from.getTime()).toBeLessThanOrEqual(31 * 86_400_000);
  } finally {
    await app.close();
  }
});

test.each(["missing identity", "missing storage", "storage failure"])(
  "history handles %s with a sanitized problem",
  async (scenario) => {
    const listOwned = mock(async () => {
      throw new Error("database secret");
    });
    const app = await buildApp({
      readinessProbe,
      ...(scenario === "missing identity" ? {} : { developmentOwnerId: ownerId }),
      ...(scenario === "missing storage"
        ? {}
        : {
            activityReader: { findOwned: mock(async () => undefined), listOwned },
          }),
    });
    try {
      const response = await app.inject({ url: "/activities", headers: { "x-owner-id": ownerId } });
      const status = scenario === "storage failure" ? 500 : 503;
      expect(response.statusCode).toBe(status);
      expect(response.headers["content-type"]).toContain("application/problem+json");
      expect(response.json()).toMatchObject({
        type: "about:blank",
        status,
        instance: "/activities",
      });
      expect(response.body).not.toContain("secret");
      if (scenario !== "storage failure") expect(listOwned).not.toHaveBeenCalled();
    } finally {
      await app.close();
    }
  },
);

test.each(["1y", "6m", "3m", "1m", "1w", "today"] as const)(
  "history routes period %s to a normalized date range",
  async (period) => {
    const listOwned = mock(async (_ownerId: string, _filters: ActivityFilters) => []);
    const app = await buildApp({
      readinessProbe,
      developmentOwnerId: ownerId,
      activityReader: { findOwned: mock(async () => undefined), listOwned },
    });
    try {
      const response = await app.inject(`/activities?period=${period}&limit=200`);
      expect(response.statusCode).toBe(200);
      const filters = listOwned.mock.calls[0]?.[1];
      expect(filters).toBeDefined();
      if (filters === undefined) throw new Error("Expected history call");
      expect(filters.limit).toBe(201);
      if (period === "today") {
        expect(filters.from.getUTCHours()).toBe(0);
        expect(filters.to.getTime() - filters.from.getTime()).toBe(86_400_000);
      } else {
        const expected = resolveHistoryRange({ period }, filters.to);
        if (expected === undefined) throw new Error("Expected a valid preset");
        expect(filters.from).toEqual(expected.from);
      }
    } finally {
      await app.close();
    }
  },
);
