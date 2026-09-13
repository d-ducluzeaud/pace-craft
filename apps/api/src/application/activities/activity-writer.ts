import type { Activity, CreateActivityInput } from "../../domain/activity";

export interface ActivityWriter {
  create(input: CreateActivityInput): Promise<Activity>;
}
