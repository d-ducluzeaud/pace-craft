import { z } from "zod";

export const sportSchema = z.enum(["running", "cycling", "swimming"]);

export const activityParamsSchema = z.strictObject({ id: z.uuid() });

export const activityBodyShape = {
  startedAt: z.iso
    .datetime({ offset: true })
    .refine(
      (value) => new Date(value).getUTCFullYear() >= 1,
      "The activity date must resolve to UTC year 0001 or later.",
    ),
  durationSeconds: z.int().positive(),
  distanceMeters: z.int().positive(),
  effort: z.int().min(0).max(10).optional(),
  averageHeartRate: z.int().positive().optional(),
  maxHeartRate: z.int().positive().optional(),
};

const powerShape = {
  averagePower: z.number().nonnegative().optional(),
  maxPower: z.number().nonnegative().optional(),
};

const runningActivityBodySchema = z.strictObject({
  ...activityBodyShape,
  ...powerShape,
  sport: sportSchema.extract(["running"]),
});

const cyclingActivityBodySchema = z.strictObject({
  ...activityBodyShape,
  ...powerShape,
  sport: sportSchema.extract(["cycling"]),
});

const swimmingActivityBodySchema = z.strictObject({
  ...activityBodyShape,
  sport: sportSchema.extract(["swimming"]),
  averageSwolf: z.number().positive().optional(),
});

const activityBodySchema = z.discriminatedUnion("sport", [
  runningActivityBodySchema,
  cyclingActivityBodySchema,
  swimmingActivityBodySchema,
]);

function validateMeasurements(body: z.infer<typeof activityBodySchema>, ctx: z.RefinementCtx) {
  const { averageHeartRate, maxHeartRate } = body;
  if ((averageHeartRate === undefined) !== (maxHeartRate === undefined)) {
    ctx.addIssue({
      code: "custom",
      path: [averageHeartRate === undefined ? "averageHeartRate" : "maxHeartRate"],
      message: "Average and maximum heart rate must be provided together.",
    });
  } else if (
    averageHeartRate !== undefined &&
    maxHeartRate !== undefined &&
    averageHeartRate > maxHeartRate
  ) {
    ctx.addIssue({
      code: "custom",
      path: ["averageHeartRate"],
      message: "Average heart rate must not exceed maximum heart rate.",
    });
  }

  if (body.sport !== "swimming") {
    const { averagePower, maxPower } = body;
    if ((averagePower === undefined) !== (maxPower === undefined)) {
      ctx.addIssue({
        code: "custom",
        path: [averagePower === undefined ? "averagePower" : "maxPower"],
        message: "Average and maximum power must be provided together.",
      });
    } else if (averagePower !== undefined && maxPower !== undefined && averagePower > maxPower) {
      ctx.addIssue({
        code: "custom",
        path: ["averagePower"],
        message: "Average power must not exceed maximum power.",
      });
    }
  }
}

export const createActivityBodySchema = activityBodySchema.superRefine(validateMeasurements);
export type CreateActivityBody = z.infer<typeof createActivityBodySchema>;

const generatedActivityShape = {
  id: z.uuid(),
  ownerId: z.uuid(),
  createdAt: z.iso.datetime({ offset: true }),
  updatedAt: z.iso.datetime({ offset: true }),
};

export const activityResponseSchema = z
  .discriminatedUnion("sport", [
    runningActivityBodySchema.extend(generatedActivityShape),
    cyclingActivityBodySchema.extend(generatedActivityShape),
    swimmingActivityBodySchema.extend(generatedActivityShape),
  ])
  .superRefine(validateMeasurements);

export type ActivityResponse = z.infer<typeof activityResponseSchema>;

export const listActivitiesQuerySchema = z.strictObject({
  period: z.enum(["1y", "6m", "3m", "1m", "1w", "today"]).optional(),
  sport: sportSchema.optional(),
  from: activityBodyShape.startedAt.optional(),
  to: activityBodyShape.startedAt.optional(),
  limit: z
    .string()
    .regex(/^[1-9][0-9]*$/)
    .pipe(z.coerce.number<string>().int().max(200))
    .optional(),
});
