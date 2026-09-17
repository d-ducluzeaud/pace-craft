import { expect, test } from "bun:test";
import { ZodError } from "zod";
import { buildApp } from "../src/app";
import { loadEnvironment } from "../src/config";

test("registration is unavailable until authentication is configured", async () => {
  const app = await buildApp({ readinessProbe: { check: async () => undefined } });
  try {
    const response = await app.inject({
      method: "POST",
      url: "/api/auth/sign-up/email",
      payload: { name: "Alice", email: "alice@example.com", password: "test-password-95c71ab3" },
    });
    expect(response.statusCode).toBe(503);
    expect(response.headers["content-type"]).toContain("application/problem+json");
  } finally {
    await app.close();
  }
});

test("authentication requires a paired secret and origin with HTTPS in production", () => {
  const environment = { DATABASE_URL: "postgresql://localhost/pacecraft" };
  const secret = "test-secret-9c8f2e734a0d65b17b3d021c";
  expect(() =>
    loadEnvironment({ ...environment, BETTER_AUTH_URL: "invalid-url", BETTER_AUTH_SECRET: secret }),
  ).toThrow(ZodError);
  expect(() => loadEnvironment({ ...environment, BETTER_AUTH_SECRET: secret })).toThrow();
  expect(() =>
    loadEnvironment({ ...environment, BETTER_AUTH_URL: "https://pacecraft.example" }),
  ).toThrow();
  for (const origin of [
    "http://pacecraft.example",
    "https://pacecraft.example/auth",
    "https://user:pass@pacecraft.example",
  ]) {
    expect(() =>
      loadEnvironment({ ...environment, BETTER_AUTH_URL: origin, BETTER_AUTH_SECRET: secret }),
    ).toThrow();
  }
  expect(
    loadEnvironment({
      ...environment,
      BETTER_AUTH_URL: "https://pacecraft.example",
      BETTER_AUTH_SECRET: secret,
    }).BETTER_AUTH_SECRET,
  ).toBe(secret);
  expect(() =>
    loadEnvironment({
      ...environment,
      BETTER_AUTH_URL: "https://pacecraft.example",
      BETTER_AUTH_SECRET: "short",
    }),
  ).toThrow();
});
