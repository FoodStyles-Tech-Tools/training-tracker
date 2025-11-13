import { eq } from "drizzle-orm";

import { db, schema } from "../db";

/**
 * Script to inject default competency requirements for all existing competencies.
 * 
 * Rules:
 * - Competent level requires Basic level (of the same competency)
 * - Advanced level requires Basic level (of the same competency)
 * - Advanced level requires Competent level (of the same competency)
 */
async function main() {
  console.log("Starting to inject default competency requirements...");

  // Get all competencies (not deleted)
  const competencies = await db.query.competencies.findMany({
    where: eq(schema.competencies.isDeleted, false),
    with: {
      levels: {
        where: eq(schema.competencyLevels.isDeleted, false),
      },
      requirements: true,
    },
  });

  console.log(`Found ${competencies.length} competencies to process`);

  let totalInserted = 0;
  let totalSkipped = 0;
  let totalErrors = 0;

  for (const competency of competencies) {
    try {
      // Create a map of level name to level ID
      const levelMap = new Map<string, string>();
      for (const level of competency.levels) {
        levelMap.set(level.name, level.id);
      }

      const basicLevelId = levelMap.get("Basic");
      const competentLevelId = levelMap.get("Competent");
      const advancedLevelId = levelMap.get("Advanced");

      // Determine which default requirements should be added
      const defaultRequirementLevelIds: string[] = [];

      // Competent requires Basic
      if (competentLevelId && basicLevelId) {
        defaultRequirementLevelIds.push(basicLevelId);
      }

      // Advanced requires Basic
      if (advancedLevelId && basicLevelId) {
        defaultRequirementLevelIds.push(basicLevelId);
      }

      // Advanced requires Competent
      if (advancedLevelId && competentLevelId) {
        defaultRequirementLevelIds.push(competentLevelId);
      }

      if (defaultRequirementLevelIds.length === 0) {
        console.log(`  Skipping ${competency.name} - no default requirements needed`);
        totalSkipped++;
        continue;
      }

      // Get existing requirement level IDs to avoid duplicates
      const existingRequirementLevelIds = new Set(
        competency.requirements.map((r) => r.requiredCompetencyLevelId)
      );

      // Filter out requirements that already exist
      const newRequirementLevelIds = defaultRequirementLevelIds.filter(
        (levelId) => !existingRequirementLevelIds.has(levelId)
      );

      if (newRequirementLevelIds.length === 0) {
        console.log(`  Skipping ${competency.name} - all default requirements already exist`);
        totalSkipped++;
        continue;
      }

      // Insert new requirements
      await db.insert(schema.competencyRequirements).values(
        newRequirementLevelIds.map((levelId) => ({
          competencyId: competency.id,
          requiredCompetencyLevelId: levelId,
        }))
      );

      console.log(
        `  ✓ ${competency.name}: Added ${newRequirementLevelIds.length} requirement(s) ` +
        `(${defaultRequirementLevelIds.length - newRequirementLevelIds.length} already existed)`
      );
      totalInserted += newRequirementLevelIds.length;
    } catch (error) {
      console.error(`  ✗ Error processing ${competency.name}:`, error);
      totalErrors++;
    }
  }

  console.log("\n=== Summary ===");
  console.log(`Total competencies processed: ${competencies.length}`);
  console.log(`Requirements inserted: ${totalInserted}`);
  console.log(`Competencies skipped: ${totalSkipped}`);
  console.log(`Errors: ${totalErrors}`);
  console.log("\nDone!");
}

main()
  .catch((error) => {
    console.error("Fatal error:", error);
    process.exit(1);
  })
  .finally(() => {
    process.exit(0);
  });

