import type { SQL } from "bun";
import type { CreateActivityInput } from "../../../domain/activity";

// Only facts relevant to a scenario need overriding; ownership stays explicit.
export async function insertActivityFixture(
  client: SQL,
  input: { ownerId: string } & Partial<CreateActivityInput>,
): Promise<{ id: string; ownerId: string }> {
  const [activity] = await client`
    INSERT INTO activities (
      owner_id, sport, started_at, duration_seconds, distance_meters, effort,
      average_heart_rate, max_heart_rate, average_power, max_power, average_swolf
    ) VALUES (
      ${input.ownerId}, ${input.sport ?? "running"},
      ${input.startedAt ?? new Date("2020-01-01T00:00:00Z")},
      ${input.durationSeconds ?? 1800}, ${input.distanceMeters ?? 5000},
      ${input.effort ?? null}, ${input.averageHeartRate ?? null}, ${input.maxHeartRate ?? null},
      ${input.averagePower ?? null}, ${input.maxPower ?? null}, ${input.averageSwolf ?? null}
    ) RETURNING id, owner_id AS "ownerId"
  `;
  if (activity === undefined) throw new Error("Activity fixture insert returned no row.");
  return activity;
}
