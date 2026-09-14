import { drizzleAdapter } from "@better-auth/drizzle-adapter/relations-v2";
import { betterAuth } from "better-auth";
import { SQL } from "bun";
import { drizzle } from "drizzle-orm/bun-sql";
import { authOptions } from "../auth/auth-options";
import * as schema from "./schema/auth";

export function createDrizzleAuth(options: {
  databaseUrl: string;
  baseURL: string;
  secret: string;
}) {
  const client = new SQL(options.databaseUrl);
  const database = drizzle({ client, relations: schema.authRelations });
  const auth = betterAuth({
    ...authOptions,
    baseURL: options.baseURL,
    secret: options.secret,
    logger: {
      level: "error",
      // Database errors can contain query parameters, including credential hashes.
      log: () => console.error("Better Auth operation failed."),
    },
    database: drizzleAdapter(database, { provider: "pg", schema, transaction: true }),
  });

  return {
    auth,
    async close() {
      await client.close();
    },
  };
}
