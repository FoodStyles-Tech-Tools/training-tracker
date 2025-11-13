import { db, schema } from "@/db";
import { eq } from "drizzle-orm";

async function clearVSRFollowUpDate(vsrId: string) {
  try {
    // Find VSR by vsrId
    const vsr = await db.query.validationScheduleRequest.findFirst({
      where: eq(schema.validationScheduleRequest.vsrId, vsrId),
    });

    if (!vsr) {
      console.error(`VSR with ID ${vsrId} not found`);
      process.exit(1);
    }

    console.log(`Found VSR: ${vsr.vsrId} (UUID: ${vsr.id})`);
    console.log(`Current followUpDate: ${vsr.followUpDate || "null"}`);

    // Update followUpDate to null
    await db
      .update(schema.validationScheduleRequest)
      .set({
        followUpDate: null,
        updatedAt: new Date(),
      })
      .where(eq(schema.validationScheduleRequest.id, vsr.id));

    console.log(`Successfully cleared followUpDate for ${vsrId}`);
    process.exit(0);
  } catch (error) {
    console.error("Error clearing follow up date:", error);
    process.exit(1);
  }
}

// Get VSR ID from command line argument
const vsrId = process.argv[2];
if (!vsrId) {
  console.error("Usage: tsx scripts/clear-vsr-followup-date.ts <VSR_ID>");
  console.error("Example: tsx scripts/clear-vsr-followup-date.ts VSR01");
  process.exit(1);
}

clearVSRFollowUpDate(vsrId);

