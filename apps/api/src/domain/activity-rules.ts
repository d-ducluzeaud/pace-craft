import type { ActivityValidationResult, CreateActivityInput } from "./activity";

export function isActivityInPast(startedAt: Date, now: Date) {
  return startedAt < now;
}

export function isPositiveInteger(value: number) {
  return Number.isSafeInteger(value) && value > 0;
}

export function isValidEffort(effort: number) {
  return Number.isInteger(effort) && effort >= 0 && effort <= 10;
}

export function isValidHeartRate(average?: number, maximum?: number) {
  if (average === undefined && maximum === undefined) return true;
  if (maximum === undefined || average === undefined) return false;
  if (!isPositiveInteger(average) || !isPositiveInteger(maximum)) return false;
  return average <= maximum;
}

export function validateActivity(input: CreateActivityInput, now: Date): ActivityValidationResult {
  if (!isActivityInPast(input.startedAt, now)) {
    return { ok: false, error: "invalid_started_at" };
  }
  if (!isPositiveInteger(input.distanceMeters)) {
    return { ok: false, error: "invalid_distance" };
  }
  if (!isPositiveInteger(input.durationSeconds)) {
    return { ok: false, error: "invalid_duration" };
  }

  if (input.durationSeconds > (now.getTime() - input.startedAt.getTime()) / 1000) {
    return { ok: false, error: "activity_not_completed" };
  }

  if (input.effort !== undefined && !isValidEffort(input.effort)) {
    return { ok: false, error: "invalid_effort" };
  }
  if (!isValidHeartRate(input.averageHeartRate, input.maxHeartRate)) {
    return { ok: false, error: "invalid_heart_rate" };
  }

  const { averagePower, maxPower, averageSwolf } = input;
  if (input.sport === "swimming") {
    if (averagePower !== undefined || maxPower !== undefined) {
      return { ok: false, error: "invalid_power" };
    }
  } else if (averagePower !== undefined || maxPower !== undefined) {
    if (
      averagePower === undefined ||
      maxPower === undefined ||
      !Number.isFinite(averagePower) ||
      !Number.isFinite(maxPower) ||
      averagePower < 0 ||
      maxPower < 0 ||
      averagePower > maxPower
    ) {
      return { ok: false, error: "invalid_power" };
    }
  }
  if (
    averageSwolf !== undefined &&
    (input.sport !== "swimming" || !Number.isFinite(averageSwolf) || averageSwolf <= 0)
  ) {
    return { ok: false, error: "invalid_swolf" };
  }

  return { ok: true, value: input };
}
