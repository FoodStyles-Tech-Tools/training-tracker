import "dotenv/config";
import { eq, sql } from "drizzle-orm";

import { db, schema } from "../db";

async function main() {
  console.log("Truncating training_request table and resetting TR running number...");

  try {
    // Truncate the training_request table
    await db.execute(sql`TRUNCATE TABLE training_request CASCADE`);
    console.log("✅ Truncated training_request table");

    // Reset the running_number for 'tr' module to 0
    const existing = await db.query.customNumbering.findFirst({
      where: eq(schema.customNumbering.module, "tr"),
    });

    if (existing) {
      await db
        .update(schema.customNumbering)
        .set({ runningNumber: 0 })
        .where(eq(schema.customNumbering.module, "tr"));
      console.log("✅ Reset TR running number to 0");
    } else {
      // If the module doesn't exist, create it with running_number = 0
      await db.insert(schema.customNumbering).values({
        module: "tr",
        runningNumber: 0,
      });
      console.log("✅ Created TR module entry with running number 0");
    }

    console.log("\n✅ Successfully truncated TR table and reset running number!");
  } catch (error) {
    console.error("❌ Error truncating TR table:", error);
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

