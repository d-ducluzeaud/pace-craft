import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";

function sendProblem(
  request: FastifyRequest,
  reply: FastifyReply,
  status: number,
  title: string,
  detail?: string,
): void {
  void reply
    .status(status)
    .type("application/problem+json")
    .send({
      type: "about:blank",
      title,
      status,
      ...(detail === undefined ? {} : { detail }),
      instance: request.url,
    });
}

export function registerNotFoundHandler(app: FastifyInstance): void {
  app.setNotFoundHandler((request, reply) => {
    sendProblem(request, reply, 404, "Not Found", "The requested resource does not exist.");
  });
}
