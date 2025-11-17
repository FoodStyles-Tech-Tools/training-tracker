import "dotenv/config";
import { eq, sql } from "drizzle-orm";

import { db, schema } from "../db";

async function main() {
  console.log("Truncating validation_project_approval table and resetting VPA running number...");

  try {
    // Truncate the validation_project_approval_log table first (if it exists)
    await db.execute(sql`TRUNCATE TABLE validation_project_approval_log CASCADE`);
    console.log("✅ Truncated validation_project_approval_log table");

    // Truncate the validation_project_approval table
    await db.execute(sql`TRUNCATE TABLE validation_project_approval CASCADE`);
    console.log("✅ Truncated validation_project_approval table");

    // Reset the running_number for 'vpa' module to 0
    const existing = await db.query.customNumbering.findFirst({
      where: eq(schema.customNumbering.module, "vpa"),
    });

    if (existing) {
      await db
        .update(schema.customNumbering)
        .set({ runningNumber: 0 })
        .where(eq(schema.customNumbering.module, "vpa"));
      console.log("✅ Reset VPA running number to 0");
    } else {
      // If the module doesn't exist, create it with running_number = 0
      await db.insert(schema.customNumbering).values({
        module: "vpa",
        runningNumber: 0,
      });
      console.log("✅ Created VPA module entry with running number 0");
    }

    console.log("\n✅ Successfully truncated VPA table and reset running number!");
  } catch (error) {
    console.error("❌ Error truncating VPA table:", error);
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

