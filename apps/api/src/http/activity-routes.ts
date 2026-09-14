import { ok as invariant } from "node:assert";
import {
  activityParamsSchema,
  activityResponseSchema,
  createActivityBodySchema,
  listActivitiesQuerySchema,
  problemDetailsSchema,
} from "@pacecraft/contracts";
import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import {
  DEFAULT_HISTORY_LIMIT,
  resolveHistoryRange,
} from "../application/activities/activity-history";
import type { ActivityReader } from "../application/activities/activity-reader";
import type { ActivityWriter } from "../application/activities/activity-writer";
import { validateActivityBody } from "./validate-activity-body";

export function createActivityRoutes(options: {
  writer: ActivityWriter | undefined;
  reader: ActivityReader | undefined;
  developmentOwnerId: string | undefined;
}): FastifyPluginAsyncZod {
  return async function activityRoutes(app) {
    app.get(
      "/activities",
      {
        schema: {
          tags: ["Activities"],
          summary: "List owned activity history",
          description:
            "Local development only: server-owned history ordered by startedAt DESC, id DESC. Supply both from (inclusive) and to (exclusive), at most 366 days apart; omit both to use period (1y, 6m, 3m, 1m, 1w, today; default 1m). Period and explicit dates are mutually exclusive. Months/years are calendar intervals with month-end clamping; today is the UTC calendar day. ISO timestamps require an offset. Limit defaults to 100, maximum 200. X-Has-More indicates additional matches; narrow the range to retrieve them. Empty results return []. Unknown filters are rejected.",
          querystring: listActivitiesQuerySchema,
          response: {
            200: activityResponseSchema.array(),
            400: { content: { "application/problem+json": { schema: problemDetailsSchema } } },
            500: { content: { "application/problem+json": { schema: problemDetailsSchema } } },
            503: { content: { "application/problem+json": { schema: problemDetailsSchema } } },
          },
        },
        onRequest: async (request, reply) => {
          if (options.developmentOwnerId === undefined) {
            return reply.status(503).type("application/problem+json").send({
              type: "about:blank",
              title: "Service Unavailable",
              status: 503,
              detail: "Activity retrieval is disabled until a server identity is configured.",
              instance: request.url,
            });
          }
        },
      },
      async (request, reply) => {
        const ownerId = options.developmentOwnerId;
        invariant(ownerId !== undefined, "Missing activity owner after identity check.");
        if (options.reader === undefined) {
          return reply.status(503).type("application/problem+json").send({
            type: "about:blank",
            title: "Service Unavailable",
            status: 503,
            detail: "Activity storage is unavailable.",
            instance: request.url,
          });
        }

        const { sport, limit = DEFAULT_HISTORY_LIMIT } = request.query;
        const range = resolveHistoryRange(request.query, new Date());
        if (range === undefined) {
          return reply.status(400).type("application/problem+json").send({
            type: "about:blank",
            title: "Bad Request",
            status: 400,
            detail:
              "Choose a period or provide both from and to with from < to and a range of at most 366 days.",
            instance: request.url,
          });
        }
        const activities = await options.reader.listOwned(ownerId, {
          ...range,
          sport,
          limit: limit + 1,
        });
        reply.header("X-Has-More", String(activities.length > limit));

        return reply.send(
          activities.slice(0, limit).map((activity) => ({
            ...activity,
            startedAt: activity.startedAt.toISOString(),
            createdAt: activity.createdAt.toISOString(),
            updatedAt: activity.updatedAt.toISOString(),
          })),
        );
      },
    );
    app.get(
      "/activities/:id",
      {
        schema: {
          tags: ["Activities"],
          summary: "Retrieve one owned activity",
          description:
            "Local development only: ownership comes from server configuration. Missing activities and activities owned by another athlete both return 404.",
          params: activityParamsSchema,
          response: {
            200: activityResponseSchema,
            400: { content: { "application/problem+json": { schema: problemDetailsSchema } } },
            404: { content: { "application/problem+json": { schema: problemDetailsSchema } } },
            500: { content: { "application/problem+json": { schema: problemDetailsSchema } } },
            503: { content: { "application/problem+json": { schema: problemDetailsSchema } } },
          },
        },
        onRequest: async (request, reply) => {
          if (options.developmentOwnerId === undefined) {
            return reply.status(503).type("application/problem+json").send({
              type: "about:blank",
              title: "Service Unavailable",
              status: 503,
              detail: "Activity retrieval is disabled until a server identity is configured.",
              instance: request.url,
            });
          }
        },
      },
      async (request, reply) => {
        const ownerId = options.developmentOwnerId;
        invariant(ownerId !== undefined, "Missing activity owner after identity check.");
        if (options.reader === undefined) {
          return reply.status(503).type("application/problem+json").send({
            type: "about:blank",
            title: "Service Unavailable",
            status: 503,
            detail: "Activity storage is unavailable.",
            instance: request.url,
          });
        }
        const activity = await options.reader.findOwned(request.params.id, ownerId);
        if (activity === undefined) {
          return reply.status(404).type("application/problem+json").send({
            type: "about:blank",
            title: "Not Found",
            status: 404,
            detail: "The requested resource does not exist.",
            instance: request.url,
          });
        }
        return reply.send({
          ...activity,
          startedAt: activity.startedAt.toISOString(),
          createdAt: activity.createdAt.toISOString(),
          updatedAt: activity.updatedAt.toISOString(),
        });
      },
    );
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
            500: { content: { "application/problem+json": { schema: problemDetailsSchema } } },
            503: { content: { "application/problem+json": { schema: problemDetailsSchema } } },
          },
        },
        onRequest: async (request, reply) => {
          if (options.developmentOwnerId === undefined) {
            return reply.status(503).type("application/problem+json").send({
              type: "about:blank",
              title: "Service Unavailable",
              status: 503,
              detail: "Activity creation is disabled until a server identity is configured.",
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
