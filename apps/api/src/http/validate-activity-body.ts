import type { CreateActivityBody } from "@pacecraft/contracts";
import type { ActivityValidationResult, CreateActivityBase } from "../domain/activity";
import { validateActivity } from "../domain/activity-rules";

// The caller supplies a schema-validated body and the authenticated user's ID.
export function validateActivityBody(
  body: CreateActivityBody,
  ownerId: string,
  now: Date,
): ActivityValidationResult {
  const { averageHeartRate, maxHeartRate } = body;
  if ((averageHeartRate === undefined) !== (maxHeartRate === undefined)) {
    return { ok: false, error: "invalid_heart_rate" };
  }
  const heartRate =
    averageHeartRate !== undefined && maxHeartRate !== undefined
      ? { averageHeartRate, maxHeartRate }
      : {};
  const common: CreateActivityBase = {
    ownerId,
    startedAt: new Date(body.startedAt),
    durationSeconds: body.durationSeconds,
    distanceMeters: body.distanceMeters,
    ...(body.effort === undefined ? {} : { effort: body.effort }),
    ...heartRate,
  };

  if (body.sport === "swimming") {
    return validateActivity(
      {
        ...common,
        sport: "swimming",
        ...(body.averageSwolf === undefined ? {} : { averageSwolf: body.averageSwolf }),
      },
      now,
    );
  }

  const { averagePower, maxPower } = body;
  if ((averagePower === undefined) !== (maxPower === undefined)) {
    return { ok: false, error: "invalid_power" };
  }
  const power =
    averagePower !== undefined && maxPower !== undefined ? { averagePower, maxPower } : {};

  if (body.sport === "running") {
    return validateActivity({ ...common, ...power, sport: "running" }, now);
  }
  return validateActivity({ ...common, ...power, sport: "cycling" }, now);
}
