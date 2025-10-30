import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";
import { hashPassword, verifyPassword } from "better-auth/crypto";

import { db, schema } from "@/db";
import { appBaseUrl, env } from "@/env";

const drizzleAuthAdapter = drizzleAdapter(db, {
  provider: "pg",
  schema,
  usePlural: true,
});

export const auth = betterAuth({
  appName: "Competency Training Tracker",
  baseURL: appBaseUrl,
  secret: env.BETTER_AUTH_SECRET,
  trustedOrigins: [appBaseUrl],
  telemetry: {
    enabled: false,
    debug: false,
  },
  database: drizzleAuthAdapter,
  emailAndPassword: {
    enabled: true,
    requireEmailVerification: false,
    password: {
      hash: hashPassword,
      verify: verifyPassword,
    },
  },
  session: {
    cookie: {
      name: "competency-training-tracker-session",
    },
  },
  user: {
    additionalFields: {
      roleId: {
        type: "string",
        input: true,
        required: false,
      },
      discordId: {
        type: "string",
        input: true,
        required: false,
      },
    },
  },
  plugins: [nextCookies()],
});
