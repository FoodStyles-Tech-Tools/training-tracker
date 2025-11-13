import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

import * as schema from "./schema";
import { env } from "@/env";

// Determine if we should use SSL - always in Vercel builds
const isVercel = !!process.env.VERCEL;
const isProduction = process.env.NODE_ENV === "production";
const hasSSLMode = env.DATABASE_URL.includes("sslmode");
const shouldUseSSL = isVercel || isProduction || hasSSLMode;

const pool = new Pool({
  connectionString: env.DATABASE_URL,
  // SSL configuration for self-signed certificates
  // CRITICAL: Always enable SSL with rejectUnauthorized: false in Vercel/production
  // This must be set as an object, not undefined, to override connection string SSL settings
  ...(shouldUseSSL && { ssl: { rejectUnauthorized: false } }),
});

export const db = drizzle(pool, { schema });
export { schema };

