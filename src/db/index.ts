import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

import * as schema from "./schema";
import { env } from "@/env";

const pool = new Pool({
  connectionString: env.DATABASE_URL,
  // SSL configuration for self-signed certificates
  ssl: process.env.VERCEL || process.env.NODE_ENV === "production" 
    ? { rejectUnauthorized: false }
    : undefined,
});

export const db = drizzle(pool, { schema });
export { schema };

