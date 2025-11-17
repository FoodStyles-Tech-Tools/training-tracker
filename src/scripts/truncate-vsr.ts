import "dotenv/config";
import { eq, sql } from "drizzle-orm";

import { db, schema } from "../db";

async function main() {
  console.log("Truncating validation_schedule_request table and resetting VSR running number...");

  try {
    // Truncate the validation_schedule_request_log table first (if it exists)
    await db.execute(sql`TRUNCATE TABLE validation_schedule_request_log CASCADE`);
    console.log("✅ Truncated validation_schedule_request_log table");

    // Truncate the validation_schedule_request table
    await db.execute(sql`TRUNCATE TABLE validation_schedule_request CASCADE`);
    console.log("✅ Truncated validation_schedule_request table");

    // Reset the running_number for 'vsr' module to 0
    const existing = await db.query.customNumbering.findFirst({
      where: eq(schema.customNumbering.module, "vsr"),
    });

    if (existing) {
      await db
        .update(schema.customNumbering)
        .set({ runningNumber: 0 })
        .where(eq(schema.customNumbering.module, "vsr"));
      console.log("✅ Reset VSR running number to 0");
    } else {
      // If the module doesn't exist, create it with running_number = 0
      await db.insert(schema.customNumbering).values({
        module: "vsr",
        runningNumber: 0,
      });
      console.log("✅ Created VSR module entry with running number 0");
    }

    console.log("\n✅ Successfully truncated VSR table and reset running number!");
  } catch (error) {
    console.error("❌ Error truncating VSR table:", error);
    throw error;
  }
}

main()
  .catch((error) => {
    console.error("Error:", error);
    process.exit(1);
  })
  .finally(() => {
    process.exit(0);
  });

