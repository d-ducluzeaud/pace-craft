import { buildApp } from "./app";
import { loadEnvironment } from "./config";
import { createDrizzleActivityStore } from "./infrastructure/database/drizzle-activity-store";
import { createDrizzleAuth } from "./infrastructure/database/drizzle-auth";
import { createDrizzleReadinessProbe } from "./infrastructure/database/drizzle-readiness-probe";

const environment = loadEnvironment();
const activityStore = createDrizzleActivityStore(environment.DATABASE_URL);
const app = await buildApp({
  logger: {
    level: environment.LOG_LEVEL,
    redact: [
      "req.headers.cookie",
      "req.headers.authorization",
      "req.body.password",
      "res.headers['set-cookie']",
    ],
  },
  ...(environment.BETTER_AUTH_URL === undefined || environment.BETTER_AUTH_SECRET === undefined
    ? {}
    : {
        authentication: createDrizzleAuth({
          databaseUrl: environment.DATABASE_URL,
          baseURL: environment.BETTER_AUTH_URL,
          secret: environment.BETTER_AUTH_SECRET,
        }),
      }),
  readinessProbe: createDrizzleReadinessProbe(environment.DATABASE_URL),
  activityWriter: activityStore,
  activityReader: activityStore,
  ...(environment.DEV_ATHLETE_ID === undefined
    ? {}
    : { developmentOwnerId: environment.DEV_ATHLETE_ID }),
});
app.addHook("onClose", async () => activityStore.close());

const close = async (): Promise<void> => {
  await app.close();
  process.exit(0);
};

process.once("SIGINT", () => void close());
process.once("SIGTERM", () => void close());

await app.listen({ host: environment.HOST, port: environment.PORT });
