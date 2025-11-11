import "dotenv/config";
import { Pool } from "pg";

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

async function runMigration() {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    // Check if enum types exist, create if not
    const enumCheck = await client.query(`
      SELECT typname FROM pg_type WHERE typname IN ('user_department', 'user_status')
    `);
    const existingEnums = enumCheck.rows.map((r) => r.typname);

    if (!existingEnums.includes("user_department")) {
      console.log("Creating user_department enum...");
      await client.query(`CREATE TYPE "public"."user_department" AS ENUM('curator', 'scraping')`);
    } else {
      console.log("user_department enum already exists, skipping...");
    }

    if (!existingEnums.includes("user_status")) {
      console.log("Creating user_status enum...");
      await client.query(`CREATE TYPE "public"."user_status" AS ENUM('active', 'inactive')`);
    } else {
      console.log("user_status enum already exists, skipping...");
    }

    // Check if columns exist, add if not
    const columnCheck = await client.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'users' 
      AND column_name IN ('status', 'department', 'google_calendar_tag')
    `);
    const existingColumns = columnCheck.rows.map((r) => r.column_name);

    if (!existingColumns.includes("status")) {
      console.log("Adding status column...");
      await client.query(
        `ALTER TABLE "users" ADD COLUMN "status" "user_status" DEFAULT 'active' NOT NULL`
      );
    } else {
      console.log("status column already exists, skipping...");
    }

    if (!existingColumns.includes("department")) {
      console.log("Adding department column...");
      await client.query(
        `ALTER TABLE "users" ADD COLUMN "department" "user_department" DEFAULT 'curator' NOT NULL`
      );
    } else {
      console.log("department column already exists, skipping...");
    }

    if (!existingColumns.includes("google_calendar_tag")) {
      console.log("Adding google_calendar_tag column...");
      await client.query(`ALTER TABLE "users" ADD COLUMN "google_calendar_tag" text`);
    } else {
      console.log("google_calendar_tag column already exists, skipping...");
    }

    // Check if indexes exist, create if not
    const indexCheck = await client.query(`
      SELECT indexname 
      FROM pg_indexes 
      WHERE tablename = 'users' 
      AND indexname IN ('users_status_idx', 'users_department_idx')
    `);
    const existingIndexes = indexCheck.rows.map((r) => r.indexname);

    if (!existingIndexes.includes("users_status_idx")) {
      console.log("Creating users_status_idx index...");
      await client.query(`CREATE INDEX "users_status_idx" ON "users" USING btree ("status")`);
    } else {
      console.log("users_status_idx index already exists, skipping...");
    }

    if (!existingIndexes.includes("users_department_idx")) {
      console.log("Creating users_department_idx index...");
      await client.query(`CREATE INDEX "users_department_idx" ON "users" USING btree ("department")`);
    } else {
      console.log("users_department_idx index already exists, skipping...");
    }

    await client.query("COMMIT");
    console.log("Migration completed successfully!");
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("Migration failed:", error);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

runMigration()
  .then(() => {
    console.log("Done!");
    process.exit(0);
  })
  .catch((error) => {
    console.error("Error:", error);
    process.exit(1);
  });
