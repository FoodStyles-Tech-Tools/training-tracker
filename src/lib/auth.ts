import { betterAuth, APIError } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";
import { hashPassword, verifyPassword } from "better-auth/crypto";
import { eq } from "drizzle-orm";

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
  socialProviders: {
    google: {
      clientId: env.GOOGLE_CLIENT_ID,
      clientSecret: env.GOOGLE_CLIENT_SECRET,
      mapProfileToUser: async (profile) => {
        // Check if user exists by email
        const existingUser = await db.query.users.findFirst({
          where: eq(schema.users.email, profile.email),
        });

        if (!existingUser) {
          // Throw API error that Better Auth can handle properly
          throw new APIError("UNAUTHORIZED", {
            message: "User not found.",
          });
        }

        // Return the existing user data to link the account
        return {
          id: existingUser.id,
          name: existingUser.name,
          email: existingUser.email,
          image: existingUser.image,
          emailVerified: existingUser.emailVerified,
        };
      },
    },
  },
  session: {
    expiresIn: 60 * 60 * 24 * 7, // 7 days
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
