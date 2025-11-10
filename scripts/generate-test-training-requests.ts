/**
 * Script to generate artificial training request data for testing
 * This will create training requests with:
 * - Various statuses (0-7)
 * - Different response due dates (overdue, due in 24h, due in 3d, future)
 * - Some blocked requests
 * - Various requested dates
 */

import "dotenv/config";
import { drizzle } from "drizzle-orm/node-postgres";
import { eq, sql } from "drizzle-orm";
import { Pool } from "pg";
import * as schema from "@/db/schema";
import { env } from "@/env";

const pool = new Pool({
  connectionString: env.DATABASE_URL,
  max: 1,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000,
});

const db = drizzle(pool, { schema });

async function generateTrId(): Promise<string> {
  // Get or create custom_numbering entry for "tr"
  const existing = await db.query.customNumbering.findFirst({
    where: eq(schema.customNumbering.module, "tr"),
  });

  if (existing) {
    // Increment and update
    const newNumber = existing.runningNumber + 1;
    await db
      .update(schema.customNumbering)
      .set({ runningNumber: newNumber })
      .where(eq(schema.customNumbering.module, "tr"));
    return `TR${newNumber.toString().padStart(2, "0")}`;
  } else {
    // Create new entry
    await db.insert(schema.customNumbering).values({
      module: "tr",
      runningNumber: 1,
    });
    return "TR01";
  }
}

async function generateTestTrainingRequests() {
  try {
    console.log("Generating test training request data...");

    // Get users (learners)
    const users = await db.query.users.findMany({
      limit: 20, // Get up to 20 users
    });

    if (users.length === 0) {
      throw new Error("No users found in database. Please create users first.");
    }

    // Get competency levels (exclude deleted competency levels)
    const allCompetencyLevels = await db.query.competencyLevels.findMany({
      where: eq(schema.competencyLevels.isDeleted, false),
      with: {
        competency: true,
      },
    });

    // Filter out levels where competency is deleted or null
    const validCompetencyLevels = allCompetencyLevels.filter(
      (level) => level.competency && !level.competency.isDeleted
    );

    if (validCompetencyLevels.length === 0) {
      throw new Error("No valid (non-deleted) competency levels found in database. Please create competencies first.");
    }

    console.log(`Found ${users.length} users and ${validCompetencyLevels.length} valid competency levels`);

    const now = new Date();
    const testData = [
      // Overdue requests (red rows)
      {
        status: 0, // Not Started
        daysAgo: 5,
        isBlocked: false,
        description: "Overdue - Not Started",
      },
      {
        status: 1, // Looking for trainer
        daysAgo: 3,
        isBlocked: false,
        description: "Overdue - Looking for trainer",
      },
      {
        status: 3, // No batch match
        daysAgo: 7,
        isBlocked: false,
        description: "Overdue - No batch match (red row)",
      },
      {
        status: 2, // In Queue
        daysAgo: 2,
        isBlocked: false,
        description: "Overdue - In Queue (yellow row)",
      },

      // Due in 24h (orange button)
      {
        status: 0, // Not Started
        hoursFromNow: 12,
        isBlocked: false,
        description: "Due in 24h - Not Started",
      },
      {
        status: 1, // Looking for trainer
        hoursFromNow: 18,
        isBlocked: false,
        description: "Due in 24h - Looking for trainer",
      },

      // Due in 3d (amber button)
      {
        status: 2, // In Queue
        daysFromNow: 1,
        isBlocked: false,
        description: "Due in 3d - In Queue (yellow row)",
      },
      {
        status: 0, // Not Started
        daysFromNow: 2,
        isBlocked: false,
        description: "Due in 3d - Not Started",
      },
      {
        status: 1, // Looking for trainer
        daysFromNow: 2.5,
        isBlocked: false,
        description: "Due in 3d - Looking for trainer",
      },

      // Future dates
      {
        status: 4, // In Progress
        daysFromNow: 5,
        isBlocked: false,
        description: "Future - In Progress",
      },
      {
        status: 5, // Sessions Completed
        daysFromNow: 7,
        isBlocked: false,
        description: "Future - Sessions Completed",
      },
      {
        status: 6, // On Hold
        daysFromNow: 10,
        isBlocked: false,
        description: "Future - On Hold",
      },
      {
        status: 7, // Drop Off
        daysFromNow: 14,
        isBlocked: false,
        description: "Future - Drop Off",
      },

      // Blocked requests
      {
        status: 0, // Not Started
        daysFromNow: 3,
        isBlocked: true,
        blockedReason: "Waiting for documentation",
        description: "Blocked - Not Started",
      },
      {
        status: 1, // Looking for trainer
        daysFromNow: 5,
        isBlocked: true,
        blockedReason: "Pending approval",
        description: "Blocked - Looking for trainer",
      },
    ];

    let created = 0;
    let skipped = 0;

    for (const testItem of testData) {
      // Pick random user and competency level
      const randomUser = users[Math.floor(Math.random() * users.length)];
      const randomLevel = validCompetencyLevels[Math.floor(Math.random() * validCompetencyLevels.length)];

      // Check if this user already has a request for this competency level
      const existing = await db.query.trainingRequest.findFirst({
        where: (tr, { and, eq }) =>
          and(
            eq(tr.learnerUserId, randomUser.id),
            eq(tr.competencyLevelId, randomLevel.id),
          ),
      });

      if (existing) {
        skipped++;
        continue;
      }

      // Calculate requested date
      let requestedDate: Date;
      if (testItem.daysAgo) {
        requestedDate = new Date(now);
        requestedDate.setDate(requestedDate.getDate() - testItem.daysAgo);
      } else if (testItem.hoursFromNow) {
        requestedDate = new Date(now);
        requestedDate.setHours(requestedDate.getHours() - testItem.hoursFromNow);
      } else {
        requestedDate = new Date(now);
        requestedDate.setDate(requestedDate.getDate() - (testItem.daysFromNow || 0));
      }

      // Calculate response due date (requested date + 1 day, or adjust based on test data)
      let responseDue: Date;
      if (testItem.daysAgo) {
        // For overdue items, response due is in the past (requested date was daysAgo, so response due is daysAgo - 1)
        responseDue = new Date(now);
        responseDue.setDate(responseDue.getDate() - (testItem.daysAgo - 1));
      } else if (testItem.hoursFromNow) {
        // For items due in 24h, set response due to be hoursFromNow from now
        responseDue = new Date(now);
        responseDue.setHours(responseDue.getHours() + testItem.hoursFromNow);
      } else if (testItem.daysFromNow) {
        // For items due in 3d or future, set response due accordingly
        responseDue = new Date(now);
        responseDue.setDate(responseDue.getDate() + testItem.daysFromNow);
      } else {
        // Default: requested date + 1 day
        responseDue = new Date(requestedDate);
        responseDue.setDate(responseDue.getDate() + 1);
      }

      // Generate TR ID
      const trId = await generateTrId();

      // Create training request
      await db.insert(schema.trainingRequest).values({
        trId,
        requestedDate,
        learnerUserId: randomUser.id,
        competencyLevelId: randomLevel.id,
        status: testItem.status,
        responseDue,
        isBlocked: testItem.isBlocked,
        blockedReason: testItem.blockedReason || null,
        notes: `Test data: ${testItem.description}`,
      });

      created++;
      console.log(`✓ Created ${trId} - ${testItem.description}`);
    }

    console.log(`\n✓ Generated ${created} training requests`);
    if (skipped > 0) {
      console.log(`⚠ Skipped ${skipped} requests (duplicate user/competency level combinations)`);
    }
    console.log("\nTest data includes:");
    console.log("  - Overdue requests (should show in red rows)");
    console.log("  - Due in 24h requests (orange button)");
    console.log("  - Due in 3d requests (amber button)");
    console.log("  - Blocked requests (red button)");
    console.log("  - Various statuses (0-7)");

    // Generate random test data with response due dates between today and November 18
    console.log("\n--- Generating random test data ---");
    const november18 = new Date("2025-11-18");
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    november18.setHours(23, 59, 59, 999);

    const randomTestCount = 20; // Generate 20 random requests
    let randomCreated = 0;
    let randomSkipped = 0;

    for (let i = 0; i < randomTestCount; i++) {
      // Pick random user and competency level
      const randomUser = users[Math.floor(Math.random() * users.length)];
      const randomLevel = validCompetencyLevels[Math.floor(Math.random() * validCompetencyLevels.length)];

      // Check if this user already has a request for this competency level
      const existing = await db.query.trainingRequest.findFirst({
        where: (tr, { and, eq }) =>
          and(
            eq(tr.learnerUserId, randomUser.id),
            eq(tr.competencyLevelId, randomLevel.id),
          ),
      });

      if (existing) {
        randomSkipped++;
        continue;
      }

      // Random requested date (between 30 days ago and today)
      const requestedDate = new Date(today);
      requestedDate.setDate(requestedDate.getDate() - Math.floor(Math.random() * 30));

      // Random response due date between today and November 18
      const daysDiff = Math.floor((november18.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
      const randomDays = Math.floor(Math.random() * (daysDiff + 1));
      const responseDue = new Date(today);
      responseDue.setDate(responseDue.getDate() + randomDays);

      // Random status (0-7)
      const randomStatus = Math.floor(Math.random() * 8);

      // Random blocked status (20% chance)
      const isBlocked = Math.random() < 0.2;
      const blockedReason = isBlocked ? "Random test data - blocked" : null;

      // Generate TR ID
      const trId = await generateTrId();

      // Create training request
      await db.insert(schema.trainingRequest).values({
        trId,
        requestedDate,
        learnerUserId: randomUser.id,
        competencyLevelId: randomLevel.id,
        status: randomStatus,
        responseDue,
        isBlocked,
        blockedReason,
        notes: `Random test data - Response due: ${responseDue.toISOString().split('T')[0]}`,
      });

      randomCreated++;
      if (randomCreated % 5 === 0) {
        console.log(`✓ Created ${randomCreated} random training requests...`);
      }
    }

    console.log(`\n✓ Generated ${randomCreated} random training requests`);
    if (randomSkipped > 0) {
      console.log(`⚠ Skipped ${randomSkipped} random requests (duplicate user/competency level combinations)`);
    }
    console.log(`  - Response due dates randomized between ${today.toISOString().split('T')[0]} and ${november18.toISOString().split('T')[0]}`);
    console.log(`  - Random statuses (0-7)`);
    console.log(`  - Random blocked status (20% chance)`);
  } catch (error) {
    console.error("✗ Generation failed:", error);
    throw error;
  } finally {
    await pool.end();
  }
}

generateTestTrainingRequests()
  .then(() => {
    console.log("Done!");
    process.exit(0);
  })
  .catch((error) => {
    console.error("Error:", error);
    process.exit(1);
  });

