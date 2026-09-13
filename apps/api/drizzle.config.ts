import { defineConfig } from "drizzle-kit";

const { DATABASE_URL: databaseUrl } = process.env;

if (databaseUrl === undefined) {
  throw new Error("DATABASE_URL is required for database commands.");
}

export default defineConfig({
  dialect: "postgresql",
  out: "./drizzle",
  schema: "./src/infrastructure/database/schema.ts",
  dbCredentials: { url: databaseUrl },
  strict: true,
  verbose: true,
});
