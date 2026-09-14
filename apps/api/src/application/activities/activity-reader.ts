import type { Activity } from "../../domain/activity";

export type ActivityFilters = {
  from: Date;
  to: Date;
  limit: number;
  sport?: Activity["sport"] | undefined;
};

export interface ActivityReader {
  findOwned(id: string, ownerId: string): Promise<Activity | undefined>;
  listOwned(ownerId: string, filters: ActivityFilters): Promise<Activity[]>;
}
