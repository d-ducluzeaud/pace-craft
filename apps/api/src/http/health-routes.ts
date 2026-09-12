import { healthStatusSchema, problemDetailsSchema } from "@pacecraft/contracts";
import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";

import type { ReadinessProbe } from "../application/health/readiness-probe";

export function createHealthRoutes(readinessProbe: ReadinessProbe): FastifyPluginAsyncZod {
  return async function healthRoutes(app): Promise<void> {
    app.get(
      "/health/live",
      {
        schema: {
          tags: ["Health"],
          response: { 200: healthStatusSchema },
        },
      },
      async () => ({ status: "ok" as const }),
    );

    app.get(
      "/health/ready",
      {
        schema: {
          tags: ["Health"],
          response: {
            200: healthStatusSchema,
            503: {
              content: {
                "application/problem+json": { schema: problemDetailsSchema },
              },
            },
          },
        },
      },
      async (request, reply) => {
        try {
          await readinessProbe.check();
          return { status: "ok" as const };
        } catch (error: unknown) {
          request.log.warn({ err: error }, "readiness probe failed");
          return reply.status(503).type("application/problem+json").send({
            type: "about:blank",
            title: "Service Unavailable",
            status: 503,
            detail: "A required dependency is unavailable.",
            instance: request.url,
          });
        }
      },
    );
  };
}
