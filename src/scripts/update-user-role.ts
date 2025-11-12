import "dotenv/config";
import { eq } from "drizzle-orm";

import { db, schema } from "../db";

async function updateUserRole(email: string, roleName: string) {
  try {
    // Find the role
    const role = await db.query.rolesList.findFirst({
      where: eq(schema.rolesList.roleName, roleName),
    });

    if (!role) {
      throw new Error(`Role "${roleName}" not found`);
    }

    // Find the user
    const user = await db.query.users.findFirst({
      where: eq(schema.users.email, email),
    });

    if (!user) {
      throw new Error(`User with email "${email}" not found`);
    }

    // Update the user's role
    await db
      .update(schema.users)
      .set({
        roleId: role.id,
        updatedAt: new Date(),
      })
      .where(eq(schema.users.id, user.id));

    console.log(`✓ Successfully updated ${user.name} (${email}) to ${roleName} role`);
    console.log(`  User ID: ${user.id}`);
    console.log(`  Role ID: ${role.id}`);
  } catch (error) {
    console.error("Error updating user role:", error);
    throw error;
  }
}

async function main() {
  const emails = [
    "agra.bimantara@foodstyles.com",
    "marc.comia@foodstyles.com",
    "karl.escobar@foodstyles.com",
    "godfrey.laloma@foodstyles.com",
    "romand.ricarro@foodstyles.com",
    "samantha.lutz@foodstyles.com",
    "jimena.curiel@foodstyles.com",
    "mesa.danglert@foodstyles.com",
    "sarita.lee@foodstyles.com",
    "christina.wakim@foodstyles.com",
    "santiago.vittor@foodstyles.com",
    "maricruz.iniguez@foodstyles.com",
    "pedro.galvao@foodstyles.com",
    "alma.dellaere@foodstyles.com",
    "defne.bayar@foodstyles.com",
  ];
  const roleName = "Trainer";

  console.log(`Updating ${emails.length} users to ${roleName} role...\n`);

  for (const email of emails) {
    await updateUserRole(email, roleName);
  }

  console.log("\n✓ All updates completed!");
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => {
    process.exit(0);
  });

