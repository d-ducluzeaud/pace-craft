import { buildApp } from "./app";
import { loadEnvironment } from "./config";
import { createDrizzleActivityWriter } from "./infrastructure/database/drizzle-activity-writer";
import { createDrizzleReadinessProbe } from "./infrastructure/database/drizzle-readiness-probe";

const environment = loadEnvironment();
const activityWriter = createDrizzleActivityWriter(environment.DATABASE_URL);
const app = await buildApp({
  logger: { level: environment.LOG_LEVEL },
  readinessProbe: createDrizzleReadinessProbe(environment.DATABASE_URL),
  activityWriter,
  ...(environment.DEV_ATHLETE_ID === undefined
    ? {}
    : { developmentOwnerId: environment.DEV_ATHLETE_ID }),
});
app.addHook("onClose", async () => activityWriter.close());

const close = async (): Promise<void> => {
  await app.close();
  process.exit(0);
};

process.once("SIGINT", () => void close());
process.once("SIGTERM", () => void close());

await app.listen({ host: environment.HOST, port: environment.PORT });
