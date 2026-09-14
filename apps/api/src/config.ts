import { z } from "zod";

const environmentSchema = z
  .object({
    DATABASE_URL: z.url(),
    BETTER_AUTH_URL: z.preprocess(
      (value) => (value === "" ? undefined : value),
      z.url({ protocol: /^https?$/ }).optional(),
    ),
    BETTER_AUTH_SECRET: z.preprocess(
      (value) => (value === "" ? undefined : value),
      z.string().min(32).optional(),
    ),
    NODE_ENV: z.enum(["development", "test", "production"]).default("production"),
    DEV_ATHLETE_ID: z.uuid().optional(),
    HOST: z.string().min(1).default("0.0.0.0"),
    LOG_LEVEL: z
      .enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"])
      .default("info"),
    PORT: z.coerce.number().int().min(1).max(65_535).default(3000),
  })
  .superRefine((environment, ctx) => {
    if (
      (environment.BETTER_AUTH_URL === undefined) !==
      (environment.BETTER_AUTH_SECRET === undefined)
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["BETTER_AUTH_SECRET"],
        message: "BETTER_AUTH_URL and BETTER_AUTH_SECRET must be configured together.",
      });
    }
    if (environment.BETTER_AUTH_URL !== undefined && URL.canParse(environment.BETTER_AUTH_URL)) {
      const url = new URL(environment.BETTER_AUTH_URL);
      if (
        url.username ||
        url.password ||
        url.pathname !== "/" ||
        url.search ||
        url.hash ||
        (environment.NODE_ENV === "production" && url.protocol !== "https:")
      ) {
        ctx.addIssue({
          code: "custom",
          path: ["BETTER_AUTH_URL"],
          message:
            "Use an origin without credentials, path, query, or fragment; HTTPS is required in production.",
        });
      }
    }
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
