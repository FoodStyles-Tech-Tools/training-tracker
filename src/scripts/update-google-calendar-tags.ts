import "dotenv/config";
import { eq } from "drizzle-orm";

import { db, schema } from "../db";

interface UserCalendarTag {
  email: string;
  calendarTag: string;
}

async function updateGoogleCalendarTag(email: string, calendarTag: string) {
  try {
    // Find the user
    const user = await db.query.users.findFirst({
      where: eq(schema.users.email, email),
    });

    if (!user) {
      console.error(`User with email "${email}" not found`);
      return false;
    }

    // Update the user's googleCalendarTag
    await db
      .update(schema.users)
      .set({
        googleCalendarTag: calendarTag,
        updatedAt: new Date(),
      })
      .where(eq(schema.users.id, user.id));

    console.log(`✓ Updated ${user.name} (${email})`);
    return true;
  } catch (error) {
    console.error(`Error updating ${email}:`, error);
    return false;
  }
}

async function main() {
  const users: UserCalendarTag[] = [
    {
      email: "christina.wakim@foodstyles.com",
      calendarTag: "AcZssZ1UlQQ80EAD45au5EzBoni-80DSeMRvpjuHQI95ShHW7PDmHxgqMQMPjsXJuXl6xOoCmXYe3CG7",
    },
    {
      email: "goktug.yagmur@foodstyles.com",
      calendarTag: "AcZssZ12vXTUq555nwVm3y_NP13puoiBC-0Wha7XaREK5EIyU88w57qSSlmb8Jhl8aQgzPMSabnO6Itd",
    },
    {
      email: "phebe.kristyanti@foodstyles.com",
      calendarTag: "AcZssZ3IdGLMQZ0PT6bcvgvNCoIw82Dj5lcaijyQmB6bwe0Y4lL4kO8F7f-mCKdTwFHpj4TncVrg51N5",
    },
    {
      email: "tisha@foodstyles.com",
      calendarTag: "AcZssZ0xmFIgRRfoWRjXIgbxRShvpq1ffDrlb8ZtY6o5FoTgffdyZbzb3csVwVoo0L6B37-c6PA-Zibq",
    },
    {
      email: "lidiia@foodstyles.com",
      calendarTag: "AcZssZ0CpfRQpaj_F4ZI0352mIPbIWcgGTQvu0gQTc_AvU5Q2UTt7EanQ9chsHMuLB6qysyvqPHmxc2G",
    },
  ];

  console.log("Updating Google Calendar tags...\n");

  let successCount = 0;
  let failCount = 0;

  for (const user of users) {
    if (!user.calendarTag) {
      console.error(`✗ Missing calendar tag for ${user.email}`);
      failCount++;
      continue;
    }

    const success = await updateGoogleCalendarTag(user.email, user.calendarTag);
    if (success) {
      successCount++;
    } else {
      failCount++;
    }
  }

  console.log("\nUpdate completed!");
  console.log(`  Success: ${successCount}`);
  console.log(`  Failed: ${failCount}`);
  console.log(`  Total: ${users.length}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => {
    process.exit(0);
  });

