/**
 * Script to delete all training requests and reset the TR ID counter
 * This will:
 * 1. Delete all training requests from the database
 * 2. Reset the custom_numbering counter to 0 (so next TR ID will be TR01)
 */

import "dotenv/config";
import { drizzle } from "drizzle-orm/node-postgres";
import { eq, sql } from "drizzle-orm";
import { Pool } from "pg";
import * as schema from "@/db/schema";
import { env } from "@/env";

const pool = new Pool({
  connectionString: env.DATABASE_URL,
  max: 1,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000,
});

const db = drizzle(pool, { schema });

async function resetTrainingRequests() {
  try {
    console.log("Starting training request reset...");

    // Delete all training requests
    console.log("Deleting all training requests...");
    const deletedResult = await db
      .delete(schema.trainingRequest)
      .where(sql`1 = 1`); // Delete all records
    console.log(`✓ Deleted all training requests`);

    // Reset the custom_numbering counter to 0
    console.log("Resetting TR ID counter...");
    const existing = await db.query.customNumbering.findFirst({
      where: eq(schema.customNumbering.module, "tr"),
    });

    if (existing) {
      await db
        .update(schema.customNumbering)
        .set({ runningNumber: 0 })
        .where(eq(schema.customNumbering.module, "tr"));
      console.log("✓ Reset TR ID counter to 0 (next TR ID will be TR01)");
    } else {
      await db.insert(schema.customNumbering).values({
        module: "tr",
        runningNumber: 0,
      });
      console.log("✓ Created TR ID counter starting at 0 (next TR ID will be TR01)");
    }

    console.log("\n✓ Reset completed successfully!");
    console.log("Next training request will be assigned TR01");
  } catch (error) {
    console.error("✗ Reset failed:", error);
    throw error;
  } finally {
    await pool.end();
  }
}

resetTrainingRequests()
  .then(() => {
    console.log("Done!");
    process.exit(0);
  })
  .catch((error) => {
    console.error("Error:", error);
    process.exit(1);
  });

