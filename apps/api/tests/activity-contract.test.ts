import { describe, expect, test } from "bun:test";
import { activityResponseSchema, createActivityBodySchema } from "@pacecraft/contracts";

const requiredFacts = {
  startedAt: "2026-09-12T14:00:00Z",
  durationSeconds: 1800,
  distanceMeters: 5000,
};

describe("createActivityBodySchema", () => {
  test.each(["running", "cycling", "swimming"] as const)(
    "accepts minimal %s input and preserves its ISO date",
    (sport) => {
      const body = { ...requiredFacts, sport };
      expect(createActivityBodySchema.parse(body)).toEqual(body);
    },
  );

  test.each([
    { label: "timezone offset", fields: { startedAt: "2026-09-12T16:00:00+02:00" } },
    { label: "earliest supported UTC year", fields: { startedAt: "0001-01-01T00:00:00Z" } },
    { label: "zero effort", fields: { effort: 0 } },
    { label: "maximum effort", fields: { effort: 10 } },
    { label: "equal heart rates", fields: { averageHeartRate: 150, maxHeartRate: 150 } },
    { label: "small heart rate gap", fields: { averageHeartRate: 148, maxHeartRate: 150 } },
  ])("accepts $label", ({ fields }) => {
    const body = { ...requiredFacts, sport: "running" as const, ...fields };
    expect(createActivityBodySchema.parse(body)).toEqual(body);
  });

  test.each(["running", "cycling"] as const)("accepts power for %s", (sport) => {
    for (const power of [
      { averagePower: 0, maxPower: 0 },
      { averagePower: 180.5, maxPower: 300 },
    ]) {
      const body = { ...requiredFacts, sport, ...power };
      expect(createActivityBodySchema.parse(body)).toEqual(body);
    }
  });

  test("accepts fractional SWOLF for swimming", () => {
    const body = { ...requiredFacts, sport: "swimming" as const, averageSwolf: 42.5 };
    expect(createActivityBodySchema.parse(body)).toEqual(body);
  });

  test.each([
    { label: "unknown sport", fields: { sport: "walking" } },
    { label: "missing sport", fields: { sport: undefined } },
    { label: "missing date", fields: { startedAt: undefined } },
    { label: "date without timezone", fields: { startedAt: "2026-09-12T14:00:00" } },
    { label: "invalid calendar date", fields: { startedAt: "2026-02-30T14:00:00Z" } },
    { label: "Date object instead of ISO string", fields: { startedAt: new Date() } },
    { label: "missing distance", fields: { distanceMeters: undefined } },
    { label: "zero distance", fields: { distanceMeters: 0 } },
    { label: "fractional distance", fields: { distanceMeters: 1.5 } },
    { label: "numeric string distance", fields: { distanceMeters: "5000" } },
    { label: "infinite distance", fields: { distanceMeters: Number.POSITIVE_INFINITY } },
    { label: "missing duration", fields: { durationSeconds: undefined } },
    { label: "negative duration", fields: { durationSeconds: -1 } },
    { label: "fractional duration", fields: { durationSeconds: 1.5 } },
    { label: "effort above ten", fields: { effort: 11 } },
    { label: "negative effort", fields: { effort: -1 } },
    { label: "fractional effort", fields: { effort: 5.5 } },
    { label: "null effort", fields: { effort: null } },
    { label: "zero average heart rate", fields: { averageHeartRate: 0, maxHeartRate: 150 } },
    {
      label: "fractional maximum heart rate",
      fields: { averageHeartRate: 150, maxHeartRate: 170.5 },
    },
    { label: "negative power", fields: { averagePower: -1, maxPower: 300 } },
    { label: "infinite power", fields: { averagePower: 180, maxPower: Number.POSITIVE_INFINITY } },
  ])("rejects $label", ({ fields }) => {
    expect(
      createActivityBodySchema.safeParse({ ...requiredFacts, sport: "running", ...fields }).success,
    ).toBe(false);
  });

  test.each([
    {
      label: "missing maximum heart rate",
      fields: { averageHeartRate: 150 },
      path: "maxHeartRate",
    },
    {
      label: "missing average heart rate",
      fields: { maxHeartRate: 170 },
      path: "averageHeartRate",
    },
    {
      label: "average heart rate above maximum",
      fields: { averageHeartRate: 180, maxHeartRate: 170 },
      path: "averageHeartRate",
    },
    { label: "missing maximum power", fields: { averagePower: 180 }, path: "maxPower" },
    { label: "missing average power", fields: { maxPower: 300 }, path: "averagePower" },
    {
      label: "average power above maximum",
      fields: { averagePower: 301, maxPower: 300 },
      path: "averagePower",
    },
  ])("reports the field for $label", ({ fields, path }) => {
    const result = createActivityBodySchema.safeParse({
      ...requiredFacts,
      sport: "running",
      ...fields,
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues).toContainEqual(
        expect.objectContaining({ path: [path], code: "custom" }),
      );
    }
  });

  test.each(["running", "cycling", "swimming"] as const)(
    "rejects server-owned and unknown fields for %s",
    (sport) => {
      for (const key of ["id", "ownerId", "createdAt", "updatedAt", "unexpected"]) {
        const result = createActivityBodySchema.safeParse({
          ...requiredFacts,
          sport,
          [key]: "injected",
        });
        expect(result.success).toBe(false);
        if (!result.success) {
          expect(result.error.issues).toContainEqual(
            expect.objectContaining({ code: "unrecognized_keys", keys: [key] }),
          );
        }
      }
    },
  );

  test.each(["averagePower", "maxPower"])("rejects %s for swimming", (key) => {
    expect(
      createActivityBodySchema.safeParse({ ...requiredFacts, sport: "swimming", [key]: 180 })
        .success,
    ).toBe(false);
  });

  test.each(["running", "cycling"] as const)("rejects SWOLF for %s", (sport) => {
    expect(
      createActivityBodySchema.safeParse({ ...requiredFacts, sport, averageSwolf: 42 }).success,
    ).toBe(false);
  });

  test.each([0, -1, Number.NaN, Number.POSITIVE_INFINITY, null])(
    "rejects invalid SWOLF %s",
    (averageSwolf) => {
      expect(
        createActivityBodySchema.safeParse({ ...requiredFacts, sport: "swimming", averageSwolf })
          .success,
      ).toBe(false);
    },
  );
});

describe("activityResponseSchema", () => {
  const generated = {
    id: "019f3ed0-0000-7000-8000-000000000001",
    ownerId: "019f3ed0-0000-7000-8000-000000000002",
    createdAt: "2026-09-13T12:00:00Z",
    updatedAt: "2026-09-13T12:00:00Z",
  };
  test.each([
    { label: "incomplete heart rate", fields: { averageHeartRate: 150 } },
    { label: "reversed heart rate", fields: { averageHeartRate: 180, maxHeartRate: 150 } },
    { label: "incomplete power", fields: { averagePower: 180 } },
    { label: "reversed power", fields: { averagePower: 300, maxPower: 180 } },
  ])("rejects $label in a server response", ({ fields }) => {
    expect(
      activityResponseSchema.safeParse({
        ...requiredFacts,
        ...generated,
        sport: "running",
        ...fields,
      }).success,
    ).toBe(false);
  });
});
