import { eq, sql } from "drizzle-orm";

import { db, schema } from "../db";
import { env } from "../env";

/**
 * Generate the next VSR ID (e.g., VSR01, VSR02, etc.)
 */
async function generateVsrId(): Promise<string> {
  const existing = await db.query.customNumbering.findFirst({
    where: eq(schema.customNumbering.module, "vsr"),
  });

  if (!existing) {
    await db.insert(schema.customNumbering).values({
      module: "vsr",
      runningNumber: 0,
    });
  }

  const result = await db
    .update(schema.customNumbering)
    .set({
      runningNumber: sql`${schema.customNumbering.runningNumber} + 1`,
    })
    .where(eq(schema.customNumbering.module, "vsr"))
    .returning({ runningNumber: schema.customNumbering.runningNumber });

  if (!result[0]) {
    throw new Error("Failed to generate VSR ID");
  }

  const vsrNumber = result[0].runningNumber;
  return `VSR${vsrNumber.toString().padStart(2, "0")}`;
}

async function main() {
  console.log("Generating VSR waitlist test data...");

  // Get existing users with @example.com email
  const existingUsers = await db.query.users.findMany({
    where: (users, { like }) => like(users.email, "%@example.com"),
  });

  if (existingUsers.length === 0) {
    console.log("No users with @example.com email found. Please create users first.");
    return;
  }

  const learnerIds = existingUsers.map((user) => user.id);
  console.log(`Found ${learnerIds.length} users with @example.com email`);

  // Get existing competencies and levels
  const competencies = await db.query.competencies.findMany({
    where: eq(schema.competencies.isDeleted, false),
    with: {
      levels: {
        where: eq(schema.competencyLevels.isDeleted, false),
      },
    },
  });

  if (competencies.length === 0) {
    console.log("No competencies found. Please create competencies first.");
    return;
  }

  // Flatten all competency levels
  const allLevels: Array<{ id: string; name: string; competencyName: string }> = [];
  for (const comp of competencies) {
    for (const level of comp.levels) {
      allLevels.push({
        id: level.id,
        name: level.name,
        competencyName: comp.name,
      });
    }
  }

  if (allLevels.length === 0) {
    console.log("No competency levels found. Please create competency levels first.");
    return;
  }

  console.log(`Found ${allLevels.length} competency levels across ${competencies.length} competencies`);

  // VSR statuses for waitlist: 0 (Pending Validation), 1 (Pending Re-validation), 2 (Validation Scheduled)
  const vsrWaitlistStatuses = [0, 1, 2];
  const vsrStatusLabels = env.VSR_STATUS.split(",").map((s) => s.trim());

  // Create VSRs with different statuses and dates
  // Start from 30 days ago and go forward, but never exceed today
  const today = new Date();
  today.setHours(0, 0, 0, 0); // Set to start of day for consistent comparison
  const baseDate = new Date(today);
  baseDate.setDate(baseDate.getDate() - 30);

  let vsrCount = 0;
  const vsrStatusCounts: Record<number, number> = { 0: 0, 1: 0, 2: 0 };

  // Create 3-5 VSRs per status
  for (const status of vsrWaitlistStatuses) {
    const requestsPerStatus = Math.floor(Math.random() * 3) + 3; // 3-5 requests

    for (let i = 0; i < requestsPerStatus; i++) {
      const requestedDate = new Date(baseDate);
      requestedDate.setDate(requestedDate.getDate() + vsrCount);
      requestedDate.setHours(0, 0, 0, 0); // Set to start of day
      
      // Ensure date doesn't exceed today
      if (requestedDate > today) {
        requestedDate.setTime(today.getTime());
      }

      const randomLearnerId = learnerIds[Math.floor(Math.random() * learnerIds.length)]!;
      const randomLevel = allLevels[Math.floor(Math.random() * allLevels.length)]!;

      // Check if this learner already has a VSR for this level with this status
      const existing = await db.query.validationScheduleRequest.findFirst({
        where: (vsr, { and, eq: eqOp }) =>
          and(
            eqOp(vsr.learnerUserId, randomLearnerId),
            eqOp(vsr.competencyLevelId, randomLevel.id),
            eqOp(vsr.status, status),
          ),
      });

      if (existing) {
        // Skip if already exists
        continue;
      }

      const vsrId = await generateVsrId();

      // Calculate response due date (requested date + 1 day) for status 0
      const responseDue = status === 0 ? new Date(requestedDate) : null;
      if (responseDue) {
        responseDue.setDate(responseDue.getDate() + 1);
      }

      // Add scheduled date for status 2 (Validation Scheduled)
      const scheduledDate = status === 2 ? new Date(requestedDate) : null;
      if (scheduledDate) {
        scheduledDate.setDate(scheduledDate.getDate() + Math.floor(Math.random() * 7) + 1); // 1-7 days from requested date
      }

      const vsrData = {
        vsrId,
        requestedDate,
        learnerUserId: randomLearnerId,
        competencyLevelId: randomLevel.id,
        status,
        description: `Test validation schedule request for ${randomLevel.competencyName} - ${randomLevel.name} level`,
        responseDue,
        scheduledDate,
      };

      await db.insert(schema.validationScheduleRequest).values(vsrData);
      vsrCount++;
      vsrStatusCounts[status] = (vsrStatusCounts[status] || 0) + 1;
    }
  }

  console.log("\n✅ VSR waitlist test data generated successfully!");
  console.log(`\nTotal VSRs created: ${vsrCount}`);
  console.log("VSR Status breakdown:");
  for (const status of vsrWaitlistStatuses) {
    const label = vsrStatusLabels[status] || `Status ${status}`;
    console.log(`  ${label}: ${vsrStatusCounts[status] || 0} requests`);
  }

  console.log("\nRequests are sorted by oldest date first (as per waitlist requirements)");
}

main()
  .catch((error) => {
    console.error("Error generating VSR waitlist test data:", error);
    process.exit(1);
  })
  .finally(() => {
    process.exit(0);
  });

