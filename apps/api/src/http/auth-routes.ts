import { STATUS_CODES } from "node:http";
import { problemDetailsSchema, signUpBodySchema, signUpResponseSchema } from "@pacecraft/contracts";
import { fromNodeHeaders } from "better-auth/node";
import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import type { createDrizzleAuth } from "../infrastructure/database/drizzle-auth";

export function createAuthRoutes(
  authentication: ReturnType<typeof createDrizzleAuth> | undefined,
): FastifyPluginAsyncZod {
  return async function authRoutes(app) {
    app.post(
      "/api/auth/sign-up/email",
      {
        bodyLimit: 4096,
        schema: {
          tags: ["Authentication"],
          summary: "Register an athlete with email and password",
          description:
            "Returns 200 without a session for both new and existing emails. The returned user may be synthetic and does not prove account creation. Email identity is case-insensitive.",
          body: signUpBodySchema,
          response: {
            200: signUpResponseSchema,
            "4xx": { content: { "application/problem+json": { schema: problemDetailsSchema } } },
            "5xx": { content: { "application/problem+json": { schema: problemDetailsSchema } } },
          },
        },
      },
      async (request, reply) => {
        if (authentication === undefined) {
          return reply.status(503).type("application/problem+json").send({
            type: "about:blank",
            title: "Service Unavailable",
            status: 503,
            detail: "Authentication is not configured.",
            instance: request.url,
          });
        }
        const { auth } = authentication;
        const headers = fromNodeHeaders(request.headers);
        headers.delete("content-length");
        // Fastify does not trust proxy headers. Never let callers select their rate-limit bucket.
        headers.set("x-pacecraft-client-ip", request.ip);
        let response: Response;
        try {
          response = await auth.handler(
            new Request(new URL("/api/auth/sign-up/email", auth.options.baseURL), {
              method: "POST",
              headers,
              body: JSON.stringify(request.body),
            }),
          );
          if (
            response.status === 422 &&
            (await response.clone().json()).code === "FAILED_TO_CREATE_USER"
          ) {
            // ponytail: Better Auth 1.7.4 can lose a concurrent signup race; retry once until fixed upstream.
            // The native handler already checked origin and rate limits for this HTTP request.
            response = await auth.api.signUpEmail({
              body: request.body,
              headers,
              asResponse: true,
            });
            if (
              response.status === 422 &&
              (await response.clone().json()).code === "FAILED_TO_CREATE_USER"
            ) {
              response = new Response(null, { status: 503 });
            }
          }
        } catch {
          // Direct server API calls can throw database errors containing credential parameters.
          response = new Response(null, { status: 503 });
        }
        reply.header("Cache-Control", "no-store");
        const retryAfter = response.headers.get("X-Retry-After");
        if (retryAfter !== null) reply.header("Retry-After", retryAfter);
        if (!response.ok) {
          if (response.status >= 500) request.log.error("Authentication request failed.");
          return reply
            .status(response.status)
            .type("application/problem+json")
            .send({
              type: "about:blank",
              title: STATUS_CODES[response.status] ?? "Authentication Error",
              status: response.status,
              detail: "The registration request could not be completed.",
              instance: request.url,
            });
        }
        return reply.send(await response.json());
      },
    );
  };
}
