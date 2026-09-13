import { z } from "zod";

const environmentSchema = z
  .object({
    DATABASE_URL: z.url(),
    NODE_ENV: z.enum(["development", "test", "production"]).default("production"),
    DEV_ATHLETE_ID: z.uuid().optional(),
    HOST: z.string().min(1).default("0.0.0.0"),
    LOG_LEVEL: z
      .enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"])
      .default("info"),
    PORT: z.coerce.number().int().min(1).max(65_535).default(3000),
  })
  .superRefine((environment, ctx) => {
    if (environment.DEV_ATHLETE_ID !== undefined && environment.NODE_ENV !== "development") {
      ctx.addIssue({
        code: "custom",
        path: ["DEV_ATHLETE_ID"],
        message: "Development identity is only allowed with NODE_ENV=development.",
      });
    }
  });

export type Environment = z.infer<typeof environmentSchema>;

export function loadEnvironment(environment: NodeJS.ProcessEnv = process.env): Environment {
  return environmentSchema.parse(environment);
}
