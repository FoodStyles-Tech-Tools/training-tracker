import { eq, sql } from "drizzle-orm";

import { db, schema } from "../db";
import { env } from "../env";

/**
 * Generate the next VPA ID (e.g., VPA01, VPA02, etc.)
 */
async function generateVpaId(): Promise<string> {
  const existing = await db.query.customNumbering.findFirst({
    where: eq(schema.customNumbering.module, "vpa"),
  });

  if (!existing) {
    await db.insert(schema.customNumbering).values({
      module: "vpa",
      runningNumber: 0,
    });
  }

  const result = await db
    .update(schema.customNumbering)
    .set({
      runningNumber: sql`${schema.customNumbering.runningNumber} + 1`,
    })
    .where(eq(schema.customNumbering.module, "vpa"))
    .returning({ runningNumber: schema.customNumbering.runningNumber });

  if (!result[0]) {
    throw new Error("Failed to generate VPA ID");
  }

  const vpaNumber = result[0].runningNumber;
  return `VPA${vpaNumber.toString().padStart(2, "0")}`;
}

async function main() {
  console.log("Generating VPA waitlist test data...");

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

  // VPA statuses for waitlist: 0 (Pending Validation Project Approval), 3 (Resubmit for Re-validation)
  const vpaWaitlistStatuses = [0, 3];
  const vpaStatusLabels = env.VPA_STATUS.split(",").map((s) => s.trim());

  // Create VPAs with different statuses and dates
  // Start from 30 days ago and go forward, but never exceed today
  const today = new Date();
  today.setHours(0, 0, 0, 0); // Set to start of day for consistent comparison
  const baseDate = new Date(today);
  baseDate.setDate(baseDate.getDate() - 30);

  let vpaCount = 0;
  const vpaStatusCounts: Record<number, number> = { 0: 0, 3: 0 };

  // Create 3-5 VPAs per status
  for (const status of vpaWaitlistStatuses) {
    const requestsPerStatus = Math.floor(Math.random() * 3) + 3; // 3-5 requests

    for (let i = 0; i < requestsPerStatus; i++) {
      const requestedDate = new Date(baseDate);
      requestedDate.setDate(requestedDate.getDate() + vpaCount);
      requestedDate.setHours(0, 0, 0, 0); // Set to start of day
      
      // Ensure date doesn't exceed today
      if (requestedDate > today) {
        requestedDate.setTime(today.getTime());
      }

      const randomLearnerId = learnerIds[Math.floor(Math.random() * learnerIds.length)]!;
      const randomLevel = allLevels[Math.floor(Math.random() * allLevels.length)]!;

      // Check if this learner already has a VPA for this level with this status
      const existing = await db.query.validationProjectApproval.findFirst({
        where: (vpa, { and, eq: eqOp }) =>
          and(
            eqOp(vpa.learnerUserId, randomLearnerId),
            eqOp(vpa.competencyLevelId, randomLevel.id),
            eqOp(vpa.status, status),
          ),
      });

      if (existing) {
        // Skip if already exists
        continue;
      }

      const vpaId = await generateVpaId();

      // Calculate response due date (requested date + 1 day) for status 0
      const responseDue = status === 0 ? new Date(requestedDate) : null;
      if (responseDue) {
        responseDue.setDate(responseDue.getDate() + 1);
      }

      const vpaData = {
        vpaId,
        requestedDate,
        learnerUserId: randomLearnerId,
        competencyLevelId: randomLevel.id,
        status,
        projectDetails: `Test project details for ${randomLevel.competencyName} - ${randomLevel.name} level`,
        responseDue,
      };

      await db.insert(schema.validationProjectApproval).values(vpaData);
      vpaCount++;
      vpaStatusCounts[status] = (vpaStatusCounts[status] || 0) + 1;
    }
  }

  console.log("\n✅ VPA waitlist test data generated successfully!");
  console.log(`\nTotal VPAs created: ${vpaCount}`);
  console.log("VPA Status breakdown:");
  for (const status of vpaWaitlistStatuses) {
    const label = vpaStatusLabels[status] || `Status ${status}`;
    console.log(`  ${label}: ${vpaStatusCounts[status] || 0} requests`);
  }

  console.log("\nRequests are sorted by oldest date first (as per waitlist requirements)");
}

main()
  .catch((error) => {
    console.error("Error generating VPA waitlist test data:", error);
    process.exit(1);
  })
  .finally(() => {
    process.exit(0);
  });

