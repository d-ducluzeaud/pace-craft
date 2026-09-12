import { buildApp } from "./app";
import { loadEnvironment } from "./config";
import { createDrizzleReadinessProbe } from "./infrastructure/database/drizzle-readiness-probe";

const environment = loadEnvironment();
const app = await buildApp({
  logger: { level: environment.LOG_LEVEL },
  readinessProbe: createDrizzleReadinessProbe(environment.DATABASE_URL),
});

const close = async (): Promise<void> => {
  await app.close();
  process.exit(0);
};

process.once("SIGINT", () => void close());
process.once("SIGTERM", () => void close());

await app.listen({ host: environment.HOST, port: environment.PORT });
