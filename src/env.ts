import "dotenv/config";
import { z } from "zod";

const serverSchema = z.object({
  DATABASE_URL: z.string().url(),
  BETTER_AUTH_SECRET: z.string().min(32),
  NEXT_PUBLIC_APP_URL: z.string().url().default("http://localhost:3000"),
  ADMIN_SEED_EMAIL: z.string().email().optional(),
  ADMIN_SEED_PASSWORD: z.string().min(8).optional(),
  GOOGLE_CLIENT_ID: z.string().min(1),
  GOOGLE_CLIENT_SECRET: z.string().min(1),
});

const parsed = serverSchema.safeParse({
  DATABASE_URL: process.env.DATABASE_URL,
  BETTER_AUTH_SECRET: process.env.BETTER_AUTH_SECRET,
  NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
  ADMIN_SEED_EMAIL: process.env.ADMIN_SEED_EMAIL,
  ADMIN_SEED_PASSWORD: process.env.ADMIN_SEED_PASSWORD,
  GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID,
  GOOGLE_CLIENT_SECRET: process.env.GOOGLE_CLIENT_SECRET,
});

if (!parsed.success) {
  console.error("Invalid environment variables", parsed.error.flatten().fieldErrors);
  throw new Error("Invalid environment variables");
}

export const env = parsed.data;
export const appBaseUrl = env.NEXT_PUBLIC_APP_URL;
