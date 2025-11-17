import { eq, sql } from "drizzle-orm";

import { db, schema } from "../db";
import { env } from "../env";

/**
 * Generate the next TR ID (e.g., TR01, TR02, etc.)
 */
async function generateTrId(): Promise<string> {
  const existing = await db.query.customNumbering.findFirst({
    where: eq(schema.customNumbering.module, "tr"),
  });

  if (!existing) {
    await db.insert(schema.customNumbering).values({
      module: "tr",
      runningNumber: 0,
    });
  }

  const result = await db
    .update(schema.customNumbering)
    .set({
      runningNumber: sql`${schema.customNumbering.runningNumber} + 1`,
    })
    .where(eq(schema.customNumbering.module, "tr"))
    .returning({ runningNumber: schema.customNumbering.runningNumber });

  if (!result[0]) {
    throw new Error("Failed to generate TR ID");
  }

  const trNumber = result[0].runningNumber;
  return `TR${trNumber.toString().padStart(2, "0")}`;
}


async function main() {
  console.log("Generating waitlist test data...");

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

  // Statuses for waitlist: 1 (Looking for trainer), 2 (In Queue), 3 (No batch match), 6 (On Hold), 7 (Drop Off)
  const waitlistStatuses = [1, 2, 3, 6, 7];
  const statusLabels = env.TRAINING_REQUEST_STATUS.split(",").map((s) => s.trim());

  // Create training requests with different statuses and dates
  // Start from 30 days ago and go forward, but never exceed today
  const today = new Date();
  today.setHours(0, 0, 0, 0); // Set to start of day for consistent comparison
  const baseDate = new Date(today);
  baseDate.setDate(baseDate.getDate() - 30);

  let requestCount = 0;
  const statusCounts: Record<number, number> = { 1: 0, 2: 0, 3: 0, 6: 0, 7: 0 };

  // Create 3-5 requests per status
  for (const status of waitlistStatuses) {
    const requestsPerStatus = Math.floor(Math.random() * 3) + 3; // 3-5 requests

    for (let i = 0; i < requestsPerStatus; i++) {
      const requestedDate = new Date(baseDate);
      requestedDate.setDate(requestedDate.getDate() + requestCount);
      requestedDate.setHours(0, 0, 0, 0); // Set to start of day
      
      // Ensure date doesn't exceed today
      if (requestedDate > today) {
        requestedDate.setTime(today.getTime());
      }

      const randomLearnerId = learnerIds[Math.floor(Math.random() * learnerIds.length)]!;
      const randomLevel = allLevels[Math.floor(Math.random() * allLevels.length)]!;

      // Check if this learner already has a request for this level
      const existing = await db.query.trainingRequest.findFirst({
        where: (tr, { and, eq: eqOp }) =>
          and(
            eqOp(tr.learnerUserId, randomLearnerId),
            eqOp(tr.competencyLevelId, randomLevel.id),
          ),
      });

      if (existing) {
        // Skip if already exists
        continue;
      }

      const trId = await generateTrId();

      // Add status-specific fields
      const baseRequestData = {
        trId,
        requestedDate,
        learnerUserId: randomLearnerId,
        competencyLevelId: randomLevel.id,
        status,
      };

      // Add status-specific optional fields
      let requestData = baseRequestData;
      if (status === 6) {
        // On Hold
        requestData = {
          ...baseRequestData,
          onHoldBy: Math.floor(Math.random() * 2) as 0 | 1, // 0 or 1
          onHoldReason: [
            "Waiting for learner availability",
            "Trainer unavailable",
            "Scheduling conflict",
            "Pending approval",
          ][Math.floor(Math.random() * 4)]!,
        };
      } else if (status === 7) {
        // Drop Off
        requestData = {
          ...baseRequestData,
          dropOffReason: [
            "Learner withdrew",
            "No longer interested",
            "Schedule conflict",
            "Personal reasons",
          ][Math.floor(Math.random() * 4)]!,
        };
      } else if (status === 2) {
        // In Queue
        const inQueueDate = new Date(requestedDate);
        inQueueDate.setDate(requestedDate.getDate() + Math.floor(Math.random() * 5));
        requestData = {
          ...baseRequestData,
          inQueueDate,
        };
      }

      await db.insert(schema.trainingRequest).values(requestData);
      requestCount++;
      statusCounts[status] = (statusCounts[status] || 0) + 1;
    }
  }

  console.log("\n✅ Waitlist test data generated successfully!");
  console.log(`Total training requests created: ${requestCount}`);
  console.log("\nStatus breakdown:");
  for (const status of waitlistStatuses) {
    const label = statusLabels[status] || `Status ${status}`;
    console.log(`  ${label}: ${statusCounts[status] || 0} requests`);
  }
  console.log("\nRequests are sorted by oldest date first (as per waitlist requirements)");
}

main()
  .catch((error) => {
    console.error("Error generating waitlist test data:", error);
    process.exit(1);
  })
  .finally(() => {
    process.exit(0);
  });

