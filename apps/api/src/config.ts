import { z } from "zod";

const environmentSchema = z.object({
  DATABASE_URL: z.url(),
  HOST: z.string().min(1).default("0.0.0.0"),
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"]).default("info"),
  PORT: z.coerce.number().int().min(1).max(65_535).default(3000),
});

export type Environment = z.infer<typeof environmentSchema>;

export function loadEnvironment(environment: NodeJS.ProcessEnv = process.env): Environment {
  return environmentSchema.parse(environment);
}
