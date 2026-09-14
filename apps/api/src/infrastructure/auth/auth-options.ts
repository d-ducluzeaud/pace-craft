import type { BetterAuthOptions } from "better-auth";

export const authOptions = {
  advanced: {
    disableOriginCheck: false,
    disableCSRFCheck: false,
    ipAddress: {
      ipAddressHeaders: ["x-pacecraft-client-ip"],
    },
    database: {
      generateId: "uuid",
    },
  },
  emailAndPassword: {
    enabled: true,
    autoSignIn: false,
  },
  session: {
    cookieCache: {
      enabled: false,
    },
  },
  rateLimit: {
    enabled: true,
    storage: "database",
    customRules: {
      "/sign-up/email": { window: 60, max: 5 },
    },
  },
} satisfies BetterAuthOptions;
