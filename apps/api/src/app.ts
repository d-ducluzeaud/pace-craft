import swagger from "@fastify/swagger";
import swaggerUi from "@fastify/swagger-ui";
import Fastify, { type FastifyInstance, type FastifyServerOptions } from "fastify";
import {
  hasZodFastifySchemaValidationErrors,
  jsonSchemaTransform,
  serializerCompiler,
  validatorCompiler,
  type ZodTypeProvider,
} from "fastify-type-provider-zod";
import type { ActivityReader } from "./application/activities/activity-reader";
import type { ActivityWriter } from "./application/activities/activity-writer";
import type { ReadinessProbe } from "./application/health/readiness-probe";
import { createActivityRoutes } from "./http/activity-routes";
import { createHealthRoutes } from "./http/health-routes";
import { registerNotFoundHandler } from "./http/problem-details";

export interface BuildAppOptions {
  logger?: FastifyServerOptions["logger"];
  readinessProbe: ReadinessProbe;
  activityWriter?: ActivityWriter;
  activityReader?: ActivityReader;
  developmentOwnerId?: string;
}

export async function buildApp(options: BuildAppOptions): Promise<FastifyInstance> {
  const app = Fastify({
    allowErrorHandlerOverride: false,
    logger: options.logger ?? false,
  }).withTypeProvider<ZodTypeProvider>();

  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);
  app.addHook("onClose", async () => options.readinessProbe.close?.());

  await app.register(swagger, {
    openapi: {
      info: {
        title: "PaceCraft API",
        description: "REST API for endurance activity tracking.",
        version: "0.1.0",
      },
      tags: [
        { name: "Health", description: "Application health probes." },
        { name: "Activities", description: "Completed multisport activities." },
      ],
    },
    transform: jsonSchemaTransform,
    transformObject: (document) => {
      if (!("openapiObject" in document)) return document.swaggerObject;
      const { openapiObject } = document;
      const response = openapiObject.paths?.["/activities"]?.post?.responses?.["201"];
      if (response && !("$ref" in response)) {
        response.headers = {
          ...response.headers,
          Location: {
            description: "URI for retrieving the created activity.",
            required: true,
            schema: { type: "string", example: "/activities/019f3ed0-0000-7000-8000-000000000002" },
          },
        };
      }
      return openapiObject;
    },
  });

  await app.register(swaggerUi, { routePrefix: "/docs" });
  registerNotFoundHandler(app);

  app.setErrorHandler((error, request, reply) => {
    if (hasZodFastifySchemaValidationErrors(error)) {
      return reply.status(400).type("application/problem+json").send({
        type: "about:blank",
        title: "Bad Request",
        status: 400,
        detail: "The request does not match the API contract.",
        instance: request.url,
      });
    }

    const normalizedError = error instanceof Error ? error : new Error("Unknown error");
    const statusCode =
      "statusCode" in normalizedError && typeof normalizedError.statusCode === "number"
        ? normalizedError.statusCode
        : undefined;
    const status = statusCode !== undefined && statusCode >= 400 ? statusCode : 500;
    const title = status >= 500 ? "Internal Server Error" : normalizedError.name;
    const detail = status >= 500 ? {} : { detail: normalizedError.message };

    if (status >= 500) {
      request.log.error({ err: normalizedError }, "request failed");
    }

    return reply
      .status(status)
      .type("application/problem+json")
      .send({
        type: "about:blank",
        title,
        status,
        ...detail,
        instance: request.url,
      });
  });

  await app.register(createHealthRoutes(options.readinessProbe));
  await app.register(
    createActivityRoutes({
      writer: options.activityWriter,
      reader: options.activityReader,
      developmentOwnerId: options.developmentOwnerId,
    }),
  );
  app.get("/openapi.json", { schema: { hide: true } }, async () => app.swagger());

  return app;
}
