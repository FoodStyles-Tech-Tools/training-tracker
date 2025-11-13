import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

import * as schema from "./schema";
import { env } from "@/env";

// Determine if we should use SSL - always in Vercel builds
const isVercel = !!process.env.VERCEL;
const isProduction = process.env.NODE_ENV === "production";
const hasSSLMode = env.DATABASE_URL.includes("sslmode");
const shouldUseSSL = isVercel || isProduction || hasSSLMode;

// Remove sslmode from connection string if present, as it conflicts with our SSL config
// We'll handle SSL purely through the Pool configuration
const connectionString = shouldUseSSL 
  ? env.DATABASE_URL.replace(/[?&]sslmode=[^&]*/g, '').replace(/\?$/, '')
  : env.DATABASE_URL;

const pool = new Pool({
  connectionString,
  // SSL configuration for self-signed certificates
  // CRITICAL: Always enable SSL with rejectUnauthorized: false in Vercel/production
  // Connection string SSL params are removed above to prevent conflicts
  ssl: shouldUseSSL ? { rejectUnauthorized: false } : undefined,
});

export const db = drizzle(pool, { schema });
export { schema };

