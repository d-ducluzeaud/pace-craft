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

import type { ReadinessProbe } from "./application/health/readiness-probe";
import { createHealthRoutes } from "./http/health-routes";
import { registerNotFoundHandler } from "./http/problem-details";

export interface BuildAppOptions {
  logger?: FastifyServerOptions["logger"];
  readinessProbe: ReadinessProbe;
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
      tags: [{ name: "Health", description: "Application health probes." }],
    },
    transform: jsonSchemaTransform,
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
  app.get("/openapi.json", { schema: { hide: true } }, async () => app.swagger());

  return app;
}
