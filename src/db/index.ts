import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

import * as schema from "./schema";
import { env } from "@/env";

const pool = new Pool({
  connectionString: env.DATABASE_URL,
  // SSL configuration for self-signed certificates
  // Always enable SSL in Vercel builds or when DATABASE_URL contains sslmode
  ssl: process.env.VERCEL || 
       process.env.NODE_ENV === "production" || 
       env.DATABASE_URL.includes("sslmode")
    ? { rejectUnauthorized: false }
    : undefined,
});

export const db = drizzle(pool, { schema });
export { schema };

