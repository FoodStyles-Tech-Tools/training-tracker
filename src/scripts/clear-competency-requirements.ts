import { db, schema } from "../db";

/**
 * Script to clear all competency requirements from the database.
 * Since default requirements are now handled programmatically,
 * we only need to store manually selected requirements (from different competencies).
 * This script clears all existing requirements to start fresh.
 */
async function main() {
  console.log("Starting to clear all competency requirements...");

  // Get count before deletion
  const allRequirements = await db.query.competencyRequirements.findMany();
  const totalCount = allRequirements.length;

  if (totalCount === 0) {
    console.log("No requirements found. Nothing to clear.");
    process.exit(0);
  }

  console.log(`Found ${totalCount} requirements to delete`);

  // Delete all requirements
  await db.delete(schema.competencyRequirements);

  console.log(`\n✓ Successfully cleared ${totalCount} requirements`);
  console.log("\nDone!");
  console.log("\nNote: Default requirements (Competent requires Basic, Advanced requires Basic and Competent)");
  console.log("are now handled programmatically and don't need to be stored in the database.");
}

main()
  .catch((error) => {
    console.error("Fatal error:", error);
    process.exit(1);
  })
  .finally(() => {
    process.exit(0);
  });

