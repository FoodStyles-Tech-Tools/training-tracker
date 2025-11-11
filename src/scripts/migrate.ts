import "dotenv/config";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";
import { env } from "@/env";

const pool = new Pool({
  connectionString: env.DATABASE_URL,
  // Connection pool settings for production
  max: 1, // Use single connection for migrations
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000,
});

const db = drizzle(pool);

async function runMigrations() {
  try {
    console.log("Running database migrations...");
    
    // Check if DATABASE_URL is set
    if (!env.DATABASE_URL) {
      throw new Error("DATABASE_URL environment variable is not set");
    }

    // Drizzle's migrate function automatically:
    // - Creates the migration tracking table if it doesn't exist
    // - Works perfectly on empty databases
    // - Applies all migrations in order
    // - Skips already-applied migrations
    await migrate(db, { migrationsFolder: "./drizzle" });
    console.log("✓ Migrations completed successfully!");
  } catch (error) {
    console.error("✗ Migration failed:", error);
    // In production, we want to fail the build if migrations fail
    if (process.env.NODE_ENV === "production" || process.env.VERCEL) {
      throw error;
    }
    // In development, log but don't fail
    console.warn("Migration failed, but continuing in development mode");
  } finally {
    await pool.end();
  }
}

runMigrations()
  .then(() => {
    console.log("Done!");
    process.exit(0);
  })
  .catch((error) => {
    console.error("Error:", error);
    process.exit(1);
  });

