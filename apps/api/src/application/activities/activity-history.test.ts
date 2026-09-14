import { expect, test } from "bun:test";
import { resolveHistoryRange } from "./activity-history";

const now = new Date("2024-03-31T12:34:56.789Z");
test.each([
  ["1y", "2023-03-31T12:34:56.789Z"],
  ["6m", "2023-09-30T12:34:56.789Z"],
  ["3m", "2023-12-31T12:34:56.789Z"],
  ["1m", "2024-02-29T12:34:56.789Z"],
  ["1w", "2024-03-24T12:34:56.789Z"],
] as const)("history resolves calendar period %s", (period, from) => {
  expect(resolveHistoryRange({ period }, now)).toEqual({ from: new Date(from), to: now });
  expect(now.toISOString()).toBe("2024-03-31T12:34:56.789Z");
});
test("history defaults to one month and clamps leap day to February 28", () => {
  expect(resolveHistoryRange({}, now)).toEqual(resolveHistoryRange({ period: "1m" }, now));
  expect(resolveHistoryRange({ period: "1y" }, new Date("2024-02-29T12:00:00Z"))).toEqual({
    from: new Date("2023-02-28T12:00:00Z"),
    to: new Date("2024-02-29T12:00:00Z"),
  });
});
test("today is a complete UTC day, including at midnight", () => {
  for (const time of ["2024-03-31T00:00:00Z", "2024-03-31T23:59:59Z"]) {
    expect(resolveHistoryRange({ period: "today" }, new Date(time))).toEqual({
      from: new Date("2024-03-31T00:00:00Z"),
      to: new Date("2024-04-01T00:00:00Z"),
    });
  }
});
test("explicit range accepts exactly 366 days and rejects one extra millisecond", () => {
  expect(resolveHistoryRange({ from: "2024-01-01Z", to: "2025-01-01Z" }, now)).toBeDefined();
  expect(
    resolveHistoryRange({ from: "2024-01-01Z", to: "2025-01-01T00:00:00.001Z" }, now),
  ).toBeUndefined();
});
