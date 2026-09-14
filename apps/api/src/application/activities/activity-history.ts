export type HistoryPeriod = "1y" | "6m" | "3m" | "1m" | "1w" | "today";
export const MAX_HISTORY_DAYS = 366;
export const DEFAULT_HISTORY_LIMIT = 100;
const DAY_MS = 86_400_000;

export function resolveHistoryRange(
  input: {
    period?: HistoryPeriod | undefined;
    from?: string | undefined;
    to?: string | undefined;
  },
  now: Date,
): { from: Date; to: Date } | undefined {
  if (input.from !== undefined || input.to !== undefined) {
    if (input.period !== undefined || input.from === undefined || input.to === undefined)
      return undefined;
    const from = new Date(input.from);
    const to = new Date(input.to);
    const duration = to.getTime() - from.getTime();
    if (!Number.isFinite(duration) || duration <= 0 || duration > MAX_HISTORY_DAYS * DAY_MS)
      return undefined;
    return { from, to };
  }
  const period = input.period ?? "1m";
  const to = new Date(now);
  const from = new Date(now);
  if (period === "today") {
    from.setUTCHours(0, 0, 0, 0);
    return { from, to: new Date(from.getTime() + DAY_MS) };
  }
  if (period === "1w") {
    return { from: new Date(to.getTime() - 7 * DAY_MS), to };
  }
  const months = { "1m": 1, "3m": 3, "6m": 6, "1y": 12 }[period];
  const day = from.getUTCDate();
  from.setUTCDate(1);
  from.setUTCMonth(from.getUTCMonth() - months);
  const monthEnd = new Date(from);
  monthEnd.setUTCMonth(monthEnd.getUTCMonth() + 1, 0);
  from.setUTCDate(Math.min(day, monthEnd.getUTCDate()));
  return { from, to };
}
