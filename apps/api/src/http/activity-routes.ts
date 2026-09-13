import { ok as invariant } from "node:assert";
import {
  activityResponseSchema,
  createActivityBodySchema,
  problemDetailsSchema,
} from "@pacecraft/contracts";
import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import type { ActivityWriter } from "../application/activities/activity-writer";
import { validateActivityBody } from "./validate-activity-body";

export function createActivityRoutes(options: {
  writer: ActivityWriter | undefined;
  developmentOwnerId: string | undefined;
}): FastifyPluginAsyncZod {
  return async function activityRoutes(app) {
    app.post(
      "/activities",
      {
        schema: {
          tags: ["Activities"],
          summary: "Create a completed multisport activity",
          description:
            "Local development only: ownership comes from server configuration, never the request body. Authentication must replace this identity before public deployment.",
          body: createActivityBodySchema,
          response: {
            201: activityResponseSchema,
            400: { content: { "application/problem+json": { schema: problemDetailsSchema } } },
            401: { content: { "application/problem+json": { schema: problemDetailsSchema } } },
            500: { content: { "application/problem+json": { schema: problemDetailsSchema } } },
            503: { content: { "application/problem+json": { schema: problemDetailsSchema } } },
          },
        },
        onRequest: async (request, reply) => {
          if (options.developmentOwnerId === undefined) {
            return reply.status(401).type("application/problem+json").send({
              type: "about:blank",
              title: "Unauthorized",
              status: 401,
              detail: "An authenticated identity is required.",
              instance: request.url,
            });
          }
        },
      },
      async (request, reply) => {
        const ownerId = options.developmentOwnerId;
        invariant(ownerId !== undefined, "Missing activity owner after identity check.");
        const result = validateActivityBody(request.body, ownerId, new Date());
        if (!result.ok) {
          return reply.status(400).type("application/problem+json").send({
            type: "about:blank",
            title: "Bad Request",
            status: 400,
            detail: result.error,
            instance: request.url,
          });
        }
        if (options.writer === undefined) {
          return reply.status(503).type("application/problem+json").send({
            type: "about:blank",
            title: "Service Unavailable",
            status: 503,
            detail: "Activity storage is unavailable.",
            instance: request.url,
          });
        }
        const activity = await options.writer.create(result.value);
        return reply
          .status(201)
          .header("Location", `/activities/${activity.id}`)
          .send({
            ...activity,
            startedAt: activity.startedAt.toISOString(),
            createdAt: activity.createdAt.toISOString(),
            updatedAt: activity.updatedAt.toISOString(),
          });
      },
    );
  };
}
