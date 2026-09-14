import { describe, expect, test } from "bun:test";
import type { CreateActivityInput } from "./activity";
import {
  isActivityInPast,
  isPositiveInteger,
  isValidEffort,
  isValidHeartRate,
  validateActivity,
} from "./activity-rules";

describe("validateActivity", () => {
  const now = new Date("1991-09-18T15:00:00Z");
  const input: CreateActivityInput = {
    ownerId: "019f3ed0-0000-7000-8000-000000000001",
    sport: "running",
    startedAt: new Date("1991-09-18T14:00:00Z"),
    distanceMeters: 5000,
    durationSeconds: 1800,
  };

  test("accepts valid required facts with optional measurements absent", () => {
    expect(validateActivity(input, now)).toEqual({ ok: true, value: input });
  });

  test.each([
    { label: "invalid date", startedAt: new Date(Number.NaN) },
    { label: "present date", startedAt: now },
    { label: "future date", startedAt: new Date("1991-09-18T16:00:00Z") },
  ])("rejects $label", ({ startedAt }) => {
    expect(validateActivity({ ...input, startedAt }, now)).toEqual({
      ok: false,
      error: "invalid_started_at",
    });
  });

  test.each([
    { durationSeconds: 3599, ok: true },
    { durationSeconds: 3600, ok: true },
    { durationSeconds: 3601, ok: false },
  ])("completion boundary: $durationSeconds seconds returns $ok", ({ durationSeconds, ok }) => {
    const activity = { ...input, durationSeconds };
    expect(validateActivity(activity, now)).toEqual(
      ok ? { ok: true, value: activity } : { ok: false, error: "activity_not_completed" },
    );
  });

  test("reports invalid_distance for zero distance", () => {
    expect(validateActivity({ ...input, distanceMeters: 0 }, now)).toEqual({
      ok: false,
      error: "invalid_distance",
    });
  });

  test("reports invalid_duration for zero duration", () => {
    expect(validateActivity({ ...input, durationSeconds: 0 }, now)).toEqual({
      ok: false,
      error: "invalid_duration",
    });
  });

  test("accepts an effort of zero", () => {
    const activity = { ...input, effort: 0 };
    expect(validateActivity(activity, now)).toEqual({ ok: true, value: activity });
  });

  test("reports invalid_effort for an effort above ten", () => {
    expect(validateActivity({ ...input, effort: 11 }, now)).toEqual({
      ok: false,
      error: "invalid_effort",
    });
  });

  test("accepts valid heart rate measurements", () => {
    const activity = { ...input, averageHeartRate: 150, maxHeartRate: 170 };
    expect(validateActivity(activity, now)).toEqual({ ok: true, value: activity });
  });

  test("reports invalid_heart_rate when the average exceeds the maximum", () => {
    expect(validateActivity({ ...input, averageHeartRate: 180, maxHeartRate: 170 }, now)).toEqual({
      ok: false,
      error: "invalid_heart_rate",
    });
  });

  test("reports invalid effort before invalid heart rate", () => {
    expect(
      validateActivity({ ...input, effort: 11, averageHeartRate: 180, maxHeartRate: 170 }, now),
    ).toEqual({ ok: false, error: "invalid_effort" });
  });

  test.each([
    { ...input, sport: "running", averagePower: 180.5, maxPower: 300 },
    { ...input, sport: "cycling", averagePower: 180.5, maxPower: 300 },
  ] satisfies CreateActivityInput[])("accepts power for $sport", (activity) => {
    expect(validateActivity(activity, now)).toEqual({ ok: true, value: activity });
  });

  test("accepts equal power measurements at zero", () => {
    const activity = { ...input, averagePower: 0, maxPower: 0 };
    expect(validateActivity(activity, now)).toEqual({ ok: true, value: activity });
  });

  test.each([
    { label: "average above maximum", averagePower: 301, maxPower: 300 },
    { label: "negative average", averagePower: -1, maxPower: 300 },
    { label: "negative maximum", averagePower: 180, maxPower: -1 },
    { label: "NaN average", averagePower: Number.NaN, maxPower: 300 },
    { label: "NaN maximum", averagePower: 180, maxPower: Number.NaN },
    { label: "infinite average", averagePower: Number.POSITIVE_INFINITY, maxPower: 300 },
    { label: "infinite maximum", averagePower: 180, maxPower: Number.POSITIVE_INFINITY },
  ])("rejects power with $label", ({ averagePower, maxPower }) => {
    expect(validateActivity({ ...input, averagePower, maxPower }, now)).toEqual({
      ok: false,
      error: "invalid_power",
    });
  });

  test("rejects a missing maximum power at runtime", () => {
    // @ts-expect-error Exercise a runtime violation of the paired measurements contract.
    expect(validateActivity({ ...input, averagePower: 180 }, now)).toEqual({
      ok: false,
      error: "invalid_power",
    });
  });

  test("rejects a missing average power at runtime", () => {
    // @ts-expect-error Exercise a runtime violation of the paired measurements contract.
    expect(validateActivity({ ...input, maxPower: 300 }, now)).toEqual({
      ok: false,
      error: "invalid_power",
    });
  });

  test("rejects power for swimming at runtime", () => {
    expect(
      // @ts-expect-error Exercise a runtime violation of the sport-specific contract.
      validateActivity({ ...input, sport: "swimming", averagePower: 180, maxPower: 300 }, now),
    ).toEqual({ ok: false, error: "invalid_power" });
  });

  test("accepts swimming without optional measurements", () => {
    const activity: CreateActivityInput = { ...input, sport: "swimming" };
    expect(validateActivity(activity, now)).toEqual({ ok: true, value: activity });
  });

  test("accepts a fractional average SWOLF for swimming", () => {
    const activity: CreateActivityInput = { ...input, sport: "swimming", averageSwolf: 42.5 };
    expect(validateActivity(activity, now)).toEqual({ ok: true, value: activity });
  });

  test.each([0, -1, Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY])(
    "rejects invalid average SWOLF %s",
    (averageSwolf) => {
      expect(validateActivity({ ...input, sport: "swimming", averageSwolf }, now)).toEqual({
        ok: false,
        error: "invalid_swolf",
      });
    },
  );

  test.each(["running", "cycling"] as const)("rejects SWOLF for %s at runtime", (sport) => {
    // @ts-expect-error Exercise a runtime violation of the sport-specific contract.
    expect(validateActivity({ ...input, sport, averageSwolf: 42 }, now)).toEqual({
      ok: false,
      error: "invalid_swolf",
    });
  });

  test("reports the first error in date, distance, duration order", () => {
    expect(
      validateActivity({ ...input, startedAt: now, distanceMeters: 0, durationSeconds: 0 }, now),
    ).toEqual({ ok: false, error: "invalid_started_at" });
    expect(validateActivity({ ...input, distanceMeters: 0, durationSeconds: 0 }, now)).toEqual({
      ok: false,
      error: "invalid_distance",
    });
  });
});

describe("isActivityInPast", () => {
  const now = new Date("1991-09-18T15:00:00Z");

  test.each([
    { position: "before", startedAt: "1991-09-18T14:00:00Z", expected: true },
    {
      position: "equal to",
      startedAt: "1991-09-18T15:00:00Z",
      expected: false,
    },
    { position: "after", startedAt: "1991-09-18T16:00:00Z", expected: false },
  ])("returns $expected when startedAt is $position now", ({ startedAt, expected }) => {
    expect(isActivityInPast(new Date(startedAt), now)).toBe(expected);
  });
});

describe("isPositiveInteger", () => {
  test.each([
    { value: 1, expected: true },
    { value: 15, expected: true },
    { value: Number.MAX_SAFE_INTEGER, expected: true },
    { value: Number.MAX_SAFE_INTEGER + 1, expected: false },
    { value: 0, expected: false },
    { value: -1, expected: false },
    { value: 12.5, expected: false },
    { value: Number.NaN, expected: false },
    { value: Number.POSITIVE_INFINITY, expected: false },
    { value: Number.NEGATIVE_INFINITY, expected: false },
  ])("returns $expected for $value", ({ value, expected }) => {
    expect(isPositiveInteger(value)).toBe(expected);
  });
});

describe("isValidEffort", () => {
  test.each([
    { value: 0, expected: true },
    { value: 5, expected: true },
    { value: 10, expected: true },
    { value: -1, expected: false },
    { value: 5.5, expected: false },
    { value: 11, expected: false },
  ])("returns $expected for $value", ({ value, expected }) => {
    expect(isValidEffort(value)).toBe(expected);
  });
});

describe("isValidHeartRate", () => {
  test.each([
    {
      label: "accepts absent measurements",
      average: undefined,
      maximum: undefined,
      expected: true,
    },
    { label: "accepts an average below the maximum", average: 150, maximum: 198, expected: true },
    { label: "accepts equal measurements", average: 150, maximum: 150, expected: true },
    { label: "accepts a gap below five bpm", average: 148, maximum: 150, expected: true },
    { label: "rejects a missing maximum", average: 150, maximum: undefined, expected: false },
    { label: "rejects a missing average", average: undefined, maximum: 198, expected: false },
    { label: "rejects an average above the maximum", average: 150, maximum: 130, expected: false },
    { label: "rejects a negative average", average: -120, maximum: 130, expected: false },
    { label: "rejects a negative maximum", average: 120, maximum: -130, expected: false },
    { label: "rejects two negative measurements", average: -120, maximum: -130, expected: false },
    { label: "rejects a fractional average", average: 5.5, maximum: 130, expected: false },
    { label: "rejects a fractional maximum", average: 55, maximum: 130.2, expected: false },
    { label: "rejects a NaN average", average: Number.NaN, maximum: 130, expected: false },
    { label: "rejects a NaN maximum", average: 120, maximum: Number.NaN, expected: false },
    { label: "rejects a zero average", average: 0, maximum: 130, expected: false },
    { label: "rejects a zero maximum", average: 120, maximum: 0, expected: false },
    {
      label: "rejects a positive infinite average",
      average: Number.POSITIVE_INFINITY,
      maximum: 130,
      expected: false,
    },
    {
      label: "rejects a positive infinite maximum",
      average: 120,
      maximum: Number.POSITIVE_INFINITY,
      expected: false,
    },
    {
      label: "rejects a negative infinite average",
      average: Number.NEGATIVE_INFINITY,
      maximum: 130,
      expected: false,
    },
    {
      label: "rejects a negative infinite maximum",
      average: 120,
      maximum: Number.NEGATIVE_INFINITY,
      expected: false,
    },
  ])("$label", ({ average, maximum, expected }) => {
    expect(isValidHeartRate(average, maximum)).toBe(expected);
  });
});
