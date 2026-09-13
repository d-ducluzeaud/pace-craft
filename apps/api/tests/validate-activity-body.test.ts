import { describe, expect, test } from "bun:test";
import { createActivityBodySchema } from "@pacecraft/contracts";
import { validateActivityBody } from "../src/http/validate-activity-body";

const ownerId = "019f3ed0-0000-7000-8000-000000000001";
const now = new Date("2026-09-13T12:00:00Z");
const requiredFacts = {
  startedAt: "2026-09-12T16:00:00+02:00",
  distanceMeters: 5000,
  durationSeconds: 1800,
};

describe("validateActivityBody", () => {
  test.each(["running", "cycling", "swimming"])(
    "converts %s input and adds the authenticated owner",
    (sport) => {
      const body = createActivityBodySchema.parse({ ...requiredFacts, sport });
      const result = validateActivityBody(body, ownerId, now);
      expect<unknown>(result).toEqual({
        ok: true,
        value: {
          ownerId,
          sport,
          startedAt: new Date("2026-09-12T14:00:00Z"),
          distanceMeters: 5000,
          durationSeconds: 1800,
        },
      });
      expect(body.startedAt).toBe(requiredFacts.startedAt);
    },
  );

  test.each(["running", "cycling"])("preserves optional measurements for %s", (sport) => {
    const measurements = {
      effort: 0,
      averageHeartRate: 150,
      maxHeartRate: 170,
      averagePower: 0,
      maxPower: 250.5,
    };
    const body = createActivityBodySchema.parse({ ...requiredFacts, sport, ...measurements });
    const result = validateActivityBody(body, ownerId, now);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toMatchObject(measurements);
  });

  test("preserves swimming measurements", () => {
    const measurements = { averageSwolf: 42.5, averageHeartRate: 140, maxHeartRate: 160 };
    const body = createActivityBodySchema.parse({
      ...requiredFacts,
      sport: "swimming",
      ...measurements,
    });
    const result = validateActivityBody(body, ownerId, now);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toMatchObject(measurements);
  });

  test("omits optional properties whose value is undefined", () => {
    const body = createActivityBodySchema.parse({
      ...requiredFacts,
      sport: "running",
      effort: undefined,
      averageHeartRate: undefined,
      maxHeartRate: undefined,
      averagePower: undefined,
      maxPower: undefined,
    });
    const result = validateActivityBody(body, ownerId, now);
    expect(result.ok).toBe(true);
    if (result.ok) {
      for (const key of [
        "effort",
        "averageHeartRate",
        "maxHeartRate",
        "averagePower",
        "maxPower",
      ]) {
        expect(Object.hasOwn(result.value, key)).toBe(false);
      }
    }
  });

  test.each(["2026-09-13T12:00:00Z", "2026-09-14T12:00:00Z"])(
    "returns the domain error for a non-past date %s",
    (startedAt) => {
      const body = createActivityBodySchema.parse({
        ...requiredFacts,
        sport: "running",
        startedAt,
      });
      expect(validateActivityBody(body, ownerId, now)).toEqual({
        ok: false,
        error: "invalid_started_at",
      });
    },
  );

  test("does not discard an incomplete heart rate pair allowed by the inferred HTTP type", () => {
    const body = createActivityBodySchema.parse({ ...requiredFacts, sport: "running" });
    expect(validateActivityBody({ ...body, averageHeartRate: 150 }, ownerId, now)).toEqual({
      ok: false,
      error: "invalid_heart_rate",
    });
  });

  test("does not discard an incomplete power pair allowed by the inferred HTTP type", () => {
    const body = createActivityBodySchema.parse({ ...requiredFacts, sport: "running" });
    if (body.sport !== "running") throw new Error("Expected running input");
    expect(validateActivityBody({ ...body, maxPower: 250 }, ownerId, now)).toEqual({
      ok: false,
      error: "invalid_power",
    });
  });
});
