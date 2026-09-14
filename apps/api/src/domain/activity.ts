export type ActivityBase = {
  id: string;
  ownerId: string;
  startedAt: Date;
  durationSeconds: number;
  distanceMeters: number;
  effort?: number;
  createdAt: Date;
  updatedAt: Date;
} & HeartRate;

type HeartRate =
  | {
      averageHeartRate: number;
      maxHeartRate: number;
    }
  | {
      averageHeartRate?: never;
      maxHeartRate?: never;
    };

type Power =
  | {
      averagePower: number;
      maxPower: number;
    }
  | {
      averagePower?: never;
      maxPower?: never;
    };

export type RunningActivity = ActivityBase & Power & { sport: "running"; averageSwolf?: never };

export type CyclingActivity = ActivityBase & Power & { sport: "cycling"; averageSwolf?: never };

export type SwimmingActivity = ActivityBase & {
  sport: "swimming";
  averageSwolf?: number;
  averagePower?: never;
  maxPower?: never;
};

export type Activity = RunningActivity | CyclingActivity | SwimmingActivity;

export type CreateActivityBase = Omit<ActivityBase, "id" | "createdAt" | "updatedAt"> & HeartRate;

export type CreateRunningActivityInput = CreateActivityBase &
  Power & {
    sport: "running";
    averageSwolf?: never;
  };

export type CreateCyclingActivityInput = CreateActivityBase &
  Power & {
    sport: "cycling";
    averageSwolf?: never;
  };

export type CreateSwimmingActivityInput = CreateActivityBase & {
  sport: "swimming";
  averageSwolf?: number;
  averagePower?: never;
  maxPower?: never;
};

export type CreateActivityInput =
  | CreateRunningActivityInput
  | CreateCyclingActivityInput
  | CreateSwimmingActivityInput;

export type ActivityValidationError =
  | "invalid_started_at"
  | "invalid_distance"
  | "invalid_duration"
  | "activity_not_completed"
  | "invalid_effort"
  | "invalid_heart_rate"
  | "invalid_power"
  | "invalid_swolf";

export type ActivityValidationResult =
  | { ok: true; value: CreateActivityInput }
  | { ok: false; error: ActivityValidationError };
