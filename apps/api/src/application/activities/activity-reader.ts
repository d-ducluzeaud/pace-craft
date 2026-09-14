import type { Activity } from "../../domain/activity";

export interface ActivityReader {
  findOwned(id: string, ownerId: string): Promise<Activity | undefined>;
}
