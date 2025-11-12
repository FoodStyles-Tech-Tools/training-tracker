/**
 * Script to delete VSR02
 * Run with: npx tsx scripts/delete-vsr02.ts
 */

import { eq } from "drizzle-orm";
import { db, schema } from "../src/db";

async function deleteVSR02() {
  try {
    // Find VSR02
    const vsr = await db.query.validationScheduleRequest.findFirst({
      where: eq(schema.validationScheduleRequest.vsrId, "VSR02"),
    });

    if (!vsr) {
      console.log("VSR02 not found. It may have already been deleted.");
      return;
    }

    console.log(`Found VSR02 with ID: ${vsr.id}`);

    // Delete VSR logs first (cascade should handle this, but being explicit)
    await db
      .delete(schema.validationScheduleRequestLog)
      .where(eq(schema.validationScheduleRequestLog.vsrId, "VSR02"));

    // Delete VSR
    await db
      .delete(schema.validationScheduleRequest)
      .where(eq(schema.validationScheduleRequest.vsrId, "VSR02"));

    console.log("VSR02 and its logs have been deleted successfully.");
  } catch (error) {
    console.error("Error deleting VSR02:", error);
    throw error;
  } finally {
    process.exit(0);
  }
}

deleteVSR02();

