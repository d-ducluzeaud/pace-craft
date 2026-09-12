import { afterEach, describe, expect, test } from "bun:test";
import type { FastifyInstance } from "fastify";

import { buildApp } from "../src/app";

let app: FastifyInstance | undefined;

afterEach(async () => {
  await app?.close();
  app = undefined;
});

describe("technical API", () => {
  test("reports liveness", async () => {
    app = await buildApp({ readinessProbe: { check: async () => undefined } });
    const response = await app.inject({ method: "GET", url: "/health/live" });

    expect(response.statusCode).toBe(200);
    expect(response.json<unknown>()).toEqual({ status: "ok" });
  });

  test("reports dependency failures as Problem Details", async () => {
    app = await buildApp({
      readinessProbe: {
        check: async () => {
          throw new Error("database unavailable");
        },
      },
    });
    const response = await app.inject({ method: "GET", url: "/health/ready" });

    expect(response.statusCode).toBe(503);
    expect(response.headers["content-type"]).toContain("application/problem+json");
    expect(response.json()).toMatchObject({ status: 503, title: "Service Unavailable" });
  });

  test("serves an OpenAPI document", async () => {
    app = await buildApp({ readinessProbe: { check: async () => undefined } });
    const response = await app.inject({ method: "GET", url: "/openapi.json" });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      info: { title: "PaceCraft API" },
      paths: {
        "/health/ready": {
          get: {
            responses: { 503: { content: { "application/problem+json": {} } } },
          },
        },
      },
    });
  });

  test("uses Problem Details for unknown routes", async () => {
    app = await buildApp({ readinessProbe: { check: async () => undefined } });
    const response = await app.inject({ method: "GET", url: "/missing" });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toMatchObject({ status: 404, title: "Not Found" });
  });
});
