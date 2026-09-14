import { createDrizzleAuth } from "../src/infrastructure/database/drizzle-auth";

// Schema generation only: the SQL client connects lazily; these are not runtime credentials.
export const { auth } = createDrizzleAuth({
  databaseUrl: "postgresql://pacecraft_test:pacecraft_test@127.0.0.1:5434/postgres",
  baseURL: "http://localhost:3000",
  secret: "schema-generation-only-not-a-runtime-secret-123456789",
});
