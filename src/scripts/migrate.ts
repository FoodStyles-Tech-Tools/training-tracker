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
  // SSL configuration for self-signed certificates
  ssl: process.env.VERCEL || process.env.NODE_ENV === "production" 
    ? { rejectUnauthorized: false }
    : undefined,
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
  } catch (error: any) {
    // Check if it's an "already exists" error (PostgreSQL error codes 42710 for types, 42P07 for relations)
    const isAlreadyExistsError = 
      error?.cause?.code === "42710" || // duplicate_object (enum/type)
      error?.cause?.code === "42P07" || // duplicate_table
      (error?.cause?.severity === "ERROR" && 
       error?.cause?.message?.includes("already exists"));
    
    if (isAlreadyExistsError) {
      const errorType = error?.cause?.code === "42P07" ? "table" : "enum/type";
      console.warn(`⚠ Warning: ${errorType} already exists in database`);
      console.warn("  Migration files are now idempotent, so this error should not occur.");
      console.warn("  This might be from an older migration that hasn't been made idempotent yet.");
      console.warn("  The migration will continue, but you should check which migration file caused this.");
      console.warn("");
      
      // In development, log the error but don't fail - migration files should be idempotent
      // In production, we still want to know about this
      if (process.env.NODE_ENV === "production" || process.env.VERCEL) {
        console.error("✗ Migration failed in production - this should not happen with idempotent migrations");
        throw error;
      }
      
      // In development, just warn and continue
      console.warn("Continuing in development mode - please check migration files for non-idempotent statements");
      return;
    }
    
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

